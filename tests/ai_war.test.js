// IA di guerra: difesa e attacco delle nazioni non del giocatore, sul sistema di teatro (rete sintetica).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiWarSystem, nationsAtWar, PERIOD } from '../src/game/aiWarSystem.js';
import { createTheaterSystem, playerDeclareWar, provinceController } from '../src/game/theaterState.js';
import { createMovementSystem } from '../src/game/movementState.js';
import { activeAssignments, validateTheaters } from '../src/rules/theater.js';

// A(GER) - B(GER) - C(FRA) - D(FRA), 100 km a tratta
const OWNERS = { A: 'GER', B: 'GER', C: 'FRA', D: 'FRA' };
const NB = { A: ['B'], B: ['A', 'C'], C: ['B', 'D'], D: ['C'] };
const net = { has: (m) => m in OWNERS, neighbors: (m) => NB[m] ?? [], km: () => 100, owner: (m) => OWNERS[m], name: (m) => m };
const UNITS = [
  { id: 'G1', name: 'G1', nation: 'GER', category: 'infantry', echelon: 'division' },
  { id: 'G2', name: 'G2', nation: 'GER', category: 'armored', echelon: 'division' },
  { id: 'F1', name: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' },
  { id: 'F2', name: 'F2', nation: 'FRA', category: 'infantry', echelon: 'division' },
];
const unitsById = new Map(UNITS.map((u) => [u.id, u]));
const div = (n) => ({ templateId: 't', since: 'd', items: { 'manpower.war': { planned: 10000, effective: n, source: 'template' } } });
const place = (map) => ({ entries: Object.entries(map).map(([unit, province]) => ({ unit, province })) });
function make(deploy, strength, player) {
  const deploymentDoc = place(deploy);
  const ctx = { getNet: () => net, unitsById, deploymentDoc, initial: new Map(deploymentDoc.entries.map((e) => [e.unit, e.province])) };
  const forces = { schema: 'forces-v1', initialized: true, divisions: Object.fromEntries(Object.entries(strength).map(([k, v]) => [k, div(v)])) };
  let state = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player, control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal', forces };
  state = { ...state, war: { schema: 'war-v1', pairs: { 'FRA|GER': { by: player, since: 'd' } } } };
  const sys = [createAiWarSystem(ctx), createMovementSystem(net), createTheaterSystem(ctx)];
  const step = (s) => sys.reduce((acc, f) => f(acc), { ...s, day: s.day + 1 });
  return { state, ctx, step, ai: createAiWarSystem(ctx) };
}

test('nationsAtWar elenca le nazioni coinvolte', () => {
  assert.deepEqual(nationsAtWar({ pairs: { 'FRA|GER': {}, 'GER|ITA': {} } }), ['FRA', 'GER', 'ITA']);
  assert.deepEqual(nationsAtWar(undefined), []);
});

test('senza guerra l\'IA non fa nulla; fuori dal giorno di pianificazione neppure', () => {
  const m = make({ G1: 'B', F1: 'D' }, { G1: 10000, F1: 10000 }, 'GER');
  const noWar = { ...m.state, war: undefined };
  assert.equal(m.ai(noWar), noWar);
  const off = { ...m.state, day: PERIOD + 1 };
  assert.equal(m.ai(off), off);
});

test('difesa: la divisione francese più vicina va a difendere la provincia minacciata dal giocatore', () => {
  const m = make({ G1: 'B', F1: 'D', F2: 'D' }, { G1: 10000, F1: 10000, F2: 10000 }, 'GER');
  const s = m.ai(m.state);
  const defs = activeAssignments(s.theaters).filter((a) => a.nation === 'FRA' && a.kind === 'defend');
  assert.equal(defs.length, 1);
  assert.deepEqual(defs[0].provinces, ['C'], 'C è adiacente alla divisione tedesca in B');
  assert.ok(defs[0].units.length >= 1);
  assert.deepEqual(validateTheaters(s.theaters), []);
});

test('difesa sciolta quando la minaccia sparisce', () => {
  const m = make({ G1: 'B', F1: 'D' }, { G1: 10000, F1: 10000 }, 'GER');
  let s = m.ai(m.state);
  assert.equal(activeAssignments(s.theaters).length, 1);
  s = { ...s, day: PERIOD, movement: { schema: 'movement-v1', positions: { G1: 'A' }, orders: {} } };
  s = m.ai(s);
  assert.equal(activeAssignments(s.theaters).filter((a) => a.kind === 'defend').length, 0, 'la difesa è sciolta (l\'IA può invece attaccare la provincia vuota B)');
});

test('attacco: l\'IA forte attacca la provincia di frontiera debole e la conquista', () => {
  const m = make({ G1: 'B', G2: 'B', F1: 'C' }, { G1: 10000, G2: 10000, F1: 2000 }, 'FRA');
  let s = m.state;
  for (let i = 0; i < 120; i += 1) { s = m.step(s); if (provinceController(s, net, 'C') === 'GER') break; }
  const att = Object.values(s.theaters.list).filter((a) => a.nation === 'GER' && a.kind === 'attack');
  assert.ok(att.length >= 1, 'incarico di attacco creato dall\'IA tedesca');
  assert.equal(provinceController(s, net, 'C'), 'GER');
});

test('attacco: l\'IA debole non attacca (rapporto sotto la soglia)', () => {
  const m = make({ G1: 'B', F1: 'C' }, { G1: 3000, F1: 10000 }, 'FRA');
  const s = m.ai(m.state);
  assert.equal(Object.values(s.theaters?.list ?? {}).filter((a) => a.nation === 'GER' && a.kind === 'attack').length, 0);
});

test('l\'IA non assegna mai le unità del giocatore e nessuna unità sta in due incarichi attivi', () => {
  const m = make({ G1: 'B', G2: 'B', F1: 'C', F2: 'D' }, { G1: 10000, G2: 10000, F1: 10000, F2: 10000 }, 'GER');
  let s = m.state;
  for (let i = 0; i < 40; i += 1) s = m.step(s);
  const seen = new Set();
  for (const a of activeAssignments(s.theaters ?? { list: {} })) {
    assert.notEqual(a.nation, 'GER', 'il giocatore decide da sé');
    for (const u of a.units) { assert.equal(seen.has(u), false); seen.add(u); }
  }
  assert.deepEqual(validateTheaters(s.theaters ?? undefined), []);
});

test('determinismo dell\'IA di guerra', () => {
  const run = () => { const m = make({ G1: 'B', G2: 'B', F1: 'C', F2: 'D' }, { G1: 10000, G2: 10000, F1: 4000, F2: 6000 }, 'GER'); let s = m.state; for (let i = 0; i < 60; i += 1) s = m.step(s); return JSON.stringify(s); };
  assert.equal(run(), run());
});

test('playerDeclareWar + IA: dopo la dichiarazione la nazione attaccata si difende da sola', () => {
  const m = make({ G1: 'B', F1: 'D' }, { G1: 10000, F1: 10000 }, 'GER');
  let s = { ...m.state, war: undefined };
  s = playerDeclareWar(s, 'FRA');
  s = m.ai(s);
  assert.ok(activeAssignments(s.theaters ?? { list: {} }).some((a) => a.nation === 'FRA' && a.kind === 'defend'));
});
