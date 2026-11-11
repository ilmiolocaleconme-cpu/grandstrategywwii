// Sponde come posti separati (decisione dell'utente 11/11/2026, fase 1: solo movimento, nessuna penalità di attraversamento).
// Caso segnalato: una divisione in Weser-Ems (sponda B) mandata alla sponda A rispondeva «già lì».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet, bankIndex } from '../src/data/moveNet.js';
import { issueMove, createMovementState, tickMovement } from '../src/rules/movement.js';
import { provinceController } from '../src/game/warCommon.js';
import { initialPositions, currentDeployment } from '../src/game/movementState.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const collection = await loadProvinces();
const net = buildMoveNet(collection, read('adjacency.json'), { cities: read('citta_grandi.json').features, cityLinks: read('city_links.json') });
const bank = bankIndex(collection.features);
const WE = 'P_DEU_WESER_EMS';
const [A, B] = bank.banksOf(WE);

test('le sponde sono posti della rete; la madre divisa vale la sponda principale', () => {
  assert.ok(A && B, 'Weser-Ems ha due sponde');
  assert.equal(net.has(A), true); assert.equal(net.has(B), true); assert.equal(net.has(WE), true);
  assert.ok(net.provinces().includes(A) && !net.provinces().includes(WE), 'la madre divisa non è un posto a sé');
  assert.ok([A, B].includes(net.canon(WE)));
  assert.deepEqual(net.neighbors(WE), net.neighbors(net.canon(WE)));
  assert.equal(net.provinceOf(A), WE); assert.equal(net.provinceOf(WE), WE);
  assert.equal(net.parentOf(B), WE); assert.equal(net.isBank(B), true);
  assert.ok(net.neighbors(A).includes(B) && net.neighbors(B).includes(A), 'le sponde sorelle si toccano lungo il fiume');
});

test('da una sponda all’altra è una marcia, non «già lì»', () => {
  const mv = { ...createMovementState(), positions: { U1: B } };
  const r = issueMove(mv, { id: 'U1', category: 'infantry' }, A, { initial: new Map(), net, canEnter: () => true });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.path, [B, A]);
  let m = r.movement;
  for (let d = 0; d < r.days + 1 && m.orders.U1; d += 1) m = tickMovement(m, net.km);
  assert.equal(m.positions.U1, A);
  const same = issueMove(mv, { id: 'U1', category: 'infantry' }, B, { initial: new Map(), net, canEnter: () => true });
  assert.equal(same.reason, 'same_province');
});

test('una posizione salvata sulla madre (prima delle sponde) parte dalla sponda principale', () => {
  const other = net.canon(WE) === A ? B : A;
  const mv = { ...createMovementState(), positions: { U1: WE } };
  const r = issueMove(mv, { id: 'U1', category: 'infantry' }, other, { initial: new Map(), net, canEnter: () => true });
  assert.equal(r.ok, true); assert.equal(r.path[0], net.canon(WE));
  assert.equal(issueMove(mv, { id: 'U1', category: 'infantry' }, WE, { initial: new Map(), net, canEnter: () => true }).reason, 'same_province');
});

test('controllo: la sponda ha il suo; senza, segue la madre e poi la nazione', () => {
  const s0 = { control: {}, provinces: {} };
  assert.equal(provinceController(s0, net, A), 'DEU');
  const s1 = { control: {}, provinces: { [WE]: { controller: 'NLD' } } };
  assert.equal(provinceController(s1, net, A), 'NLD', 'segue la madre se occupata per intero');
  const s2 = { control: {}, provinces: { [B]: { controller: 'NLD' } } };
  assert.equal(provinceController(s2, net, B), 'NLD');
  assert.equal(provinceController(s2, net, A), 'DEU', 'l’altra sponda resta tedesca');
  assert.equal(provinceController(s2, net, WE), provinceController(s2, net, net.canon(WE)), 'la madre vale la sponda principale');
});

test('dislocazione 1936: le unità nelle province divise stanno su una loro sponda', () => {
  const doc = read('units/deployment_1936.json');
  const init = initialPositions(doc);
  for (const e of doc.entries) {
    if (!bank.isSplit(e.province)) { assert.equal(e.bank, undefined, `${e.unit}: sponda in una provincia non divisa`); continue; }
    assert.ok(bank.banksOf(e.province).includes(e.bank), `${e.unit}: ${e.bank} non è una sponda di ${e.province}`);
    assert.equal(init.get(e.unit), e.bank);
  }
  const cur = currentDeployment(doc, null);
  assert.ok(cur.entries.every((e, i) => e.province === (doc.entries[i].bank ?? doc.entries[i].province)));
});
