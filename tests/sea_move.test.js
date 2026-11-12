// Movimento via mare tra porti propri (12/11/2026): le exclave (Prussia orientale) raggiungono il resto del paese; solo senza via di terra; versione semplificata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet } from '../src/data/moveNet.js';
import { createMovementState, issueMove, tickMovement, validateMovement } from '../src/rules/movement.js';
import { seaPlan } from '../src/rules/seaMove.js';
import { newGame, validateState } from '../src/game/state.js';
import { orderMove, createMovementSystem, positionOf as _p } from '../src/game/movementState.js';
import { createGameSea } from '../src/game/seaState.js';
import { advanceDays } from '../src/game/engine.js';
import { entityOfProvinceId } from '../src/data/provinceOwner.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));

// ---------- rete sintetica: A - B ~mare~ C - D; E isolata ----------
const land = { A: ['B'], B: ['A', 'X'], C: ['D', 'X'], D: ['C'], E: [], X: ['B', 'C'] };
const netS = { has: (m) => m in land, neighbors: (m) => land[m] ?? [], km: () => 40 };
const all = () => true;
const zones = ['ZB', 'ZC'];
const graphS = { params: { closedZones: [], portHandlingDays: 1 }, has: (z) => zones.includes(z), control: () => null, neighbors: (z) => (z === 'ZB' ? [{ to: 'ZC', km: 300, days: 4 }] : z === 'ZC' ? [{ to: 'ZB', km: 300, days: 4 }] : []) };
const seaS = (ports = ['B', 'C']) => ({ nation: 'XXX', motherOf: (id) => id, context: { graph: graphS, portsOf: () => ports.map((p) => ({ province: p, zone: `Z${p}` })) } });
const noX = (m) => m !== 'X'; // senza la provincia X le due metà non sono collegate per terra

test('rete sintetica: A → D senza via di terra usa UNA tratta di mare B → C; giorni = terra + mare + terra, ordine valido', () => {
  const plan = seaPlan(netS, 'A', 'D', noX, seaS());
  assert.deepEqual(plan, { path: ['A', 'B', 'C', 'D'], seaLeg: 1, seaDays: 6 }); // 4 giorni di rotta + 2 × 1 di sosta nei porti
  const initial = new Map([['U1', 'A']]);
  const r = issueMove(createMovementState(), { id: 'U1', category: 'infantry' }, 'D', { initial, net: netS, canEnter: noX, sea: seaS() });
  assert.equal(r.ok, true);
  assert.equal(r.days, 2 + 6 + 2, 'A→B 2 gg (40 km a 20 km/g) + mare 6 + C→D 2');
  assert.deepEqual(r.movement.orders.U1.seaLegs, { 1: 6 });
  assert.deepEqual(validateMovement(r.movement), []);
  let m = r.movement; const where = [];
  for (let d = 1; d <= 10; d += 1) { m = tickMovement(m, netS.km); where.push(m.positions.U1 ?? 'A'); assert.deepEqual(validateMovement(m), []); }
  assert.deepEqual(where, ['A', 'B', 'B', 'B', 'B', 'B', 'B', 'C', 'C', 'D'], 'in B dopo 2 giorni, in C dopo altri 6, in D dopo 2');
  assert.deepEqual(m.orders, {}, 'ordine completato');
});

test('rete sintetica: con la via di terra il mare non si usa; senza porto, senza `sea`, meta non consentita o isolata → nessun piano', () => {
  const initial = new Map([['U1', 'A']]);
  const r = issueMove(createMovementState(), { id: 'U1', category: 'infantry' }, 'D', { initial, net: netS, canEnter: all, sea: seaS() });
  assert.equal(r.ok, true); assert.equal(r.seaLegs, undefined, 'via di terra A-B-X-C-D: nessuna tratta di mare');
  assert.equal(seaPlan(netS, 'A', 'D', all, seaS()), null);
  assert.equal(seaPlan(netS, 'A', 'D', noX, seaS(['C'])), null, 'nessun porto dalla parte di partenza');
  assert.equal(seaPlan(netS, 'A', 'D', noX, seaS(['B'])), null, 'nessun porto dalla parte di arrivo');
  assert.equal(seaPlan(netS, 'A', 'D', noX, null), null);
  assert.equal(seaPlan(netS, 'A', 'D', (m) => m !== 'X' && m !== 'D', seaS()), null, 'meta non consentita');
  assert.equal(seaPlan(netS, 'A', 'E', noX, seaS()), null, 'E senza porto né collegamenti');
  assert.equal(issueMove(createMovementState(), { id: 'U1', category: 'infantry' }, 'D', { initial, net: netS, canEnter: noX }).reason, 'no_route', 'senza sea: come prima');
});

test('validateMovement: tratte di mare malformate rifiutate', () => {
  const base = { schema: 'movement-v1', positions: {}, orders: { U: { path: ['A', 'B', 'C'], leg: 0, daysLeft: 2, category: 'infantry', totalDays: 8 } } };
  assert.deepEqual(validateMovement(base), []);
  const bad = (seaLegs) => validateMovement({ ...base, orders: { U: { ...base.orders.U, seaLegs } } }).join();
  assert.match(bad({ 1: 0 }), /non valida/);
  assert.match(bad({ 5: 3 }), /non valida/);
  assert.match(bad([]), /non valide/);
  assert.equal(bad({ 1: 3 }), '');
});

// ---------- dati reali ----------
const col = await loadProvinces();
const props = col.features.map((f) => f.properties);
const moveNet = buildMoveNet(col, read('adjacency.json'));
const political = read('political_1936.json');
const nationIds = read('nations.json').map((n) => n.id);
const entityIds = political.map((e) => e.id);
const motherById = new Map(props.map((p) => [p.id, p.parentProvince ?? p.id]));
const coastal = read('ports/coastal_cities.json').cities;
const base = read('ports/ports_1936.json');
const gameSea = createGameSea({ seaFile: read('sea_zones.json'), params: read('sea_routes_params.json'), provinceIds: props.map((p) => p.id), motherOf: (id) => motherById.get(id) ?? id, entityOf: (id) => entityOfProvinceId(id, entityIds), ports: { coastal, base } });
const dep = read('units/deployment_1936.json');
const units = read('units/units.json').units;
const start = () => newGame({ nation: 'DEU', political, ownersWithProvinces: nationIds }).state;
const seaOf = (s) => ({ context: gameSea.at(s), motherOf: (id) => motherById.get(id) ?? id });
const KUR = 'P_DEU_KURMARK'; const OST = 'P_DEU_OSTPREUSSEN';
const unit = (id) => units.find((u) => u.id === id);
const ostUnits = dep.entries.filter((e) => e.province === OST && unit(e.unit)?.nation === 'DEU').map((e) => e.unit);

test('dati reali: le 5 unità tedesche della Prussia orientale raggiungono la Kurmark via mare tra porti propri; prima non potevano', () => {
  assert.equal(ostUnits.length, 5, ostUnits.join());
  const s = start();
  const movers = ostUnits.map((id) => ({ id, category: unit(id).category }));
  const before = orderMove(s, { units: movers, to: KUR, nation: 'DEU', deploymentDoc: dep, net: moveNet });
  assert.equal(before.moved.length, 0); assert.ok(before.failed.every((f) => f.reason === 'no_route'), 'senza mare: come prima');
  const r = orderMove(s, { units: movers, to: KUR, nation: 'DEU', deploymentDoc: dep, net: moveNet, sea: seaOf(s) });
  assert.equal(r.failed.length, 0, JSON.stringify(r.failed));
  assert.equal(r.moved.length, 5);
  for (const m of r.moved) {
    assert.equal(m.path[0], OST); assert.equal(m.path.at(-1), KUR);
    const [leg] = Object.keys(m.seaLegs).map(Number);
    assert.ok(m.seaLegs[leg] >= 1, 'giorni di mare ≥ 1');
    assert.equal(m.path[leg], OST, 'la tratta di mare parte dal porto della Prussia orientale (Königsberg, livello 2)');
    assert.notEqual(m.path[leg + 1], OST); assert.ok(m.path[leg + 1].startsWith('P_DEU_'), 'e arriva in un porto tedesco della terraferma');
    assert.ok(coastal[Object.keys(coastal).find((id) => coastal[id].parentProvince === m.path[leg + 1])], 'il porto di arrivo ha una città costiera');
    assert.ok(m.days >= m.seaLegs[leg], 'i giorni totali includono il mare');
  }
  assert.deepEqual(validateState(r.state).filter((e) => /movimento/.test(e)), []);
  // arrivo: la marcia giornaliera li porta davvero in Kurmark, non prima
  const moved = r.moved[0];
  const sys = createMovementSystem(moveNet);
  const early = advanceDays(r.state, moved.days - 1, [sys]);
  assert.notEqual(early.movement.positions[moved.unit], KUR);
  const done = advanceDays(r.state, moved.days, [sys]);
  assert.equal(done.movement.positions[moved.unit], KUR);
  assert.equal(done.movement.orders[moved.unit], undefined);
});

test('dati reali: le unità con via di terra non cambiano (nessuna tratta di mare) e il percorso è identico a quello senza mare', () => {
  const s = start();
  const other = dep.entries.find((e) => e.province !== OST && unit(e.unit)?.nation === 'DEU' && unit(e.unit).echelon === 'division').unit;
  const u = [{ id: other, category: unit(other).category }];
  const a = orderMove(s, { units: u, to: KUR, nation: 'DEU', deploymentDoc: dep, net: moveNet });
  const b = orderMove(s, { units: u, to: KUR, nation: 'DEU', deploymentDoc: dep, net: moveNet, sea: seaOf(s) });
  if (a.moved.length) { assert.deepEqual(b.moved[0].path, a.moved[0].path); assert.equal(b.moved[0].seaLegs, undefined); assert.equal(b.moved[0].days, a.moved[0].days); }
  else assert.ok(b.failed.length === 1, 'senza via di terra né porti il risultato è lo stesso');
});

test('dati reali: serve un porto proprio in funzione: senza porti in Prussia orientale (livello 0) nessuna via', () => {
  const s0 = start();
  const levels = Object.fromEntries(Object.entries(coastal).filter(([, c]) => c.parentProvince === OST).map(([id]) => [id, 0]));
  assert.ok(Object.keys(levels).length > 0);
  const s = { ...s0, ports: { levels } };
  const movers = [{ id: ostUnits[0], category: unit(ostUnits[0]).category }];
  const r = orderMove(s, { units: movers, to: KUR, nation: 'DEU', deploymentDoc: dep, net: moveNet, sea: seaOf(s) });
  assert.equal(r.moved.length, 0); assert.equal(r.failed[0].reason, 'no_route');
});

test('dati reali: il mare non apre territori altrui: verso una provincia polacca interna resta no_route per un tedesco in pace', () => {
  const s = start();
  const movers = [{ id: ostUnits[0], category: unit(ostUnits[0]).category }];
  const r = orderMove(s, { units: movers, to: 'P_POL_WARSAW_VOIVODESHIP', nation: 'DEU', deploymentDoc: dep, net: moveNet, sea: seaOf(s) });
  assert.equal(r.moved.length, 0); assert.equal(r.failed[0].reason, 'no_route');
});
