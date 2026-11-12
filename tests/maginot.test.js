// Linea Maginot (12/11/2026): fortificazioni livello 3 sulle 4 province di confine (dato) e guarnigione di ~metà della fanteria francese alla mobilitazione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet } from '../src/data/moveNet.js';
import { newGame } from '../src/game/state.js';
import { initForcesState } from '../src/game/forcesState.js';
import { createMobilizationSystem, validateMobilizationLaws, validateMobilizationShape } from '../src/game/mobilizationState.js';
import { createMovementSystem, initialPositions } from '../src/game/movementState.js';
import { createTheaterSystem } from '../src/game/theaterState.js';
import { activeAssignments, validateTheaters } from '../src/rules/theater.js';
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
  const gProv = law.garrison.theaters.flatMap((t) => t.provinces);
  assert.equal(law.garrison.theaters.length, 2, 'due settori');
  assert.deepEqual(Object.keys(doc.byProvince).sort(), [...gProv].sort());
  for (const e of Object.values(doc.byProvince)) assert.equal(e.fortifications, 3);
  assert.deepEqual(validateProvinceDataset('military', doc, { motherIds }), []);
  assert.deepEqual(validateMobilizationLaws(laws, { nationIds: nationList, provinceIds: motherIds }), []);
  const bad = (g) => validateMobilizationLaws({ ...laws, laws: [{ ...law, garrison: { ...law.garrison, ...g } }] }, { nationIds: nationList, provinceIds: motherIds }).join();
  assert.match(bad({ share: 0 }), /quota/);
  assert.match(bad({ theaters: [{ name: 'X', provinces: ['P_FRA_NON_ESISTE'] }] }), /inesistente/);
  assert.match(bad({ theaters: [] }), /settori/);
  assert.match(bad({ theaters: [{ name: 'A', provinces: ['P_FRA_MOSELLE'] }, { name: 'B', provinces: ['P_FRA_MOSELLE'] }] }), /più settori/);
  assert.match(bad({ source: '' }), /guarnigione senza fonte/);
});

test('alla guerra Germania-Polonia ceil(metà) della fanteria francese va in 2 incarichi di DIFESA (Reno e Lorena) sulle 4 province, in modo equilibrato; registrato nello stato', () => {
  const w = mob(war(start()));
  const g = w.mobilization.garrison[law.id];
  const existing = infFra.filter((u) => w.forces.divisions[u.id]);
  assert.ok(existing.length > 0 && existing.length <= infFra.length);
  assert.equal(g.quota, Math.ceil(existing.length / 2), 'metà (per eccesso) delle divisioni di fanteria francesi ESISTENTI al momento');
  assert.ok(g.units.length > 0 && g.units.length <= g.quota);
  assert.equal(g.shortfall, g.quota - g.units.length);
  assert.deepEqual(validateMobilizationShape(w.mobilization), []);
  assert.deepEqual(validateTheaters(w.theaters), []);
  const act = activeAssignments(w.theaters);
  assert.ok(act.length >= 1 && act.length <= 2);
  assert.deepEqual(act.map((a) => a.id).sort(), [...g.theaters].sort());
  for (const a of act) {
    assert.equal(a.kind, 'defend'); assert.equal(a.nation, 'FRA'); assert.match(a.name, /^Linea Maginot/);
    assert.ok(law.garrison.theaters.some((t) => t.name === a.name && a.provinces.join() === t.provinces.join()));
  }
  assert.equal(new Set(act.flatMap((a) => a.units)).size, g.units.length, 'nessuna divisione in due incarichi');
  const per = {}; for (const u of g.units) { per[u.to] = (per[u.to] ?? 0) + 1; assert.equal(units.find((x) => x.id === u.unit).category, 'infantry'); assert.equal(units.find((x) => x.id === u.unit).nation, 'FRA'); }
  assert.ok(Math.max(...Object.values(per)) <= Math.ceil(g.units.length / 4), 'nessuna provincia sovraccarica');
});

test('con il sistema di teatro le divisioni arrivano, restano e si trincerano; la guarnigione non viene riassegnata', () => {
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const tctx = { getNet: () => net, unitsById, deploymentDoc: dep, initial: initialPositions(dep) };
  const w = mob(war(start()));
  assert.equal(mob(w), w, 'secondo giorno: stesso oggetto');
  const g = w.mobilization.garrison[law.id];
  const done = advanceDays(w, 90, [createMovementSystem(net), createTheaterSystem(tctx), mob]);
  const arrived = g.units.filter((u) => done.movement.positions[u.unit] === u.to || initialPositions(dep).get(u.unit) === u.to);
  assert.ok(arrived.length > 0, 'almeno una divisione è arrivata');
  assert.deepEqual(done.mobilization.garrison, w.mobilization.garrison, 'la guarnigione non viene riordinata');
  assert.equal(activeAssignments(done.theaters).length, activeAssignments(w.theaters).length, 'gli incarichi di difesa restano attivi');
  const digging = g.units.filter((u) => (done.entrench?.days?.[u.unit] ?? 0) > 0);
  assert.ok(digging.length > 0, 'chi è arrivato si trincera');
  for (const u of g.units) assert.ok(done.forces.divisions[u.unit], 'la divisione esiste ancora (non scartata dal teatro)');
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
  assert.equal(plain.theaters, s.theaters);
});
