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

test('depositi delle nazioni minori: capitale nel catalogo delle città, senza Danimarca e Mengjiang', () => {
  const depots = json('units/depots.json').nations;
  const missing = MINOR_NATIONS.filter((n) => !depots[n]);
  assert.deepEqual(missing, ['DNK', 'MENG']);
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
