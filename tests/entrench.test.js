// Trinceramento: curva del bonus, tick giornaliero, effetto sulla battaglia e sui piani, comando del giocatore, discendenti dell'ORBAT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entrenchBonus, DEFAULT_ENTRENCH, createEntrench, setDig, tickEntrench, validateEntrench, validateEntrenchConfig } from '../src/rules/entrench.js';
import { resolveBattleDay, divisionPower } from '../src/rules/combat.js';
import { createTheaterSystem, playerAssign, playerDeclareWar, playerToggleEntrench, entrenchOf, theaterAlerts } from '../src/game/theaterState.js';
import { createMovementSystem } from '../src/game/movementState.js';
import { validateState } from '../src/game/state.js';
import { createOrbatState, attach, descendantsOf, divisionsUnder } from '../src/rules/orbat.js';

const cfgFile = JSON.parse(readFileSync(new URL('../data/units/entrenchment.json', import.meta.url), 'utf8'));

test('dati: il file di configurazione coincide con i valori di default, è valido e dichiara la base di ipotesi', () => {
  assert.deepEqual({ maxBonus: cfgFile.maxBonus, rampDays: cfgFile.rampDays, curve: cfgFile.curve }, DEFAULT_ENTRENCH);
  assert.deepEqual(validateEntrenchConfig(cfgFile), []);
  assert.equal(cfgFile.basis, 'hypothesis');
  assert.ok(cfgFile.rationale.includes('2,25'));
  assert.ok(validateEntrenchConfig({ maxBonus: 0, rampDays: 7, curve: 'linear' }).length > 0);
  assert.ok(validateEntrenchConfig({ maxBonus: 0.5, rampDays: 0, curve: 'linear' }).length > 0);
  assert.ok(validateEntrenchConfig({ maxBonus: 0.5, rampDays: 7, curve: 'exp' }).length > 0);
});

test('curva: lineare fino al 7° giorno, poi al massimo (+50%)', () => {
  assert.equal(entrenchBonus(0), 0);
  assert.equal(entrenchBonus(-1), 0);
  assert.ok(Math.abs(entrenchBonus(1) - 0.5 / 7) < 1e-12);
  assert.ok(Math.abs(entrenchBonus(3) - 1.5 / 7) < 1e-12);
  assert.equal(entrenchBonus(7), 0.5);
  assert.equal(entrenchBonus(30), 0.5, 'oltre il 7° giorno non cresce più');
  for (let d = 1; d < 7; d += 1) assert.ok(entrenchBonus(d + 1) > entrenchBonus(d));
});

test('tick: +1 giorno se fermo e senza battaglia; la battaglia non aumenta né azzera; muoversi azzera; tetto a 7', () => {
  let e = setDig(createEntrench(), { unitIds: ['U'], on: true, positions: { U: 'P' } });
  const day = (over = {}) => { e = tickEntrench(e, [{ id: 'U', pos: 'P', hasOrder: false, fought: false, manual: true, ...over }]); return e.days.U; };
  assert.equal(day(), 1);
  assert.equal(day(), 2);
  assert.equal(day({ fought: true }), 2, 'giorno di battaglia: invariato');
  assert.equal(day(), 3);
  for (let i = 0; i < 10; i += 1) day();
  assert.equal(e.days.U, 7, 'tetto al 7° giorno');
  assert.equal(day({ pos: 'Q' }), 0, 'cambio di provincia: si riparte');
  assert.equal(day({ pos: 'Q' }), 1);
  day({ hasOrder: true });
  assert.equal(e.dig.U, undefined, 'la scelta manuale cade quando l\'unità riceve un ordine di marcia');
  assert.deepEqual(validateEntrench(e), []);
  assert.ok(validateEntrench({ ...e, days: { U: -1 } }).length > 0);
  assert.deepEqual(setDig(e, { unitIds: ['U'], on: false, positions: {} }).dig, {});
});

test('battaglia: il difensore trincerato (+50%) perde meno e fa perdere di più; l\'attaccante non ha bonus', () => {
  const A = [{ id: 'a', category: 'infantry', effective: 10000, planned: 10000 }];
  const plain = resolveBattleDay({ attackers: A, defenders: [{ id: 'd', category: 'infantry', effective: 10000, planned: 10000 }] });
  const dug = resolveBattleDay({ attackers: A, defenders: [{ id: 'd', category: 'infantry', effective: 10000, planned: 10000, bonus: 0.5 }] });
  assert.ok(dug.defenderLoss.d < plain.defenderLoss.d);
  assert.ok(dug.attackerLoss.a > plain.attackerLoss.a);
  assert.equal(dug.defenderPower, 15000);
  assert.equal(divisionPower({ category: 'infantry', effective: 100, bonus: 0.5 }), 150);
  assert.equal(divisionPower({ category: 'infantry', effective: 100, bonus: -1 }), 100, 'bonus negativo ignorato');
});

// X(GER) - Y(FRA) : il tedesco in X trincerato, l'attaccante francese in Y
const OWNERS = { X: 'GER', Y: 'FRA' };
const net = { has: (m) => m in OWNERS, neighbors: (m) => (m === 'X' ? ['Y'] : ['X']), km: () => 100, owner: (m) => OWNERS[m], name: (m) => m };
const UNITS = [
  { id: 'G1', name: 'G1', nation: 'GER', category: 'infantry', echelon: 'division' },
  { id: 'F1', name: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' },
  { id: 'F2', name: 'F2', nation: 'FRA', category: 'infantry', echelon: 'division' },
];
const unitsById = new Map(UNITS.map((u) => [u.id, u]));
const div = (n) => ({ templateId: 't', since: 'd', items: { 'manpower.war': { planned: 10000, effective: n, source: 'template' } } });
function make(player = 'GER', fra = 10000) {
  const entries = [{ unit: 'G1', province: 'X' }, { unit: 'F1', province: 'Y' }, { unit: 'F2', province: 'Y' }];
  const ctx = { getNet: () => net, unitsById, deploymentDoc: { entries }, initial: new Map(entries.map((e) => [e.unit, e.province])) };
  const state = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player, control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal',
    forces: { schema: 'forces-v1', initialized: true, divisions: { G1: div(10000), F1: div(fra), F2: div(fra) } } };
  const sys = [createMovementSystem(net), createTheaterSystem(ctx)];
  const step = (s) => sys.reduce((acc, f) => f(acc), { ...s, day: s.day + 1 });
  return { state, ctx, step, run: (s, n) => { let x = s; for (let i = 0; i < n; i += 1) x = step(x); return x; } };
}

test('comando del giocatore: si trincera solo con unità proprie e in grado di combattere; la scheda dà giorni e bonus', () => {
  const m = make();
  assert.throws(() => playerToggleEntrench(m.state, { unitIds: ['F1'], on: true, ctx: m.ctx }), /non è tua/);
  assert.throws(() => playerToggleEntrench(m.state, { unitIds: ['G9'], on: true, ctx: m.ctx }), /inesistente/);
  let s = playerToggleEntrench(m.state, { unitIds: ['G1'], on: true, ctx: m.ctx });
  assert.deepEqual(entrenchOf(s, 'G1'), { digging: true, days: 0, bonus: 0 });
  s = m.run(s, 3);
  assert.equal(entrenchOf(s, 'G1').days, 3);
  assert.ok(Math.abs(entrenchOf(s, 'G1').bonus - 1.5 / 7) < 1e-12);
  s = m.run(s, 10);
  assert.deepEqual([entrenchOf(s, 'G1').days, entrenchOf(s, 'G1').bonus], [7, 0.5]);
  assert.deepEqual(validateState({ ...s, nations: null, commanders: { schema: 'commanders-v1', assignments: {} } }).filter((e) => /trinceramento/.test(e)), []);
  s = playerToggleEntrench(s, { unitIds: ['G1'], on: false, ctx: m.ctx });
  assert.deepEqual(entrenchOf(s, 'G1'), { digging: false, days: 0, bonus: 0 });
  const dead = { ...m.state, forces: { ...m.state.forces, divisions: { ...m.state.forces.divisions, G1: div(0) } } };
  assert.throws(() => playerToggleEntrench(dead, { unitIds: ['G1'], on: true, ctx: m.ctx }), /non può trincerarsi/);
});

test('un\'unità che parte (ordine di marcia) smette di trincerarsi e perde il bonus', () => {
  const m = make('GER', 1000); // nemico debole: l'attacco parte subito
  let s = playerToggleEntrench(m.state, { unitIds: ['G1'], on: true, ctx: m.ctx });
  s = m.run(s, 4);
  assert.equal(entrenchOf(s, 'G1').days, 4);
  s = playerDeclareWar(s, 'FRA');
  s = playerAssign(s, { kind: 'attack', provinces: ['Y'], units: ['G1'], ctx: m.ctx }).state;
  s = m.run(s, 2);
  assert.equal(entrenchOf(s, 'G1').bonus, 0);
});

test('incarico di difesa: le divisioni al posto si trincerano da sole e il bonus entra nel conteggio delle truppe', () => {
  const m = make('GER');
  let s = playerDeclareWar(m.state, 'FRA');
  s = playerAssign(s, { kind: 'defend', provinces: ['X'], units: ['G1'], ctx: m.ctx }).state;
  s = m.run(s, 8);
  assert.equal(entrenchOf(s, 'G1').days, 7);
  // una difesa trincerata copre di più: 10000 × 1,5 = 15000 presenti contro un fabbisogno di 1,2 × 20000 = 24000 (nemico 2 × 10000 in Y)
  const a = theaterAlerts(s, m.ctx, 'GER')[0];
  assert.equal(a.have, 15000);
  assert.equal(a.need, 24000);
});

test('attacco: serve più forza contro un nemico trincerato (il suo bonus conta nel fabbisogno)', () => {
  const m = make('FRA');
  const dug = { ...m.state, entrench: { schema: 'entrench-v1', dig: { G1: true }, days: { G1: 7 }, pos: { G1: 'X' } }, war: { schema: 'war-v1', pairs: { 'FRA|GER': { by: 'FRA', since: 'd' } } } };
  const plain = { ...dug, entrench: undefined };
  const needOf = (s) => { const t = playerAssign(s, { kind: 'attack', provinces: ['X'], units: ['F1'], ctx: m.ctx }).state; return theaterAlerts(t, m.ctx, 'FRA')[0]?.need ?? 0; };
  assert.equal(needOf(plain), 15000, '1,5 × 10000');
  assert.equal(needOf(dug), 22500, '1,5 × 10000 × 1,5');
});

test('ORBAT: le divisioni agli ordini di un corpo o di un\'armata, a qualsiasi livello', () => {
  const units = [
    { id: 'ARM', name: 'Armata', nation: 'GER', category: 'command', commandLevel: 'army', echelon: 'command', startYear: 1930, endYear: null },
    { id: 'COR', name: 'Corpo', nation: 'GER', category: 'command', commandLevel: 'corps', echelon: 'command', startYear: 1930, endYear: null },
    { id: 'D1', name: 'D1', nation: 'GER', category: 'infantry', echelon: 'division', startYear: 1930, endYear: null },
    { id: 'D2', name: 'D2', nation: 'GER', category: 'armored', echelon: 'division', startYear: 1930, endYear: null },
  ];
  const byId = new Map(units.map((u) => [u.id, u]));
  let o = createOrbatState();
  const link = (c, p) => { o = attach(o, { childId: c, parentId: p, units, date: '1936-01-01' }).state; };
  link('COR', 'ARM'); link('D1', 'COR'); link('D2', 'ARM');
  assert.deepEqual(descendantsOf(o, 'ARM'), ['COR', 'D1', 'D2']);
  assert.deepEqual(divisionsUnder(o, 'ARM', byId), ['D1', 'D2']);
  assert.deepEqual(divisionsUnder(o, 'COR', byId), ['D1']);
  assert.deepEqual(divisionsUnder(o, 'D1', byId), []);
});

test('determinismo del trinceramento', () => {
  const run = () => { const m = make(); let s = playerToggleEntrench(m.state, { unitIds: ['G1'], on: true, ctx: m.ctx }); s = playerDeclareWar(s, 'FRA'); return JSON.stringify(m.run(s, 20)); };
  assert.equal(run(), run());
});
