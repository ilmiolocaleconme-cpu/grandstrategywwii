// Logica delle dotazioni, fase 2 (21/11/2026): battaglioni con versioni (supersedes), modernizzazione graduale, scambio dei pezzi vecchi,
// fucili nello schema unico (G43, SVT-40, Garand). Scelte dell'utente 1A, 2A, 3A, 4A, 5A e 3B.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateModules, targetVersions, compositionWithVersions, sumComposition } from '../src/data/modules.js';
import { modernizeDivision, plannedOf } from '../src/rules/modernize.js';
import { mergeEquipmentCatalogs, buildPredecessors } from '../src/data/equipmentCatalog.js';
import { planReinforcements, dispatch, applyArrivals, validateReinforcementFields } from '../src/rules/reinforcements.js';
import { rawFirepower, weaponWeight } from '../src/rules/battleV2.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const DEU = read('units/modules/modules_deu.json');
const USSR = read('units/modules/modules_ussr.json');
const MODULES = [...DEU.modules, ...USSR.modules];
const CATALOG = mergeEquipmentCatalogs(fs.readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => /^catalog.*\.json$/.test(f)).sort().map((f) => read(`units/equipment/${f}`)));
const PRED = buildPredecessors(CATALOG, read('units/equipment/replacements.json'));
const BATTLE = read('units/battle_v2.json');
const WEAPON_OF = buildWeaponOf(CATALOG);
const comp = (doc, id) => doc.compositions.find((c) => c.templateId === id).modules.map(([m, count]) => ({ id: m, count }));

test('validatore: le versioni dei battaglioni dei file reali sono valide; supersedes sbagliati sono segnalati', () => {
  assert.deepEqual(validateModules(DEU).filter((e) => /supersedes|versioni/.test(e)), []);
  assert.deepEqual(validateModules(USSR).filter((e) => /supersedes|versioni/.test(e)), []);
  const bad = structuredClone(DEU);
  bad.modules.find((m) => m.id === 'MOD-DEU-INF-1943').supersedes = 'MOD-DEU-ART';
  assert.match(validateModules(bad).join(), /altra nazione o tipo/);
  const early = structuredClone(DEU);
  early.compositions[0].modules.push(['MOD-DEU-INF-1943', 1]);
  assert.match(validateModules(early).join(), /non entra direttamente nelle composizioni|esiste solo dal/);
});

test('versione bersaglio: servono data, tecnologia e armi nuove producibili (prima tecnologia e produzione)', () => {
  const c = comp(DEU, 'TPL-DEU-INF-1939');
  const all = new Set(['TECH-INF-SEMI2', 'TECH-INF-ATDISP', 'TECH-INF-ATROCKET']);
  const t = (date, producible = () => true) => targetVersions({ composition: c, modules: MODULES, nation: 'DEU', date, researched: all, producible });
  assert.deepEqual(t('1943-09-30'), {}, 'prima della data');
  assert.deepEqual(t('1943-10-01'), { 'MOD-DEU-INF': 'MOD-DEU-INF-1943', 'MOD-DEU-REGT-HVY': 'MOD-DEU-REGT-HVY-1943' });
  assert.deepEqual(t('1944-01-01', (id) => id !== 'GL-DEU-PANZERFAUST'), { 'MOD-DEU-REGT-HVY': 'MOD-DEU-REGT-HVY-1943' }, 'Panzerfaust non producibile: il battaglione resta com\'è');
  assert.deepEqual(targetVersions({ composition: c, modules: MODULES, nation: 'DEU', date: '1944-01-01', researched: all, producible: () => false, current: { 'MOD-DEU-INF': 'MOD-DEU-INF-1943' } }),
    { 'MOD-DEU-INF': 'MOD-DEU-INF-1943' }, 'mai indietro');
});

test('modernizeDivision: il G43 entra come posto da colmare, i K98k in più lo coprono e combattono come K98k; nulla si crea o si perde', () => {
  const c = comp(DEU, 'TPL-DEU-INF-1939');
  const base = plannedOf(sumComposition(MODULES, compositionWithVersions(c, {})));
  const items = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { planned: v, effective: v, source: 'template' }]));
  const versions = { 'MOD-DEU-INF': 'MOD-DEU-INF-1943' };
  const planned = plannedOf(sumComposition(MODULES, compositionWithVersions(c, versions)));
  const r = modernizeDivision({ templateId: 'TPL-DEU-INF-1939', since: '1939-09-01', items }, planned, { versions, predecessorsOf: (p) => PRED('DEU', p) });
  const it = r.division.items;
  assert.equal(it['equipment.INW-DEU-RIFLE-1939'].planned, base['equipment.INW-DEU-RIFLE-1939'] - 9 * 40);
  assert.deepEqual(it['equipment.INW-DEU-G43'], { planned: 360, effective: 360, source: 'upgrade', models: { 'INW-DEU-RIFLE-1939': 360 } });
  assert.deepEqual(it['equipment.GL-DEU-PANZERFAUST'], { planned: 324, effective: 0, source: 'upgrade' }, 'nessun Panzerfaust gratis');
  assert.deepEqual(r.surplus, {}, 'i fucili in più sono tutti nei posti dei G43');
  assert.deepEqual(r.division.versions, versions);
  const rifles = (d) => (d['equipment.INW-DEU-RIFLE-1939']?.effective ?? 0) + (d['equipment.INW-DEU-G43']?.effective ?? 0);
  assert.equal(rifles(it), base['equipment.INW-DEU-RIFLE-1939'], 'stessi fucili di prima');
  assert.deepEqual(validateReinforcementFields({ divisions: { D: r.division }, transfers: [] }), []);
});

test('scambio graduale: il G43 prodotto prende il posto del K98k, che torna al magazzino', () => {
  const items = { 'equipment.INW-DEU-G43': { planned: 360, effective: 360, source: 'upgrade', models: { 'INW-DEU-RIFLE-1939': 360 } } };
  const forces = { initialized: true, divisions: { D1: { templateId: 'T', since: '1939-09-01', items } }, transfers: [] };
  const p = planReinforcements(forces, { units: [{ id: 'D1', nation: 'DEU' }], nation: 'DEU', date: '1943-11-01', poolAvailable: 0, transitDays: () => 3,
    stocks: { 'equipment.INW-DEU-G43': 100 }, fallbackOf: (item) => PRED('DEU', item) });
  assert.equal(p.transfers.length, 1);
  assert.equal(p.transfers[0].swap, true);
  assert.equal(p.transfers[0].qty, 100);
  const sent = dispatch(forces, p.transfers);
  assert.deepEqual(validateReinforcementFields(sent), []);
  const again = planReinforcements(sent, { units: [{ id: 'D1', nation: 'DEU' }], nation: 'DEU', date: '1943-11-02', poolAvailable: 0, transitDays: () => 3,
    stocks: { 'equipment.INW-DEU-G43': 1000 }, fallbackOf: (item) => PRED('DEU', item) });
  assert.equal(again.transfers.reduce((s, t) => s + t.qty, 0), 260, 'gli scambi in viaggio non si ripetono');
  const a = applyArrivals(sent, '1943-11-04');
  assert.deepEqual(a.forces.divisions.D1.items['equipment.INW-DEU-G43'], { planned: 360, effective: 360, source: 'upgrade', models: { 'INW-DEU-RIFLE-1939': 260 } });
  assert.deepEqual(a.returned.map((t) => [t.stockKey, t.returnedQty]), [['equipment.INW-DEU-RIFLE-1939', 100]]);
});

test('battaglia: il semiautomatico vale 1,5 volte il fucile a ripetizione; la carabina 0,6', () => {
  const w = (id) => weaponWeight(WEAPON_OF(id.split('-')[1], `equipment.${id}`), BATTLE).soft;
  assert.equal(w('INW-DEU-RIFLE-1939'), 0.5);
  assert.equal(w('INW-DEU-G43'), 0.75);
  assert.equal(w('INW-USSR-SVT40'), 0.75);
  assert.equal(w('INW-USA-GARAND'), 0.75);
  assert.equal(w('INW-USA-CARBINE-M1'), 0.6);
  const fire = (items) => rawFirepower(items, (k) => WEAPON_OF('DEU', k), BATTLE, 0, { resolve: (id) => WEAPON_OF('DEU', `equipment.${id}`) }).small.soft;
  assert.equal(fire({ 'equipment.INW-DEU-G43': { planned: 100, effective: 100, models: { 'INW-DEU-RIFLE-1939': 40 } } }), 60 * 0.75 + 40 * 0.5);
});
