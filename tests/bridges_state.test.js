// Stato dei ponti: fiumi principali con ponti distrutti = impassabili; fiumi minori si forzano; ripristino; marcia interrotta; forma del salvataggio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBridgeIndex, createBridgeState, destroyPair, startRepair, tickBridges, pairState, canStepOver, validateBridgeState, validateBridgeConfig, bridgeStatus } from '../src/rules/bridges.js';
import { orderMove, createMovementSystem } from '../src/game/movementState.js';
import { createBridgeSystem, playerDestroyBridge, playerRepairBridge } from '../src/game/bridgeState.js';

const cfg = JSON.parse(readFileSync(new URL('../data/combat/bridges.json', import.meta.url), 'utf8'));
const IDS = ['W', 'E', 'F']; // W e E: sponde di un fiume; F: sponda di un fiume minore a est di E
const FILE = { links: [{ id: 'L1', a: 0, b: 1 }, { id: 'L2', a: 1, b: 2 }], bridges: [{ id: 'LB_A', link: 'L1', riverId: 'R_MAIN' }, { id: 'LB_B', link: 'L1', riverId: 'R_MAIN' }, { id: 'LB_C', link: 'L2', riverId: 'R_SMALL' }] };
const RIVERS = { R_MAIN: { class: 'main', widthClass: 'large' }, R_SMALL: { class: 'tributary', widthClass: 'medium' } };
const index = () => buildBridgeIndex(FILE, IDS, (id) => RIVERS[id]);

test('configurazione valida; il validatore rifiuta ripristini incoerenti', () => {
  assert.deepEqual(validateBridgeConfig(cfg), []);
  assert.equal(cfg.basis, 'ipotesi');
  assert.match(validateBridgeConfig({ ...cfg, repairDays: { small: 30, medium: 20, large: 50 } }).join(), /costare meno/);
  assert.match(validateBridgeConfig({ ...cfg, repairDays: { small: 0, medium: 1, large: 1 } }).join(), /small/);
});

test('fiume principale: finché c\'è un ponte agibile si passa; distrutti tutti, non si passa più; ripristinato, si torna a passare', () => {
  const ix = index();
  let bs = createBridgeState();
  assert.equal(pairState(ix, bs, 'W', 'E').main, true);
  bs = destroyPair(bs, ix, 'E', 'W', { day: 3 }).bridges;
  assert.equal(bridgeStatus(bs, 'LB_A'), 'destroyed');
  assert.equal(canStepOver(ix, bs, 'W', 'E'), false);
  assert.throws(() => destroyPair(bs, ix, 'W', 'E', { day: 4 }), /nessun ponte agibile/);
  bs = startRepair(bs, ix, 'W', 'E', { day: 3, cfg }).bridges;
  assert.equal(bridgeStatus(bs, 'LB_A'), 'repairing');
  assert.equal(canStepOver(ix, bs, 'W', 'E'), false, 'in ripristino non è agibile');
  assert.equal(tickBridges(bs, 3 + cfg.repairDays.large - 1), bs, 'non ancora finito');
  bs = tickBridges(bs, 3 + cfg.repairDays.large);
  assert.equal(canStepOver(ix, bs, 'W', 'E'), true);
  assert.deepEqual(validateBridgeState(bs), []);
});

test('fiume minore: distrutti i ponti il passo resta possibile (si forza, con il bonus ai difensori); coppie senza ponti nei dati: sempre possibile', () => {
  const ix = index();
  const bs = destroyPair(createBridgeState(), ix, 'E', 'F', { day: 1 }).bridges;
  assert.equal(pairState(ix, bs, 'E', 'F').main, false);
  assert.equal(canStepOver(ix, bs, 'E', 'F'), true);
  assert.equal(pairState(ix, bs, 'E', 'F').intact, 0);
  assert.equal(canStepOver(ix, bs, 'W', 'F'), true);
});

test('validazione dello stato: assente ok, schema e forma sbagliati rifiutati, ripristino senza distruzione rifiutato', () => {
  assert.deepEqual(validateBridgeState(undefined), []);
  assert.match(validateBridgeState({ schema: 'x' }).join(), /schema/);
  assert.match(validateBridgeState({ ...createBridgeState(), repairing: { LB_A: { done: 3 } } }).join(), /non distrutto/);
  assert.match(validateBridgeState({ ...createBridgeState(), destroyed: { LB_A: {} }, repairing: { LB_A: { done: 'x' } } }).join(), /non valida/);
});

function world() {
  const NB = { W: ['E'], E: ['W', 'F'], F: ['E'] };
  const net = { has: (m) => m in NB, neighbors: (m) => NB[m] ?? [], km: () => 30, owner: () => 'GER', name: (m) => m, isCity: () => false, canon: (m) => m, provinceOf: (m) => m, bridgeIndex: index() };
  const units = [{ id: 'G1', name: 'G1', nation: 'GER', category: 'infantry', echelon: 'division' }];
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const doc = { entries: [{ unit: 'G1', province: 'W' }] };
  const state = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'GER', control: { GER: 'GER' }, difficulty: 'normal', bridges: createBridgeState() };
  return { net, unitsById, doc, state, ctx: { unitsById, initial: new Map([['G1', 'W']]) } };
}

test('movimento: ordine impossibile oltre un fiume principale senza ponti agibili; con un ponte agibile arriva; marcia interrotta se il ponte salta', () => {
  const w = world();
  const u = [{ id: 'G1', category: 'infantry' }];
  const ok = orderMove(w.state, { units: u, to: 'F', nation: 'GER', deploymentDoc: w.doc, net: w.net });
  assert.equal(ok.moved.length, 1);
  const destroyed = playerDestroyBridge(w.state, { a: 'W', b: 'E', ctx: w.ctx, net: w.net }).state;
  const blocked = orderMove(destroyed, { units: u, to: 'F', nation: 'GER', deploymentDoc: w.doc, net: w.net });
  assert.equal(blocked.failed[0].reason, 'no_route');
  // marcia in corso: il ponte salta, l'unità resta dov'è e l'ordine cade
  let s = ok.state;
  const sys = createMovementSystem(w.net);
  s = sys({ ...s, day: 1 });
  const mid = playerDestroyBridge({ ...s, bridges: s.bridges }, { a: 'W', b: 'E', ctx: w.ctx, net: w.net }).state;
  for (let d = 2; d < 12; d += 1) s = sys({ ...mid, movement: s.movement, day: d });
  assert.ok(!s.movement.positions.G1 || s.movement.positions.G1 === 'W', `l'unità non ha attraversato: ${s.movement.positions.G1}`);
  assert.equal(s.movement.orders.G1, undefined);
});

test('azioni del giocatore: serve un\'unità propria su una sponda; ripristino e sistema giornaliero', () => {
  const w = world();
  const far = { ...w.ctx, initial: new Map([['G1', 'F']]) };
  assert.throws(() => playerDestroyBridge(w.state, { a: 'W', b: 'E', ctx: far, net: w.net }), /unità tua/);
  assert.throws(() => playerDestroyBridge(w.state, { a: 'W', b: 'E', ctx: w.ctx, net: { ...w.net, bridgeIndex: undefined } }), /non caricati/);
  const d = playerDestroyBridge(w.state, { a: 'W', b: 'E', ctx: w.ctx, net: w.net });
  assert.deepEqual(d.destroyed.sort(), ['LB_A', 'LB_B']);
  const r = playerRepairBridge({ ...d.state, day: 5 }, { a: 'W', b: 'E', ctx: w.ctx, net: w.net, cfg });
  const sys = createBridgeSystem();
  assert.equal(canStepOver(w.net.bridgeIndex, r.state.bridges, 'W', 'E'), false);
  const done = sys({ ...r.state, day: 5 + cfg.repairDays.large });
  assert.equal(canStepOver(w.net.bridgeIndex, done.bridges, 'W', 'E'), true);
  assert.equal(sys(w.state), w.state, 'senza ripristini lo stato non cambia');
});

import { bridgeRows } from '../src/ui/bridgeView.js';
import { loadProvinces } from '../scripts/load-provinces.js';

test('ponti ipotetici: l\'indice li unisce a quelli dei dati; distrutti, il fiume principale si blocca; senza dati restano passabili', () => {
  const inferred = { bridges: [{ id: 'LB_INF_001', a: 'W', b: 'F', riverId: 'R_MAIN', widthClass: 'medium' }] };
  const ix = buildBridgeIndex(FILE, IDS, (id) => RIVERS[id], inferred);
  assert.equal(pairState(ix, createBridgeState(), 'W', 'F').main, true);
  const bs = destroyPair(createBridgeState(), ix, 'W', 'F', { day: 1 }).bridges;
  assert.equal(canStepOver(ix, bs, 'W', 'F'), false);
  assert.equal(ix.byId.get('LB_INF_001').inferred, true);
  assert.equal(canStepOver(index(), createBridgeState(), 'W', 'F'), true, 'senza il ponte ipotetico la coppia non ha ponti');
});

test('dati reali: i ponti ipotetici sono ipotesi, su coppie di sponde della stessa provincia, senza duplicati e senza toccare coppie già con ponte', async () => {
  const inf = JSON.parse(readFileSync(new URL('../data/bridges_inferred.json', import.meta.url), 'utf8'));
  const links = JSON.parse(readFileSync(new URL('../data/links.json', import.meta.url), 'utf8'));
  const rivers = new Map(JSON.parse(readFileSync(new URL('../data/rivers.json', import.meta.url), 'utf8')).map((r) => [r.id, r]));
  const prov = await loadProvinces();
  const ids = prov.features.map((f) => f.properties.id);
  const mother = new Map(prov.features.map((f) => [f.properties.id, f.properties.parentProvince ?? null]));
  const lk = new Map(links.links.map((l) => [l.id, l]));
  const real = new Set(links.bridges.map((b) => [ids[lk.get(b.link).a], ids[lk.get(b.link).b]].sort().join('|')));
  assert.equal(inf.basis, 'ipotesi');
  assert.ok(inf.bridges.length >= 100, `ponti ipotetici: ${inf.bridges.length}`);
  const seen = new Set(); const names = new Set();
  for (const b of inf.bridges) {
    const k = [b.a, b.b].sort().join('|');
    assert.ok(!seen.has(k) && !real.has(k), `${b.id}: coppia duplicata o già con ponte`);
    seen.add(k);
    assert.ok(!names.has(b.id)); names.add(b.id);
    assert.ok(mother.get(b.a) && mother.get(b.a) === mother.get(b.b), `${b.id}: non sono sponde della stessa provincia`);
    assert.equal(rivers.get(b.riverId)?.class, 'main', `${b.id}: fiume non principale`);
    assert.ok(b.distKm <= 2, `${b.id}: fiume troppo lontano`);
  }
  assert.ok(inf.unresolved.length > 0 && inf.unresolved.every((u) => u.a && u.b && u.reason), 'le coppie non risolte sono dichiarate');
});

test('vista dei ponti di un posto: righe, stato, blocco e azioni', () => {
  const ix = index();
  let bs = createBridgeState();
  const rows = bridgeRows(ix, bs, 'E', { nameOf: (x) => `n-${x}`, repairCfg: cfg, day: 0 });
  assert.deepEqual(rows.map((r) => [r.other, r.main, r.status, r.canDestroy, r.canRepair]), [['W', true, 'intact', true, false], ['F', false, 'intact', true, false]]);
  bs = destroyPair(bs, ix, 'W', 'E', { day: 2 }).bridges;
  const d = bridgeRows(ix, bs, 'W', { repairCfg: cfg, day: 2 })[0];
  assert.deepEqual([d.status, d.blocked, d.canDestroy, d.canRepair, d.repairDays], ['destroyed', true, false, true, cfg.repairDays.large]);
  bs = startRepair(bs, ix, 'W', 'E', { day: 2, cfg }).bridges;
  const r = bridgeRows(ix, bs, 'E', { repairCfg: cfg, day: 12 })[0];
  assert.deepEqual([r.status, r.daysLeft], ['repairing', cfg.repairDays.large - 10]);
  assert.deepEqual(bridgeRows(null, bs, 'E'), []);
  assert.deepEqual(bridgeRows(ix, bs, 'Z'), []);
});

import { bridgeMarks, drawBridgeMarks } from '../src/map/bridgeIcons.js';
import { project } from '../src/map/geo.js';

test('segnalini dei ponti: solo distrutti e in ripristino, con posizione proiettata; il disegno evita i nomi e non fallisce', () => {
  const file = { links: [{ id: 'L1', a: 0, b: 1 }], bridges: [{ id: 'LB_A', link: 'L1', riverId: 'R_MAIN', lon: 10, lat: 48 }, { id: 'LB_B', link: 'L1', riverId: 'R_MAIN', lon: 11, lat: 48.5 }] };
  const ix = buildBridgeIndex(file, ['W', 'E'], (id) => RIVERS[id], { bridges: [{ id: 'LB_INF_001', a: 'W', b: 'E', riverId: 'R_MAIN', widthClass: 'large', lon: 12, lat: 49 }] });
  assert.deepEqual(bridgeMarks(ix, createBridgeState()), []);
  assert.deepEqual(bridgeMarks(null, createBridgeState()), []);
  let bs = destroyPair(createBridgeState(), ix, 'W', 'E', { day: 1 }).bridges;
  let marks = bridgeMarks(ix, bs, (x) => `n-${x}`);
  assert.deepEqual(marks.map((m) => [m.id, m.status, m.inferred]), [['LB_A', 'destroyed', false], ['LB_B', 'destroyed', false], ['LB_INF_001', 'destroyed', true]]);
  assert.deepEqual([marks[0].x, marks[0].y], project(10, 48));
  assert.match(marks[0].title, /distrutto: n-E – n-W/);
  bs = startRepair(bs, ix, 'W', 'E', { day: 1, cfg }).bridges;
  assert.ok(bridgeMarks(ix, bs).every((m) => m.status === 'repairing'));
  const bare = buildBridgeIndex({ links: [{ id: 'L1', a: 0, b: 1 }], bridges: [{ id: 'LB_A', link: 'L1', riverId: 'R_MAIN' }] }, ['W', 'E'], (id) => RIVERS[id]);
  assert.equal(bridgeMarks(bare, destroyPair(createBridgeState(), bare, 'W', 'E', { day: 1 }).bridges).length, 0, 'senza posizione nei dati: nessun segnalino');
  const calls = []; const ctx = new Proxy({ canvas: { width: 800, height: 600 } }, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(String(k)); }), set: () => true });
  const boxes = [];
  drawBridgeMarks(ctx, { marks, a: { sx: 10, tx: 0, ty: 600 }, dpr: 1, copies: [0], boxes });
  assert.equal(boxes.length, marks.length, 'ogni segnalino visibile occupa un riquadro');
  assert.ok(calls.includes('arc') && calls.includes('stroke'));
  const none = []; drawBridgeMarks(ctx, { marks, a: { sx: 10, tx: 99999, ty: 0 }, dpr: 1, copies: [0], boxes: none });
  assert.equal(none.length, 0, 'fuori schermo: niente');
});
