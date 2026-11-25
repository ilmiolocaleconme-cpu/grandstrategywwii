// Nazioni minori a battaglioni (25/11/2026): base comune generata, catalogo per nazione, template di fanteria 1936, modelli di partenza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MINOR_NATIONS, buildMinorCatalog, buildMinorModules, minorEquipmentGroups, nationSlug } from '../src/data/minorNations.js';
import { validateModules, templateFromComposition } from '../src/data/modules.js';
import { EQUIPMENT_GROUP } from '../src/rules/unitSheet.js';
import { standardInfantryTemplate } from '../src/data/initialEquipment.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const nations = json('nations.json');
const names = Object.fromEntries(nations.map((n) => [n.id, n.name]));
const catalog = json('units/equipment/catalog_minors.json');
const doc = json('units/modules/modules_minors.json');
const rules = json('industry/initial_equipment_rules.json');
const BIG = ['DEU', 'USSR', 'USA', 'GBR', 'FRA', 'ITA', 'JPN'];

test('le nazioni minori sono tutte quelle con riserva > 0 fuori dalle sette grandi', () => {
  const expected = Object.entries(rules.nations).filter(([id, tier]) => rules.tiers[tier].divisions > 0 && !BIG.includes(id)).map(([id]) => id).sort();
  assert.deepEqual([...MINOR_NATIONS].sort(), expected);
  assert.equal(MINOR_NATIONS.length, 58);
});

test('i file su disco coincidono con quelli generati (non modificati a mano)', () => {
  assert.deepEqual(catalog, buildMinorCatalog());
  assert.deepEqual(doc, buildMinorModules(names));
});

test('catalogo: 13 armi per nazione, nazione nel codice, stime dichiarate', () => {
  assert.equal(catalog.entries.length, 58 * 13);
  for (const e of catalog.entries) {
    assert.equal(e.equipment_id.split('-')[1], e.nation);
    assert.equal(e.reliability, 'ESTIMATED');
    assert.match(e.source_note, /Stima di Claude/);
  }
  assert.ok(catalog.entries.some((e) => e.equipment_id === 'INW-MENG-RIFLE'));
});

test('battaglioni validi, ognuno con armi della propria nazione', () => {
  const ids = new Set(catalog.entries.map((e) => e.equipment_id));
  assert.deepEqual(validateModules(doc, { catalogIds: ids }), []);
  assert.equal(doc.modules.length, 58 * 15);
  for (const m of doc.modules) for (const k of Object.keys(m.equipment)) assert.equal(k.split('-')[1], m.nation);
});

test('divisione di fanteria 1936: 14.400 uomini, 36 pezzi da 75, 12 obici da 105, una per nazione', () => {
  assert.equal(doc.compositions.length, 58);
  const bel = templateFromComposition(doc, doc.compositions.find((c) => c.templateId === 'TPL-BEL-INF-1936'));
  assert.equal(bel.manpower.war.value, 14400);
  assert.equal(bel.horses.value, 3880);
  assert.equal(bel.equipment['ART-BEL-GUN75'].value, 36);
  assert.equal(bel.equipment['ART-BEL-HOW105'].value, 12);
  assert.equal(bel.equipment['INW-BEL-RIFLE'].value, 9330);
  assert.equal(doc.compositions.find((c) => c.templateId === 'TPL-IRL-INF-1936').file, 'divisione_fanteria_stato_libero_d_irlanda_1936.json');
  for (const c of doc.compositions) {
    const onDisk = json(`units/templates/${c.file}`);
    assert.deepEqual(onDisk, templateFromComposition(doc, c));
    assert.equal(standardInfantryTemplate([onDisk], c.templateId.split('-')[1], '1936-01-01')?.id, c.templateId); // pronta per la riserva iniziale (fase 2)
  }
});

test('modelli di partenza: montagna, cavalleria e leggera corazzata per ogni nazione', () => {
  assert.equal(doc.presets.length, 58 * 3);
  const ids = new Set(doc.modules.map((m) => m.id));
  for (const p of doc.presets) for (const [id] of p.modules) assert.ok(ids.has(id), `${p.id}: ${id}`);
  assert.ok(doc.presets.some((p) => p.id === 'PRE-POL-ARM-LIGHT'));
});

test('scheda dell\'unità: ogni arma comune ha il suo gruppo', () => {
  const groups = minorEquipmentGroups();
  for (const e of catalog.entries) assert.equal(EQUIPMENT_GROUP[e.equipment_id], groups[e.equipment_id]);
  assert.equal(EQUIPMENT_GROUP['ART-CZE-AT37'], 'anticarro');
  assert.equal(nationSlug('Perù'), 'peru');
});

test('depositi delle nazioni minori: capitale nel catalogo delle città, senza il Mengjiang', () => {
  const depots = json('units/depots.json').nations;
  const missing = MINOR_NATIONS.filter((n) => !depots[n]);
  assert.deepEqual(missing, ['MENG']);
  assert.equal(depots.DNK.province, 'P_DNK_HOVEDSTADEN', 'Copenaghen aggiunta alle città (25/11/2026)');
  assert.equal(depots.BEL.province, 'P_BEL_BRABANT');
  assert.equal(depots.PAN.province, 'P_PAN_PANAMA');
});

test('riserva iniziale: le nazioni minori la ricevono secondo le fasce dalla fanteria comune', () => {
  const eq = json('industry/initial_equipment.json');
  assert.deepEqual(eq.pending, []);
  for (const n of MINOR_NATIONS) assert.equal(eq.nations[n].templateId, `TPL-${n}-INF-1936`);
  assert.equal(eq.nations.CRI.divisions, 1, 'fascia minima');
  assert.equal(eq.nations.ALB.divisions, 2);
  assert.equal(eq.nations.CZE.equipment['ART-CZE-GUN75'], 7 * 36);
});

test('divisioni iniziali (passo 2): numero secondo la fascia, Cina 10, niente Mengjiang, tutte collocate sulla mappa con un template', async () => {
  const { initForcesState } = await import('../src/game/forcesState.js');
  const { MINOR_INFANTRY_1936 } = await import('../src/data/minorNations.js');
  const units = json('units/units.json').units.filter((u) => u.minorBase);
  const count = (n) => units.filter((u) => u.nation === n).length;
  assert.equal(units.length, 230);
  assert.equal(count('CHN'), 10, 'scelta dell\'utente');
  assert.equal(count('POL'), 7); assert.equal(count('ALB'), 2); assert.equal(count('CRI'), 1); assert.equal(count('MENG'), 0);
  assert.ok(MINOR_INFANTRY_1936.length > 0);
  const dep = new Map(json('units/deployment_1936.json').entries.map((e) => [e.unit, e]));
  for (const u of units) assert.ok(dep.get(u.id)?.province.startsWith(`P_${u.nation}_`), `${u.id}: posizione`);
  assert.equal(dep.get('S36-POL-001').province, 'P_POL_WARSAW_VOIVODESHIP', 'la prima nella capitale');
  assert.match(dep.get('S36-POL-002').how, /confine con DEU/);
  assert.match(dep.get('S36-CUB-002').how, /nessuna provincia di confine/, 'isola: tutte nella capitale');
  const templates = doc.compositions.map((c) => json(`units/templates/${c.file}`));
  const { state } = initForcesState({ schema: 7, date: '1936-01-01', forces: { schema: 'forces-v1', initialized: false, divisions: {} } }, { units, templates, ratio: json('units/readiness.json').initialFillRatio.value });
  for (const u of units) assert.ok(state.forces.divisions[u.id], `${u.id} senza istanza`);
});

test('industria minima (passo 2): fucili e cannone da 75 dove c\'è industria, il cannone nella linea limitata della fascia C', () => {
  const ii = json('industry/initial_industry.json');
  const rec = (n) => ii.nations[n].facilities.map((f) => f.recipeId);
  assert.ok(rec('POL').includes('REC-INW-POL-RIFLE') && rec('POL').includes('REC-ART-POL-GUN75'));
  assert.ok(rec('CZE').includes('REC-ART-CZE-GUN75') && rec('CZE').includes('REC-TANK-CZE-LT35'), 'la Cecoslovacchia tiene i suoi carri');
  assert.equal(ii.nations.ARG, undefined, 'senza industria resta in fascia C');
  assert.equal(ii.minorArtillery.recipeByNation.ARG, 'REC-ART-ARG-GUN75');
  assert.equal(ii.minorArtillery.recipeByNation.LUX, undefined, 'le nazioni senza esercito restano sulla ricetta generica');
});
