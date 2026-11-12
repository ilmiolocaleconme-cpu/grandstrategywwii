// Linea Maginot (12/11/2026): fortificazioni livello 3 sulle 4 province di confine (dato) e guarnigione di ~metà della fanteria francese alla mobilitazione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet } from '../src/data/moveNet.js';
import { newGame } from '../src/game/state.js';
import { initForcesState } from '../src/game/forcesState.js';
import { createMobilizationSystem, validateMobilizationLaws, validateMobilizationShape } from '../src/game/mobilizationState.js';
import { createMovementSystem } from '../src/game/movementState.js';
import { validateProvinceDataset } from '../src/data/provinceData.js';
import { advanceDays } from '../src/game/engine.js';
import { createWar, declareWar } from '../src/rules/war.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = read('units/units.json').units;
const laws = read('units/mobilization_laws.json');
const law = laws.laws[0];
const names = ['divisione_fanteria_germania_1936', 'divisione_corazzata_germania_1936', 'divisione_fanteria_gran_bretagna_1936', 'divisione_fanteria_francia_1936', 'divisione_fanteria_germania_1939', 'divisione_fanteria_francia_1939', 'divisione_fanteria_italia_1940'];
const ctx = { units, templates: names.map((f) => read(`units/templates/${f}.json`)), ratio: read('units/readiness.json').initialFillRatio.value, upgradeMap: read('units/equipment/upgrade_map.json') };
const political = read('political_1936.json');
const nationList = read('nations.json').map((n) => n.id);
const dep = read('units/deployment_1936.json');
const col = await loadProvinces();
const net = buildMoveNet(col, read('adjacency.json'));
const motherIds = new Set(col.features.map((f) => f.properties.parentProvince ?? f.properties.id));
const start = () => ({ ...initForcesState(newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state, ctx).state, date: '1939-09-01' });
const war = (s) => ({ ...s, war: declareWar(s.war ?? createWar(), { a: 'DEU', b: 'POL', date: s.date }) });
const mob = createMobilizationSystem({ units, laws, movement: { net: () => net, deploymentDoc: dep } });
const infFra = units.filter((u) => u.nation === 'FRA' && u.category === 'infantry');

test('dati: le 4 province hanno fortificazioni 3 e il file è valido; la legge con guarnigione è valida e rifiuta quote/province errate', () => {
  const doc = read('military/province_presence.json');
  assert.deepEqual(Object.keys(doc.byProvince).sort(), [...law.garrison.provinces].sort());
  for (const e of Object.values(doc.byProvince)) assert.equal(e.fortifications, 3);
  assert.deepEqual(validateProvinceDataset('military', doc, { motherIds }), []);
  assert.deepEqual(validateMobilizationLaws(laws, { nationIds: nationList, provinceIds: motherIds }), []);
  const bad = (g) => validateMobilizationLaws({ ...laws, laws: [{ ...law, garrison: { ...law.garrison, ...g } }] }, { nationIds: nationList, provinceIds: motherIds }).join();
  assert.match(bad({ share: 0 }), /quota/);
  assert.match(bad({ provinces: ['P_FRA_NON_ESISTE'] }), /inesistente/);
  assert.match(bad({ provinces: [] }), /province/);
  assert.match(bad({ source: '' }), /guarnigione senza fonte/);
});

test('alla guerra Germania-Polonia ceil(metà) della fanteria francese riceve l\'ordine verso le 4 province, in modo equilibrato; registrato nello stato', () => {
  const w = mob(war(start()));
  const g = w.mobilization.garrison[law.id];
  const existing = infFra.filter((u) => w.forces.divisions[u.id]);
  assert.ok(existing.length > 0 && existing.length <= infFra.length);
  assert.equal(g.quota, Math.ceil(existing.length / 2), 'metà (per eccesso) delle divisioni di fanteria francesi ESISTENTI al momento');
  assert.ok(g.units.length > 0 && g.units.length <= g.quota);
  assert.equal(g.shortfall, g.quota - g.units.length);
  assert.deepEqual(validateMobilizationShape(w.mobilization), []);
  const per = {}; for (const u of g.units) { per[u.to] = (per[u.to] ?? 0) + 1; assert.ok(law.garrison.provinces.includes(u.to)); assert.equal(units.find((x) => x.id === u.unit).category, 'infantry'); assert.ok(w.movement.orders[u.unit], 'ordine di movimento attivo'); }
  const counts = Object.values(per);
  assert.ok(Math.max(...counts) <= Math.ceil(g.units.length / law.garrison.provinces.length), 'nessuna provincia sovraccarica');
  assert.equal(new Set(g.units.map((u) => u.unit)).size, g.units.length, 'nessuna divisione ordinata due volte');
  // gli altri paesi non vengono toccati
  for (const u of g.units) assert.equal(units.find((x) => x.id === u.unit).nation, 'FRA');
});

test('le divisioni arrivano davvero nelle province di confine con il passare dei giorni; l\'ordine è idempotente (nessun secondo invio)', () => {
  const w = mob(war(start()));
  assert.equal(mob(w), w, 'secondo giorno: stesso oggetto');
  const done = advanceDays(w, 60, [createMovementSystem(net), mob]);
  const g = w.mobilization.garrison[law.id];
  const arrived = g.units.filter((u) => done.movement.positions[u.unit] === u.to);
  assert.ok(arrived.length > 0, 'almeno una divisione è arrivata');
  assert.deepEqual(done.mobilization.garrison, w.mobilization.garrison, 'la guarnigione non viene riordinata');
  assert.deepEqual(validateMobilizationShape(done.mobilization), []);
});

test('senza rete di movimento (non ancora caricata) la mobilitazione scatta ma la guarnigione aspetta; poi scatta una volta sola', () => {
  let ready = false;
  const lazy = createMobilizationSystem({ units, laws, movement: { net: () => (ready ? net : null), deploymentDoc: dep } });
  const a = lazy(war(start()));
  assert.ok(a.mobilization.started[law.id]);
  assert.equal(a.mobilization.garrison, undefined);
  ready = true;
  const b = lazy(a);
  assert.ok(b.mobilization.garrison[law.id]);
  assert.equal(lazy(b), b);
});

test('senza guerra Germania-Polonia nessun ordine; senza contesto di movimento solo mobilitazione', () => {
  const s = start();
  assert.equal(mob(s), s);
  const plain = createMobilizationSystem({ units, laws })(war(s));
  assert.equal(plain.mobilization.garrison, undefined);
  assert.equal(plain.movement, s.movement);
});
