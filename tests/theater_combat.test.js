// Guerra, incarichi di teatro, combattimento e conquista: regole pure (rete sintetica) e sistema giornaliero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWar, declareWar, makePeace, atWar, enemiesOf, validateWar, pairKey } from '../src/rules/war.js';
import { createTheaters, createAssignment, cancelAssignment, assignmentOfUnit, activeAssignments, validateTheaters, dropUnits } from '../src/rules/theater.js';
import { resolveBattleDay, divisionPower, CATEGORY_POWER, RETREAT_BELOW } from '../src/rules/combat.js';
import { createTheaterSystem, playerAssign, playerDeclareWar, playerCancelAssignment, playerForceAttack, theaterAlerts, provinceController, validateCombat } from '../src/game/theaterState.js';
import { createMovementSystem, canEnterFor } from '../src/game/movementState.js';
import { validateState } from '../src/game/state.js';

// rete sintetica A(GER) - B(FRA) - C(FRA), 100 km a tratta
const OWNERS = { A: 'GER', B: 'FRA', C: 'FRA' };
const NB = { A: ['B'], B: ['A', 'C'], C: ['B'] };
const net = { has: (m) => m in OWNERS, neighbors: (m) => NB[m] ?? [], km: () => 100, owner: (m) => OWNERS[m] ?? null, name: (m) => `Prov ${m}` };
const UNITS = [
  { id: 'G1', name: '1. Div', nation: 'GER', category: 'infantry', echelon: 'division' },
  { id: 'G2', name: '2. Pz', nation: 'GER', category: 'armored', echelon: 'division' },
  { id: 'F1', name: '1re Div', nation: 'FRA', category: 'infantry', echelon: 'division' },
];
const unitsById = new Map(UNITS.map((u) => [u.id, u]));
const div = (n) => ({ templateId: 't', since: '1936-01-01', items: { 'manpower.war': { planned: 10000, effective: n, source: 'template' } } });
const DEPLOY = { entries: [{ unit: 'G1', province: 'A' }, { unit: 'G2', province: 'A' }, { unit: 'F1', province: 'C' }] };
const initial = new Map(DEPLOY.entries.map((e) => [e.unit, e.province]));
const ctx = { getNet: () => net, unitsById, deploymentDoc: DEPLOY, initial };

function base({ ger = 10000, pz = 10000, fra = 4000 } = {}) {
  return {
    schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal',
    forces: { schema: 'forces-v1', initialized: true, divisions: { G1: div(ger), G2: div(pz), F1: div(fra) } },
  };
}
const step = (s) => { const next = { ...s, day: s.day + 1 }; return createTheaterSystem(ctx)(createMovementSystem(net)(next)); };

test('guerra: dichiarazione, simmetria, pace, validazione', () => {
  let w = createWar();
  assert.equal(atWar(w, 'GER', 'FRA'), false);
  w = declareWar(w, { a: 'GER', b: 'FRA', date: '1936-02-01' });
  assert.equal(atWar(w, 'FRA', 'GER'), true);
  assert.deepEqual(enemiesOf(w, 'FRA'), ['GER']);
  assert.throws(() => declareWar(w, { a: 'FRA', b: 'GER', date: 'x' }), /già in guerra/);
  assert.throws(() => declareWar(w, { a: 'GER', b: 'GER', date: 'x' }), /sé stessa/);
  assert.deepEqual(validateWar(w), []);
  assert.equal(pairKey('B', 'A'), 'A|B');
  assert.deepEqual(validateWar({ ...w, pairs: { 'ZZ|AA': { by: 'ZZ', since: 'x' } } }).length > 0, true);
  assert.equal(atWar(makePeace(w, { a: 'FRA', b: 'GER' }), 'GER', 'FRA'), false);
  assert.equal(atWar(undefined, 'GER', 'FRA'), false);
});

test('incarichi: creazione, un solo incarico per unità, annullamento, validazione', () => {
  let th = createTheaters();
  const a = createAssignment(th, { nation: 'GER', kind: 'attack', provinces: ['C', 'C', 'B'], units: ['G1', 'G2'], date: '1936-01-01' });
  assert.equal(a.id, 'TH-0001');
  assert.deepEqual(a.state.list['TH-0001'].provinces, ['C', 'B']);
  const b = createAssignment(a.state, { nation: 'GER', kind: 'defend', provinces: ['A'], units: ['G2'], date: '1936-01-02' });
  assert.equal(assignmentOfUnit(b.state, 'G2').id, 'TH-0002');
  assert.deepEqual(b.state.list['TH-0001'].units, ['G1']);
  const c = createAssignment(b.state, { nation: 'GER', kind: 'defend', provinces: ['A'], units: ['G1'], date: '1936-01-03' });
  assert.equal(c.state.list['TH-0001'].status, 'cancelled', 'senza unità si chiude');
  assert.equal(activeAssignments(c.state).length, 2);
  assert.deepEqual(validateTheaters(c.state), []);
  assert.throws(() => createAssignment(th, { nation: 'GER', kind: 'attack', provinces: [], units: ['G1'], date: 'x' }), /almeno una provincia/);
  assert.throws(() => createAssignment(th, { nation: 'GER', kind: 'attack', provinces: ['A'], units: [], date: 'x' }), /almeno/);
  assert.throws(() => createAssignment(th, { nation: 'GER', kind: 'raid', provinces: ['A'], units: ['G1'], date: 'x' }), /sconosciuto/);
  assert.equal(cancelAssignment(c.state, 'TH-0002', { date: 'd' }).list['TH-0002'].status, 'cancelled');
  assert.throws(() => cancelAssignment(th, 'TH-9', { date: 'd' }), /inesistente/);
  assert.equal(dropUnits(c.state, ['G1'], { date: 'd' }).list['TH-0003'].status, 'cancelled');
  const broken = { ...c.state, list: { ...c.state.list, 'TH-0009': { ...c.state.list['TH-0002'], id: 'TH-0009' } } };
  assert.ok(validateTheaters(broken).some((e) => e.includes('due incarichi attivi')));
});

test('combattimento: deterministico, la corazzata pesa di più, perdite limitate agli effettivi', () => {
  const A = [{ id: 'a', category: 'infantry', effective: 10000, planned: 10000 }];
  const D = [{ id: 'd', category: 'infantry', effective: 10000, planned: 10000 }];
  const r1 = resolveBattleDay({ attackers: A, defenders: D });
  assert.deepEqual(r1, resolveBattleDay({ attackers: A, defenders: D }), 'stesso ingresso, stesso esito');
  assert.equal(r1.attackerLoss.a, r1.defenderLoss.d, 'forze pari, perdite pari');
  const Tank = [{ id: 'a', category: 'armored', effective: 10000, planned: 10000 }];
  const r2 = resolveBattleDay({ attackers: Tank, defenders: D });
  assert.ok(r2.defenderLoss.d > r2.attackerLoss.a);
  assert.ok(divisionPower({ category: 'armored', effective: 100 }) > divisionPower({ category: 'infantry', effective: 100 }));
  assert.equal(divisionPower({ category: 'command', effective: 100 }), 0);
  assert.ok(CATEGORY_POWER.armored > CATEGORY_POWER.infantry);
  const r3 = resolveBattleDay({ attackers: A, defenders: [{ id: 'd', category: 'infantry', effective: 1, planned: 10000 }] });
  assert.equal(r3.defenderLoss.d, 1, 'mai oltre gli effettivi');
  assert.equal(r3.defenderRetreats, true);
  assert.equal(r3.attackerRetreats, false);
  const weak = resolveBattleDay({ attackers: [{ id: 'a', category: 'infantry', effective: 10000 * RETREAT_BELOW - 100, planned: 10000 }], defenders: D });
  assert.equal(weak.attackerRetreats, true);
});

test('combattimento: il moltiplicatore di difesa riduce le perdite del difensore e aumenta quelle dell\'attaccante', () => {
  const A = [{ id: 'a', category: 'infantry', effective: 10000, planned: 10000 }];
  const D = [{ id: 'd', category: 'infantry', effective: 10000, planned: 10000 }];
  const plain = resolveBattleDay({ attackers: A, defenders: D });
  const dug = resolveBattleDay({ attackers: A, defenders: D, defenseMultiplier: 1.5 });
  assert.ok(dug.attackerLoss.a > plain.attackerLoss.a);
  assert.ok(dug.defenderLoss.d < plain.defenderLoss.d);
});

test('movimento: in guerra si può entrare nelle province nemiche, in pace no', () => {
  const s = base();
  assert.equal(canEnterFor(s, net, 'GER')('B'), false);
  const w = playerDeclareWar(s, 'FRA');
  assert.equal(canEnterFor(w, net, 'GER')('B'), true);
  assert.equal(canEnterFor(w, net, 'GER')('A'), true);
  assert.equal(canEnterFor(w, net, 'GER')('Z'), false);
});

test('incarico di attacco: marcia, conquista della provincia vuota, battaglia, conquista dell\'obiettivo, incarico chiuso', () => {
  let s = playerDeclareWar(base({ fra: 3000 }), 'FRA');
  const r = playerAssign(s, { kind: 'attack', provinces: ['C'], units: ['G1', 'G2'], ctx });
  s = r.state;
  assert.equal(r.id, 'TH-0001');
  let sawBattle = false;
  let capturedB = false;
  for (let i = 0; i < 400 && s.theaters.list['TH-0001'].status === 'active'; i += 1) {
    s = step(s);
    if (s.combat?.log.some((e) => e.province === 'B' && e.outcome.startsWith('conquistata'))) capturedB = true;
    if (s.combat?.log.some((e) => e.province === 'C' && e.defenders.length)) sawBattle = true;
  }
  assert.equal(capturedB, true, 'B era vuota: occupata durante la marcia');
  assert.equal(sawBattle, true);
  assert.equal(s.theaters.list['TH-0001'].status, 'done');
  assert.equal(provinceController(s, net, 'C'), 'GER');
  assert.equal(s.provinces.C.occupation, 'occupied');
  assert.ok(s.forces.divisions.F1.items['manpower.war'].effective < 3000, 'il difensore ha perso uomini');
  assert.ok(s.forces.divisions.G1.items['manpower.war'].effective < 10000 || s.forces.divisions.G2.items['manpower.war'].effective < 10000, 'anche l\'attaccante ha pagato');
  assert.deepEqual(validateState({ ...s, nations: null, commanders: { schema: 'commanders-v1', assignments: {} } }).filter((e) => /guerra|teatri|combattimento/.test(e)), []);
  assert.deepEqual(validateCombat(s.combat), []);
});

test('un attaccante troppo debole aspetta al confine e segna l\'avviso; forzato attacca, viene respinto e l\'obiettivo resta al difensore', () => {
  let s = playerDeclareWar(base({ ger: 1500, pz: 0, fra: 20000 }), 'FRA');
  s = playerAssign(s, { kind: 'attack', provinces: ['C'], units: ['G1'], ctx }).state;
  for (let i = 0; i < 30; i += 1) s = step(s);
  assert.equal(s.movement?.positions?.G1 ?? 'A', 'A', 'resta nel punto di raccolta');
  assert.equal(s.combat, undefined, 'nessuna battaglia: non parte senza la superiorità');
  assert.equal(theaterAlerts(s, ctx, 'GER')[0].level, 'short');
  s = playerForceAttack(s, 'TH-0001');
  for (let i = 0; i < 90; i += 1) s = step(s);
  assert.equal(provinceController(s, net, 'C'), 'FRA');
  assert.ok(s.combat.log.some((e) => e.outcome === 'attaccanti respinti'), 'almeno un respingimento nel registro');
  assert.ok(s.forces.divisions.G1.items['manpower.war'].effective < 1500);
});

test('incarico di difesa: le unità raggiungono la provincia da tenere e restano', () => {
  let s = playerDeclareWar(base(), 'FRA');
  s = { ...s, provinces: { B: { controller: 'GER', occupation: 'occupied' } } };
  s = playerAssign(s, { kind: 'defend', provinces: ['B'], units: ['G1'], ctx }).state;
  for (let i = 0; i < 12; i += 1) s = step(s);
  assert.equal(s.movement.positions.G1, 'B');
  assert.equal(s.theaters.list['TH-0001'].status, 'active', 'la difesa non si chiude da sola');
  s = playerCancelAssignment(s, 'TH-0001');
  assert.equal(s.theaters.list['TH-0001'].status, 'cancelled');
});

test('controlli del giocatore: attacco solo contro nazioni in guerra, difesa solo di province proprie, solo unità proprie e combattenti', () => {
  const peace = base();
  assert.throws(() => playerAssign(peace, { kind: 'attack', provinces: ['C'], units: ['G1'], ctx }), /non sei in guerra/);
  const war = playerDeclareWar(peace, 'FRA');
  assert.throws(() => playerAssign(war, { kind: 'defend', provinces: ['C'], units: ['G1'], ctx }), /non è tua/);
  assert.throws(() => playerAssign(war, { kind: 'attack', provinces: ['C'], units: ['F1'], ctx }), /non è tua/);
  assert.throws(() => playerAssign(war, { kind: 'attack', provinces: ['Z'], units: ['G1'], ctx }), /sconosciuta/);
  assert.throws(() => playerAssign(base({ ger: 0 }), { kind: 'attack', provinces: ['C'], units: ['G1'], ctx }), /non può combattere/);
  assert.throws(() => playerAssign(war, { kind: 'attack', provinces: ['C'], units: ['X9'], ctx }), /inesistente/);
});

test('senza guerra né incarichi il sistema non cambia nulla', () => {
  const s = base();
  assert.equal(createTheaterSystem(ctx)(s), s);
});

test('determinismo: due partite uguali danno lo stesso risultato', () => {
  const run = () => {
    let s = playerDeclareWar(base({ fra: 3000 }), 'FRA');
    s = playerAssign(s, { kind: 'attack', provinces: ['C'], units: ['G1', 'G2'], ctx }).state;
    for (let i = 0; i < 80; i += 1) s = step(s);
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});
