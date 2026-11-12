// Dotazione d'armi e potenza in battaglia (12/11/2026). Valori DESIGN_DEFAULT di data/units/combat_equipment.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateCombatEquipment, buildCategoryOf, equipmentFill } from '../src/rules/equipmentFill.js';
import { divisionPower, resolveBattleDay } from '../src/rules/combat.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { initForcesState } from '../src/game/forcesState.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = json('units/combat_equipment.json');
const edir = new URL('../data/units/equipment/', import.meta.url);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const categoryOf = buildCategoryOf(catalog);
const cat = { 'equipment.r': 'INDIVIDUAL_WEAPON', 'equipment.mg': 'MACHINE_GUN', 'equipment.how': 'HOWITZER' };
const of = (k) => cat[k] ?? null;

test('configurazione valida; difetti segnalati', () => {
  assert.deepEqual(validateCombatEquipment(cfg, { categories: new Set(Object.keys(cfg.weights)) }), []);
  assert.ok(validateCombatEquipment({ ...cfg, floor: 2 }).length);
  assert.ok(validateCombatEquipment(cfg, { categories: new Set(['TANK']) }).some((e) => /inesistente/.test(e)));
});

test('categoria delle voci: alias del template (DEU «fucili») o equipment_id diretto', () => {
  assert.equal(categoryOf('DEU', 'equipment.fucili'), 'INDIVIDUAL_WEAPON');
  assert.equal(categoryOf('DEU', 'equipment.INW-DEU-RIFLE-1939'), 'INDIVIDUAL_WEAPON');
  assert.equal(categoryOf('DEU', 'manpower.war'), null);
  assert.equal(categoryOf('DEU', 'equipment.inesistente'), null);
});

test('dotazione pesata per categoria, non per pezzi: piena 100%, senza armi 50%, metà armi 75%', () => {
  const full = { 'equipment.r': { planned: 8000, effective: 8000 }, 'equipment.mg': { planned: 100, effective: 100 }, 'equipment.how': { planned: 12, effective: 12 } };
  assert.deepEqual(equipmentFill(full, of, cfg), { fill: 1, factor: 1, byCategory: { INDIVIDUAL_WEAPON: 1, MACHINE_GUN: 1, HOWITZER: 1 } });
  const none = Object.fromEntries(Object.entries(full).map(([k, v]) => [k, { ...v, effective: 0 }]));
  assert.equal(equipmentFill(none, of, cfg).factor, 0.5);
  const half = Object.fromEntries(Object.entries(full).map(([k, v]) => [k, { ...v, effective: v.planned / 2 }]));
  assert.equal(equipmentFill(half, of, cfg).factor, 0.75);
  const noGuns = { ...full, 'equipment.how': { planned: 12, effective: 0 } }; // pesi 1 + 2 + 2: senza obici la dotazione è 3/5
  assert.equal(equipmentFill(noGuns, of, cfg).fill, 0.6);
  assert.equal(equipmentFill({ ...full, 'equipment.r': { planned: 8000, effective: 9999 } }, of, cfg).fill, 1, 'eccedenze non contano oltre il 100%');
});

test('dati mancanti non penalizzano: nessuna voce riconosciuta = 100%', () => {
  assert.deepEqual(equipmentFill({ 'manpower.war': { planned: 1, effective: 1 }, 'equipment.x': { planned: null, effective: 0 } }, of, cfg), { fill: null, factor: 1, byCategory: {} });
});

test('potenza e battaglia: la divisione senza armi pesanti combatte meno e perde di più', () => {
  assert.equal(divisionPower({ category: 'infantry', effective: 10000 }), 10000);
  assert.equal(divisionPower({ category: 'infantry', effective: 10000, equipment: 0.75 }), 7500);
  const a = { id: 'A', category: 'infantry', effective: 10000, planned: 10000 };
  const d = { id: 'D', category: 'infantry', effective: 10000, planned: 10000 };
  const even = resolveBattleDay({ attackers: [a], defenders: [d] });
  const weak = resolveBattleDay({ attackers: [{ ...a, equipment: 0.5 }], defenders: [d] });
  assert.ok(weak.attackerLoss.A > even.attackerLoss.A);
  assert.ok(weak.defenderLoss.D < even.defenderLoss.D);
});

test('inizio partita: le divisioni tedesche del 1936 partono tutte allo stesso livello (riempimento iniziale), sopra il 90%', () => {
  const tpl = json('units/templates/divisione_fanteria_germania_1936.json');
  const units = json('units/units.json').units.filter((u) => u.nation === 'DEU' && u.category === 'infantry' && u.echelon === 'division');
  assert.ok(units.length > 0, 'divisioni col template 1936');
  const { state } = initForcesState({ schema: 7, date: '1936-01-01', forces: { schema: 'forces-v1', initialized: false, divisions: {} } }, { units, templates: [tpl], ratio: json('units/readiness.json').initialFillRatio.value });
  const ids = Object.keys(state.forces.divisions);
  assert.ok(ids.length > 0);
  const factors = new Set();
  for (const id of ids) {
    const f = equipmentFill(state.forces.divisions[id].items, (k) => categoryOf('DEU', k), cfg);
    assert.ok(f.fill !== null && f.factor > 0.9, `${id}: ${f.factor}`);
    factors.add(f.factor);
  }
  assert.equal(factors.size, 1, 'tutte uguali');
});

test('stesse regole per tutte le nazioni: al 1/1/1936 ogni divisione attiva delle 7 potenze (tranne le corazzate senza template) ha armi riconosciute', async () => {
  const { completeTemplates, CATEGORY_FALLBACK } = await import('../src/rules/forces.js');
  const { isActiveAt } = await import('../src/data/units.js');
  const names = ['divisione_fanteria_germania_1936', 'divisione_corazzata_germania_1936', 'divisione_fanteria_gran_bretagna_1936', 'divisione_fanteria_francia_1936', 'divisione_fanteria_germania_1939', 'divisione_fanteria_francia_1939', 'divisione_fanteria_italia_1940', 'divisione_fanteria_giappone_1939', 'divisione_fanteria_usa_1940', 'divisione_fucilieri_urss_1939'];
  const templates = completeTemplates(names.map((n) => json(`units/templates/${n}.json`)));
  const fra = templates.find((t) => t.id === 'TPL-FRA-INF-1936');
  assert.equal(fra.equipmentFrom, 'TPL-FRA-INF-1939', 'Francia 1936: armi dal 1939');
  assert.equal(fra.startsAsCadre, true, 'resta un quadro');
  assert.equal(fra.initialFillRatio.value, 0.3);
  const units = json('units/units.json').units;
  const { state } = initForcesState({ schema: 7, date: '1936-01-01', forces: { schema: 'forces-v1', initialized: false, divisions: {} } }, { units, templates, ratio: json('units/readiness.json').initialFillRatio.value });
  const nations = new Set();
  for (const u of units.filter((x) => x.echelon === 'division' && isActiveAt(x, '1936-01-01'))) {
    const d = state.forces.divisions[u.id];
    if (u.category === 'armored' && !(u.nation === 'DEU')) { assert.equal(d, undefined); continue; }
    assert.ok(d, `${u.id} (${u.nation} ${u.category}) senza istanza`);
    assert.ok(u.category === 'infantry' || u.category === 'armored' || CATEGORY_FALLBACK[u.category]);
    const f = equipmentFill(d.items, (k) => categoryOf(u.nation, k), cfg);
    assert.notEqual(f.fill, null, `${u.id}: nessuna arma riconosciuta`);
    nations.add(u.nation);
  }
  assert.deepEqual([...nations].sort(), ['DEU', 'FRA', 'GBR', 'ITA', 'JPN', 'USA', 'USSR']);
});
