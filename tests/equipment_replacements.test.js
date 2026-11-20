// Logica delle dotazioni, fase 1 (21/11/2026): il modello precedente copre il posto del nuovo quando il nuovo manca in magazzino,
// e in battaglia ogni pezzo vale come il proprio modello. Catene in data/units/equipment/replacements.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeEquipmentCatalogs, validateReplacements, buildPredecessors } from '../src/data/equipmentCatalog.js';
import { planReinforcements, dispatch, applyArrivals } from '../src/rules/reinforcements.js';
import { rawFirepower } from '../src/rules/battleV2.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const CATALOG = mergeEquipmentCatalogs(fs.readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => /^catalog.*\.json$/.test(f)).sort().map((f) => read(`units/equipment/${f}`)));
const REPL = read('units/equipment/replacements.json');
const PROD = read('units/equipment/equipment_production.json');
const BATTLE = read('units/battle_v2.json');
const WEAPON_OF = buildWeaponOf(CATALOG);

test('replacements.json è valido', () => {
  assert.deepEqual(validateReplacements(REPL, { catalog: CATALOG, production: PROD }), []);
});

test('il validatore rifiuta categoria diversa, predecessore più recente, doppio predecessore e cicli', () => {
  const bad = (entries) => validateReplacements({ schema: 'equipment-replacements-v1', entries }, { catalog: CATALOG, production: PROD });
  assert.match(bad([{ id: 'ART-DEU-PAK38', replaces: 'ART-DEU-FLAK88', basis: 'ipotesi' }]).join(), /categoria diversa/);
  assert.match(bad([{ id: 'ART-USA-AT37-1940', replaces: 'ART-USA-AT57', basis: 'ipotesi' }]).join(), /più recente/);
  assert.match(bad([{ id: 'ART-USA-AT57', replaces: 'ART-USA-AT37-1940', basis: 'ipotesi' }, { id: 'ART-USA-AT57', replaces: 'ART-USA-AT37-ARM-1940', basis: 'ipotesi' }]).join(), /già un predecessore/);
  assert.match(bad([{ id: 'ART-DEU-PAK38', replaces: 'ART-DEU-PAK36', basis: 'ipotesi' }, { id: 'ART-DEU-PAK36', replaces: 'ART-DEU-PAK38', basis: 'ipotesi' }]).join(), /circolare/);
});

test('predecessori: catena dal più recente al più vecchio, solo della stessa nazione', () => {
  const pred = buildPredecessors(CATALOG, REPL);
  assert.deepEqual(pred('DEU', 'equipment.TD-DEU-HETZER'), ['equipment.TD-DEU-MARDER-III', 'equipment.TD-DEU-PZJG-I']);
  assert.deepEqual(pred('USA', 'equipment.ART-USA-AT57'), ['equipment.ART-USA-AT37-1940']);
  assert.deepEqual(pred('USA', 'equipment.ART-USA-AT37-1940'), []);
  assert.deepEqual(pred('USA', 'manpower.war'), []);
});

const forcesWith = (items) => ({ initialized: true, divisions: { D1: { templateId: 'T', since: '1942-06-01', items } }, transfers: [] });
const plan = (forces, stocks, fallback = true) => planReinforcements(forces, {
  units: [{ id: 'D1', nation: 'USA' }], nation: 'USA', date: '1942-07-01', poolAvailable: 0, stocks, transitDays: () => 2,
  fallbackOf: fallback ? (item) => buildPredecessors(CATALOG, REPL)('USA', item) : null,
});

test('rinforzi: prima il modello nuovo, poi il predecessore; senza catena il posto resta vuoto', () => {
  const forces = forcesWith({ 'equipment.ART-USA-AT57': { planned: 18, effective: 6, source: 'template' } });
  const p = plan(forces, { 'equipment.ART-USA-AT57': 4, 'equipment.ART-USA-AT37-1940': 20 });
  assert.deepEqual(p.transfers.map((t) => [t.qty, t.stockKey ?? t.item]), [[4, 'equipment.ART-USA-AT57'], [8, 'equipment.ART-USA-AT37-1940']]);
  assert.equal(plan(forces, { 'equipment.ART-USA-AT37-1940': 20 }, false).transfers.length, 0);
});

test('il pezzo vecchio arriva registrato come proprio modello e in battaglia vale meno del nuovo', () => {
  const forces = forcesWith({ 'equipment.ART-USA-AT57': { planned: 18, effective: 0, source: 'template' } });
  const arrived = applyArrivals(dispatch(forces, plan(forces, { 'equipment.ART-USA-AT37-1940': 18 }).transfers), '1942-07-03').forces;
  const it = arrived.divisions.D1.items['equipment.ART-USA-AT57'];
  assert.equal(it.effective, 18);
  assert.deepEqual(it.models, { 'ART-USA-AT37-1940': 18 });
  const fire = (items) => rawFirepower(items, (k) => WEAPON_OF('USA', k), BATTLE, 0, { resolve: (id) => WEAPON_OF('USA', `equipment.${id}`) });
  const old = fire(arrived.divisions.D1.items);
  const full = fire({ 'equipment.ART-USA-AT57': { planned: 18, effective: 18 } });
  assert.ok(old.direct.hard < full.direct.hard, `37 mm ${old.direct.hard} < 57 mm ${full.direct.hard}`);
  assert.equal(old.direct.hard, fire({ 'equipment.ART-USA-AT37-1940': { planned: 18, effective: 18 } }).direct.hard);
});
