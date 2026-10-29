// Movimento delle unità: regole pure (rete sintetica) e rete reale (province + adiacenza), ordine e sistema giornaliero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet } from '../src/data/moveNet.js';
import { createMovementState, hopDays, findPath, issueMove, cancelMove, tickMovement, validateMovement, MARCH_KM_PER_DAY } from '../src/rules/movement.js';
import { orderMove, createMovementSystem, currentDeployment, initialPositions, canEnterFor, cancelOrders } from '../src/game/movementState.js';
import { validateState } from '../src/game/state.js';
import { unitsByProvince } from '../src/data/deployment.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));

// rete sintetica: A - B - C in linea (100 km a tratta) e D isolata; scorciatoia A - C di 500 km (più lunga ma 1 passo)
function lineNet({ shortcut = false } = {}) {
  const edges = { 'A|B': 100, 'B|C': 100, ...(shortcut ? { 'A|C': 500 } : {}) };
  const km = (a, b) => edges[`${a}|${b}`] ?? edges[`${b}|${a}`];
  const nb = { A: ['B', ...(shortcut ? ['C'] : [])], B: ['A', 'C'], C: ['B', ...(shortcut ? ['A'] : [])], D: [] };
  return { neighbors: (m) => nb[m] ?? [], km };
}
const all = () => true;

test('hopDays: arrotonda per eccesso, almeno un giorno, la cavalleria è più veloce della fanteria', () => {
  assert.equal(hopDays(100, 'infantry'), 5);
  assert.equal(hopDays(101, 'infantry'), 6);
  assert.equal(hopDays(0, 'infantry'), 1);
  assert.ok(hopDays(200, 'cavalry') < hopDays(200, 'infantry'));
  assert.ok(MARCH_KM_PER_DAY.mountain < MARCH_KM_PER_DAY.infantry);
  assert.throws(() => hopDays(-1, 'infantry'), RangeError);
});

test('findPath: meno passi vince, a parità meno km; province vietate si aggirano o bloccano', () => {
  assert.deepEqual(findPath(lineNet(), 'A', 'C', all), ['A', 'B', 'C']);
  assert.deepEqual(findPath(lineNet({ shortcut: true }), 'A', 'C', all), ['A', 'C']);
  assert.deepEqual(findPath(lineNet({ shortcut: true }), 'A', 'C', (m) => m !== 'C' || true), ['A', 'C']);
  assert.equal(findPath(lineNet(), 'A', 'C', (m) => m !== 'B'), null);
  assert.equal(findPath(lineNet(), 'A', 'D', all), null);
  assert.equal(findPath(lineNet(), 'A', 'C', (m) => m !== 'C'), null, 'destinazione vietata');
  assert.deepEqual(findPath(lineNet(), 'A', 'A', all), ['A']);
});

test('ordine e marcia: A→C a passi di 5 giorni; compare in B dopo 5 giorni e in C dopo 10; nel frattempo resta indietro', () => {
  const net = lineNet();
  const initial = new Map([['U1', 'A']]);
  let r = issueMove(createMovementState(), { id: 'U1', category: 'infantry' }, 'C', { initial, net, canEnter: all });
  assert.equal(r.ok, true);
  assert.equal(r.days, 10);
  let m = r.movement;
  const pos = () => m.positions.U1 ?? 'A';
  for (let d = 1; d <= 4; d += 1) { m = tickMovement(m, net.km); assert.equal(pos(), 'A', `giorno ${d}`); }
  m = tickMovement(m, net.km);
  assert.equal(pos(), 'B');
  assert.equal(m.orders.U1.daysLeft, 5);
  for (let d = 1; d <= 5; d += 1) m = tickMovement(m, net.km);
  assert.equal(pos(), 'C');
  assert.deepEqual(m.orders, {}, 'ordine concluso');
  assert.deepEqual(validateMovement(m), []);
});

test('ordini: stessa provincia e nessun percorso falliscono con un motivo; un nuovo ordine sostituisce il vecchio; annullare non sposta', () => {
  const net = lineNet();
  const initial = new Map([['U1', 'A']]);
  const ctx = { initial, net, canEnter: all };
  const u = { id: 'U1', category: 'infantry' };
  assert.equal(issueMove(createMovementState(), u, 'A', ctx).reason, 'same_province');
  assert.equal(issueMove(createMovementState(), u, 'D', ctx).reason, 'no_route');
  assert.equal(issueMove(createMovementState(), { id: 'X', category: 'infantry' }, 'B', ctx).reason, 'unknown_position');
  const a = issueMove(createMovementState(), u, 'C', ctx).movement;
  const b = issueMove(a, u, 'B', ctx).movement;
  assert.deepEqual(b.orders.U1.path, ['A', 'B']);
  const c = cancelMove(b, 'U1');
  assert.deepEqual(c.orders, {});
  assert.equal(c.positions.U1, undefined);
});

test('validateMovement: segnala ordini incoerenti', () => {
  const bad = { schema: 'movement-v1', positions: { U: '' }, orders: { U: { path: ['A'], leg: 0, daysLeft: 0 } } };
  const e = validateMovement(bad).join('|');
  assert.match(e, /posizione di U/); assert.match(e, /percorso di U/); assert.match(e, /giorni di U/);
});

// --- rete reale ---------------------------------------------------------------------------------------------------
const collection = await loadProvinces();
const net = buildMoveNet(collection, read('adjacency.json'));
const deployment = read('units/deployment_1936.json');
const units = read('units/units.json').units;
const control = Object.fromEntries(read('political_1936.json').map((e) => [e.id, e.controller ?? e.id]));

test('rete reale: le madri della dislocazione esistono, i vicini sono simmetrici, le distanze sono plausibili', () => {
  for (const e of deployment.entries) assert.ok(net.has(e.province), e.province);
  for (const m of ['P_DEU_BERLIN', 'P_DEU_OSTPREUSSEN']) {
    assert.ok(net.neighbors(m).length > 0, m);
    for (const n of net.neighbors(m)) assert.ok(net.neighbors(n).includes(m));
  }
  const n0 = net.neighbors('P_DEU_BERLIN')[0];
  const km = net.km('P_DEU_BERLIN', n0);
  assert.ok(km > 5 && km < 1000, `distanza ${km}`);
});

test('ordine reale: una divisione tedesca va da Berlino a una provincia tedesca vicina; non entra in Francia', () => {
  const berlin = unitsByProvince(units, deployment, '1936-01-01').P_DEU_BERLIN[0].units.filter((u) => u.echelon === 'division');
  const state = { control, movement: undefined };
  const mover = { id: berlin[0].id, category: berlin[0].category };
  const target = net.neighbors('P_DEU_BERLIN').find((n) => net.owner(n) === 'DEU');
  assert.ok(target, 'Berlino ha un vicino tedesco');
  const ok = orderMove(state, { units: [mover], to: target, nation: 'DEU', deploymentDoc: deployment, net });
  assert.equal(ok.moved.length, 1);
  assert.ok(ok.moved[0].days >= 1);
  const frFrontier = [...collection.features].map((f) => f.properties.parentProvince ?? f.properties.id).find((m) => net.owner(m) === 'FRA');
  const no = orderMove(state, { units: [mover], to: frFrontier, nation: 'DEU', deploymentDoc: deployment, net });
  assert.deepEqual(no.failed.map((f) => f.reason), ['no_route']);
  assert.equal(no.state, state, 'nessun cambiamento se nessuna unità si muove');
  assert.equal(canEnterFor(state, net, 'DEU')(frFrontier), false);
});

test('sistema giornaliero: la divisione arriva, la dislocazione corrente la mostra nella nuova provincia, lo stato resta valido', () => {
  const berlin = unitsByProvince(units, deployment, '1936-01-01').P_DEU_BERLIN[0].units.find((u) => u.echelon === 'division');
  const target = net.neighbors('P_DEU_BERLIN').find((n) => net.owner(n) === 'DEU');
  const base = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'DEU', control, difficulty: 'media', nations: null, commanders: { schema: 'commanders-v1', assignments: {} }, orbat: { schema: 'orbat-v1', links: {} }, forces: { schema: 'forces-v1', initialized: false, divisions: {} }, trade: { schema: 'trade-v1', nextId: 1, contracts: [] } };
  const o = orderMove(base, { units: [{ id: berlin.id, category: berlin.category }], to: target, nation: 'DEU', deploymentDoc: deployment, net });
  let s = o.state;
  const sys = createMovementSystem(net);
  for (let d = 0; d < o.moved[0].days; d += 1) s = sys(s);
  assert.equal(s.movement.positions[berlin.id], target);
  assert.deepEqual(s.movement.orders, {});
  const cur = unitsByProvince(units, currentDeployment(deployment, s), '1936-01-01');
  assert.ok(cur[target].flatMap((g) => g.units).some((u) => u.id === berlin.id));
  assert.ok(!cur.P_DEU_BERLIN[0].units.some((u) => u.id === berlin.id));
  assert.deepEqual(validateMovement(s.movement), []);
  assert.deepEqual(validateState(s), [], 'stato intero valido con il campo movement');
  assert.deepEqual(cancelOrders(s, [berlin.id]).movement.positions, s.movement.positions, 'annullare non sposta chi è già arrivato');
  assert.equal(initialPositions(deployment).get(berlin.id), 'P_DEU_BERLIN');
});
