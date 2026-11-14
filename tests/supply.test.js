// Rifornimenti v1: raggiungibilità dalle fonti, ponti principali distrutti, tolleranza e fattore di potenza, sistema giornaliero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suppliedPlaces, createSupplyState, updateSupply, supplyFactor, validateSupplyState, validateSupplyConfig } from '../src/rules/supply.js';
import { createSupplySystem, supplyFactorOf, supplySources } from '../src/game/supplyState.js';
import { playerDeclareWar } from '../src/game/theaterState.js';
import { powerOfUnit } from '../src/game/theaterPlan.js';
import { buildBridgeIndex, createBridgeState, destroyPair } from '../src/rules/bridges.js';

const cfg = JSON.parse(readFileSync(new URL('../data/combat/supply.json', import.meta.url), 'utf8'));
const line = (names) => ({ neighbors: (p) => { const i = names.indexOf(p); return [names[i - 1], names[i + 1]].filter(Boolean); } });

test('configurazione valida e rifiutata se incoerente', () => {
  assert.deepEqual(validateSupplyConfig(cfg), []);
  assert.equal(cfg.basis, 'ipotesi');
  assert.match(validateSupplyConfig({ ...cfg, unsuppliedFactor: 0 }).join(), /unsuppliedFactor/);
  assert.match(validateSupplyConfig({ ...cfg, reachBeyond: -1 }).join(), /reachBeyond/);
  assert.match(validateSupplyConfig({ ...cfg, graceDays: 1.5 }).join(), /graceDays/);
});

test('posti riforniti: territorio proprio, oltre il fronte entro la portata, interruzione di un passo', () => {
  const net = line(['A', 'B', 'C', 'D', 'E', 'F']);
  const controlled = (p) => ['A', 'B', 'C'].includes(p);
  const m2 = suppliedPlaces({ net, sources: ['A'], controlled, reach: 2 });
  assert.deepEqual([...m2.entries()].sort(), [['A', 0], ['B', 0], ['C', 0], ['D', 1], ['E', 2]]);
  assert.equal(suppliedPlaces({ net, sources: ['A'], controlled, reach: 0 }).has('D'), false);
  const cut = suppliedPlaces({ net, sources: ['A'], controlled, reach: 2, canStep: (a, b) => !(a === 'B' && b === 'C') });
  assert.deepEqual([...cut.keys()].sort(), ['A', 'B']);
  assert.equal(suppliedPlaces({ net, sources: ['D'], controlled, reach: 2 }).size, 0, 'una fonte non controllata non rifornisce');
});

test('percorsi alternativi e fonti multiple: vale il costo minore', () => {
  const NB = { A: ['B', 'X'], B: ['A', 'C'], X: ['A', 'C'], C: ['B', 'X'] };
  const net = { neighbors: (p) => NB[p] };
  const m = suppliedPlaces({ net, sources: ['A', 'C'], controlled: (p) => p !== 'X', reach: 1 });
  assert.equal(m.get('X'), 1);
  assert.equal(m.get('C'), 0);
});

test('stato: i giorni senza rifornimento si contano dal primo; la tolleranza e il fattore', () => {
  let s = createSupplyState();
  s = updateSupply(s, { day: 7, outIds: ['D1'], checkedIds: ['D1', 'D2'] });
  assert.deepEqual(s.out, { D1: 7 });
  s = updateSupply(s, { day: 8, outIds: ['D1'], checkedIds: ['D1'] });
  assert.equal(s.out.D1, 7, 'resta il giorno iniziale');
  assert.equal(supplyFactor(s, 'D1', 7 + cfg.graceDays - 1, cfg), 1);
  assert.equal(supplyFactor(s, 'D1', 7 + cfg.graceDays, cfg), cfg.unsuppliedFactor);
  assert.equal(supplyFactor(s, 'D2', 99, cfg), 1);
  const back = updateSupply(s, { day: 20, outIds: [], checkedIds: ['D1'] });
  assert.deepEqual(back.out, {});
  assert.equal(updateSupply(back, { day: 21, outIds: [], checkedIds: ['D1'] }), back, 'senza cambiamenti lo stato è lo stesso oggetto');
  assert.deepEqual(validateSupplyState(undefined), []);
  assert.match(validateSupplyState({ schema: 'x' }).join(), /schema/);
  assert.match(validateSupplyState({ schema: 'supply-v1', out: { D: -1 } }).join(), /non valido/);
});

const FILE = { links: [{ id: 'L1', a: 0, b: 1 }], bridges: [{ id: 'LB_A', link: 'L1', riverId: 'R_MAIN' }] };
function world({ destroyed }) {
  const NB = { W: ['E'], E: ['W', 'F'], F: ['E'] };
  const net = { has: (m) => m in NB, neighbors: (m) => NB[m] ?? [], km: () => 30, owner: () => 'FRA', name: (m) => m, isCity: () => false, canon: (m) => m, provinceOf: (m) => m,
    bridgeIndex: buildBridgeIndex(FILE, ['W', 'E'], () => ({ class: 'main', widthClass: 'large' })), supplyCapitals: new Map([['FRA', ['F']]]) };
  const list = [{ id: 'F1', name: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' }];
  const unitsById = new Map(list.map((u) => [u.id, u]));
  const divisions = { F1: { templateId: 't', since: '1936-01-01', items: { 'manpower.war': { planned: 10000, effective: 10000, source: 'template' } } } };
  let bridges = createBridgeState();
  if (destroyed) bridges = destroyPair(bridges, net.bridgeIndex, 'W', 'E', { day: 1 }).bridges;
  let state = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal', forces: { schema: 'forces-v1', initialized: true, divisions }, bridges };
  state = playerDeclareWar(state, 'FRA');
  const ctx = { getNet: () => net, unitsById, deploymentDoc: { entries: [{ unit: 'F1', province: 'W' }] }, initial: new Map([['F1', 'W']]) };
  return { net, state, ctx, unit: list[0] };
}

test('sistema: un ponte principale distrutto taglia la divisione dalla capitale; dopo la tolleranza la potenza scende; ripristinato, torna', () => {
  const w = world({ destroyed: true });
  const sys = createSupplySystem(w.ctx, cfg);
  let s = sys({ ...w.state, day: 5 });
  assert.equal(s.supply.out.F1, 5);
  const power = (st) => powerOfUnit(st, w.unit, { supplyFactor: (x, u) => supplyFactorOf(x, u, cfg) });
  const full = powerOfUnit(s, w.unit, {});
  assert.equal(power(s), full, 'entro la tolleranza nessun effetto');
  s = sys({ ...s, day: 5 + cfg.graceDays });
  assert.ok(Math.abs(power(s) - full * cfg.unsuppliedFactor) < 1e-6, `${power(s)} vs ${full}`);
  const ok = world({ destroyed: false });
  const clean = createSupplySystem(ok.ctx, cfg)({ ...ok.state, day: 5 });
  assert.equal(clean.supply, undefined, 'rifornita: nessuno stato');
  const healed = createSupplySystem(ok.ctx, cfg)({ ...s, bridges: createBridgeState(), day: 20 });
  assert.deepEqual(healed.supply.out, {});
});

test('sistema: senza guerra o senza fonti note nessuno è penalizzato; fonti: capitale e porti controllati', () => {
  const w = world({ destroyed: true });
  const peace = { ...w.state, war: { ...w.state.war, pairs: {} } };
  assert.equal(createSupplySystem(w.ctx, cfg)(peace), peace);
  const noSource = { ...w.net, supplyCapitals: new Map() };
  const s = createSupplySystem({ ...w.ctx, getNet: () => noSource }, cfg)({ ...w.state, day: 9 });
  assert.equal(s.supply, undefined);
  assert.deepEqual(supplySources(w.state, w.net, 'FRA', ['E']), ['E', 'F']);
  assert.deepEqual(supplySources(w.state, w.net, 'GER', ['E']), [], 'porti di altri non contano');
});
