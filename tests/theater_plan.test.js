// Pianificazione degli incarichi: difesa ai confini, raccolta prima dell'attacco, avvisi «servono più truppe».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTheaterSystem, playerAssign, playerDeclareWar, playerForceAttack, theaterAlerts } from '../src/game/theaterState.js';
import { createMovementSystem } from '../src/game/movementState.js';
import { defensePosts, MIN_GARRISON, DEFENSE_MARGIN, ATTACK_RATIO } from '../src/game/theaterPlan.js';
import { validateTheaters } from '../src/rules/theater.js';

// X - Y - Z - E   e   Y - W - E2 ; X, Y, Z, W tuoi (GER); E, E2 nemici (FRA); 100 km a tratta
const OWNERS = { X: 'GER', Y: 'GER', Z: 'GER', W: 'GER', E: 'FRA', E2: 'FRA' };
const NB = { X: ['Y'], Y: ['X', 'Z', 'W'], Z: ['Y', 'E'], W: ['Y', 'E2'], E: ['Z'], E2: ['W'] };
const net = { has: (m) => m in OWNERS, neighbors: (m) => NB[m] ?? [], km: () => 100, owner: (m) => OWNERS[m], name: (m) => `Prov ${m}` };
const UNITS = ['G1', 'G2', 'G3', 'G4'].map((id) => ({ id, name: id, nation: 'GER', category: 'infantry', echelon: 'division' }))
  .concat([{ id: 'F1', name: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' }]);
const unitsById = new Map(UNITS.map((u) => [u.id, u]));
const div = (n) => ({ templateId: 't', since: 'd', items: { 'manpower.war': { planned: 10000, effective: n, source: 'template' } } });

function make({ enemy = 12000, deploy = {} } = {}) {
  const entries = Object.entries({ G1: 'X', G2: 'X', G3: 'X', G4: 'X', F1: 'E', ...deploy }).map(([unit, province]) => ({ unit, province }));
  const ctx = { getNet: () => net, unitsById, deploymentDoc: { entries }, initial: new Map(entries.map((e) => [e.unit, e.province])) };
  const forces = { schema: 'forces-v1', initialized: true, divisions: { G1: div(10000), G2: div(10000), G3: div(10000), G4: div(10000), F1: div(enemy) } };
  const state = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal', forces };
  const sys = [createMovementSystem(net), createTheaterSystem(ctx)];
  const step = (s) => sys.reduce((acc, f) => f(acc), { ...s, day: s.day + 1 });
  const run = (s, n) => { let x = s; for (let i = 0; i < n; i += 1) x = step(x); return x; };
  return { state, ctx, step, run };
}
const pos = (s, u) => s.movement?.positions?.[u];

test('posti di difesa: solo le province scelte che toccano un territorio non tuo; se nessuna, tutte', () => {
  const m = make();
  const s = m.state;
  assert.deepEqual(defensePosts(s, net, { nation: 'GER', provinces: ['X', 'Y', 'Z', 'W'] }), ['Z', 'W']);
  assert.deepEqual(defensePosts(s, net, { nation: 'GER', provinces: ['X', 'Y'] }), ['X', 'Y']);
});

test('difesa: le truppe vanno ai confini e si ripartiscono tra i posti', () => {
  const m = make();
  let s = playerDeclareWar(m.state, 'FRA');
  s = playerAssign(s, { kind: 'defend', provinces: ['X', 'Y', 'Z', 'W'], units: ['G1', 'G2'], ctx: m.ctx }).state;
  s = m.run(s, 40);
  assert.deepEqual([pos(s, 'G1'), pos(s, 'G2')].sort(), ['W', 'Z'], 'una per posto, nessuna resta all\'interno');
});

test('difesa senza guerra: vanno comunque al confine, ma nessun avviso (nessun fabbisogno)', () => {
  const m = make();
  let s = playerAssign({ ...m.state, war: undefined }, { kind: 'defend', provinces: ['X', 'Y', 'Z', 'W'], units: ['G1'], ctx: m.ctx }).state;
  s = m.run(s, 40);
  assert.ok(['Z', 'W'].includes(pos(s, 'G1')));
  assert.deepEqual(theaterAlerts(s, m.ctx, 'GER'), []);
});

test('difesa: avviso «servono più truppe» quando la minaccia supera i presenti e gli in arrivo; sparisce con rinforzi', () => {
  const m = make({ enemy: 30000 }); // nemico in E, adiacente a Z: fabbisogno = 1,2 × 30000 = 36000
  let s = playerDeclareWar(m.state, 'FRA');
  s = playerAssign(s, { kind: 'defend', provinces: ['Z'], units: ['G1'], ctx: m.ctx }).state;
  let alerts = theaterAlerts(s, m.ctx, 'GER');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].province, 'Z');
  assert.equal(alerts[0].level, 'short');
  assert.equal(alerts[0].need, Math.round(DEFENSE_MARGIN * 30000));
  assert.equal(alerts[0].have, 0);
  assert.equal(alerts[0].arriving, 10000, 'la divisione che il piano sta per mandare conta già come in arrivo');
  assert.equal(alerts[0].missing, 26000);
  assert.equal(alerts[0].divisions, 3);
  s = m.run(s, 1); // la divisione parte: ora è «in arrivo»
  alerts = theaterAlerts(s, m.ctx, 'GER');
  assert.equal(alerts[0].arriving, 10000);
  assert.equal(alerts[0].missing, 26000);
  // aggiungere unità: il piano le manda tutte a Z e l'avviso si chiude quando bastano (4 × 10000 = 40000 ≥ 36000)
  s = playerAssign(s, { kind: 'defend', provinces: ['Z'], units: ['G1', 'G2', 'G3', 'G4'], ctx: m.ctx }).state;
  s = m.run(s, 60);
  assert.deepEqual(theaterAlerts(s, m.ctx, 'GER').filter((a) => a.level === 'short'), []);
});

test('difesa: una provincia di confine con una nazione in guerra richiede almeno la guarnigione minima', () => {
  const m = make({ enemy: 1000 });
  let s = playerDeclareWar(m.state, 'FRA');
  s = playerAssign(s, { kind: 'defend', provinces: ['Z'], units: ['G1'], ctx: m.ctx }).state;
  assert.equal(theaterAlerts(s, m.ctx, 'GER')[0].need, MIN_GARRISON);
});

test('attacco: le truppe si raccolgono al confine e partono solo con la superiorità richiesta; l\'avviso dice quanto manca', () => {
  const m = make({ enemy: 12000 }); // fabbisogno: 1,5 × 12000 = 18000
  let s = playerDeclareWar(m.state, 'FRA');
  s = playerAssign(s, { kind: 'attack', provinces: ['E'], units: ['G1'], ctx: m.ctx }).state;
  s = m.run(s, 40);
  assert.equal(pos(s, 'G1'), 'Z', 'raccolta al confine (ultima provincia tua sul percorso)');
  assert.equal(s.combat, undefined, 'nessun attacco con 10000 contro 18000 richiesti');
  const alert = theaterAlerts(s, m.ctx, 'GER')[0];
  assert.deepEqual([alert.level, alert.province, alert.need, alert.have, alert.missing, alert.divisions], ['short', 'E', ATTACK_RATIO * 12000, 10000, 8000, 1]);
  // con una seconda divisione la forza raccolta (20000) basta e l'attacco parte
  s = playerAssign(s, { kind: 'attack', provinces: ['E'], units: ['G1', 'G2'], ctx: m.ctx }).state;
  s = m.run(s, 80);
  assert.ok(s.combat?.log.some((e) => e.province === 'E'), 'battaglia in E dopo la raccolta');
});

test('attacco: la forzatura del giocatore lo fa partire subito anche in inferiorità; obiettivo vuoto parte senza attendere', () => {
  const m = make({ enemy: 12000 });
  let s = playerDeclareWar(m.state, 'FRA');
  s = playerAssign(s, { kind: 'attack', provinces: ['E'], units: ['G1'], ctx: m.ctx }).state;
  s = playerForceAttack(s, 'TH-0001');
  assert.equal(s.theaters.list['TH-0001'].force, true);
  assert.deepEqual(theaterAlerts(s, m.ctx, 'GER'), []);
  s = m.run(s, 80);
  assert.ok(s.combat?.log.some((e) => e.province === 'E'));
  const empty = make({ deploy: { F1: 'E2' } });
  let t = playerDeclareWar(empty.state, 'FRA');
  t = playerAssign(t, { kind: 'attack', provinces: ['E'], units: ['G1'], ctx: empty.ctx }).state;
  assert.deepEqual(theaterAlerts(t, empty.ctx, 'GER'), [], 'E è vuota: nessun avviso');
  t = empty.run(t, 60);
  assert.equal(t.provinces?.E?.controller, 'GER', 'conquistata senza raccolta');
  assert.throws(() => playerForceAttack(t, 'TH-9'), /inesistente/);
});

test('avvisi: solo per la nazione richiesta; il campo force deve essere booleano', () => {
  const m = make({ enemy: 30000 });
  let s = playerDeclareWar(m.state, 'FRA');
  s = playerAssign(s, { kind: 'defend', provinces: ['Z'], units: ['G1'], ctx: m.ctx }).state;
  assert.deepEqual(theaterAlerts(s, m.ctx, 'FRA'), []);
  assert.deepEqual(validateTheaters({ ...s.theaters, list: { 'TH-0001': { ...s.theaters.list['TH-0001'], force: 'sì' } } }).length > 0, true);
  assert.throws(() => playerForceAttack(s, 'TH-0001'), /solo un attacco/);
});

test('determinismo del piano', () => {
  const run = () => { const m = make({ enemy: 12000 }); let s = playerDeclareWar(m.state, 'FRA'); s = playerAssign(s, { kind: 'attack', provinces: ['E'], units: ['G1', 'G2'], ctx: m.ctx }).state; return JSON.stringify(m.run(s, 70)); };
  assert.equal(run(), run());
});
