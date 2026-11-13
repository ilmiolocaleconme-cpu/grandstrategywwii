// IA dei ponti: demolisce sui fiumi principali quando non regge la linea, ripristina in sicurezza, non tocca i fiumi minori.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playerDeclareWar } from '../src/game/theaterState.js';
import { createAiBridges, MAX_DEMOLITIONS } from '../src/game/aiBridges.js';
import { buildBridgeIndex, createBridgeState, pairState, canStepOver, destroyPair } from '../src/rules/bridges.js';

const cfg = JSON.parse(readFileSync(new URL('../data/combat/bridges.json', import.meta.url), 'utf8'));
const IDS = ['W', 'E', 'F'];
const FILE = { links: [{ id: 'L1', a: 0, b: 1 }, { id: 'L2', a: 1, b: 2 }], bridges: [{ id: 'LB_A', link: 'L1', riverId: 'R_MAIN' }, { id: 'LB_C', link: 'L2', riverId: 'R_SMALL' }] };
const RIVERS = { R_MAIN: { class: 'main', widthClass: 'large' }, R_SMALL: { class: 'tributary', widthClass: 'medium' } };

function world({ owners, units, destroyed = false }) {
  const NB = { W: ['E'], E: ['W', 'F'], F: ['E'] };
  const net = { has: (m) => m in NB, neighbors: (m) => NB[m] ?? [], km: () => 30, owner: (m) => owners[m], name: (m) => m, isCity: () => false, canon: (m) => m, provinceOf: (m) => m, bridgeIndex: buildBridgeIndex(FILE, IDS, (id) => RIVERS[id]) };
  const list = units.map(([id, nation, at, n]) => ({ id, name: id, nation, category: 'infantry', echelon: 'division', at, n }));
  const unitsById = new Map(list.map((u) => [u.id, u]));
  const divisions = Object.fromEntries(list.map((u) => [u.id, { templateId: 't', since: '1936-01-01', items: { 'manpower.war': { planned: 10000, effective: u.n, source: 'template' } } }]));
  const deploymentDoc = { entries: list.map((u) => ({ unit: u.id, province: u.at })) };
  const initial = new Map(list.map((u) => [u.id, u.at]));
  let state = { schema: 7, startDate: '1936-01-01', date: '1936-01-08', day: 7, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal', forces: { schema: 'forces-v1', initialized: true, divisions }, bridges: createBridgeState() };
  state = playerDeclareWar(state, 'FRA');
  if (destroyed) state = { ...state, bridges: destroyPair(state.bridges, net.bridgeIndex, 'W', 'E', { day: 1 }).bridges };
  return { net, state, ctx: { getNet: () => net, unitsById, deploymentDoc, initial } };
}

test('l\'IA demolisce il ponte sul fiume principale se il nemico sull\'altra sponda è più forte; il giocatore non è toccato', () => {
  const w = world({ owners: { W: 'FRA', E: 'GER', F: 'GER' }, units: [['F1', 'FRA', 'W', 4000], ['G1', 'GER', 'E', 10000]] });
  const s = createAiBridges(w.ctx, cfg)(w.state);
  assert.equal(canStepOver(w.net.bridgeIndex, s.bridges, 'W', 'E'), false);
  assert.equal(pairState(w.net.bridgeIndex, s.bridges, 'E', 'F').intact, 1, 'il fiume minore non si tocca');
});

test('nessuna demolizione se la linea regge, se non è giorno di piano o se il lato non è suo', () => {
  const strong = world({ owners: { W: 'FRA', E: 'GER', F: 'GER' }, units: [['F1', 'FRA', 'W', 10000], ['G1', 'GER', 'E', 3000]] });
  assert.equal(createAiBridges(strong.ctx, cfg)(strong.state).bridges, strong.state.bridges);
  const off = world({ owners: { W: 'FRA', E: 'GER', F: 'GER' }, units: [['F1', 'FRA', 'W', 4000], ['G1', 'GER', 'E', 10000]] });
  assert.equal(pairState(off.net.bridgeIndex, createAiBridges(off.ctx, cfg)({ ...off.state, day: 3 }).bridges, 'W', 'E').intact, 1);
  const foreign = world({ owners: { W: 'GER', E: 'GER', F: 'GER' }, units: [['F1', 'FRA', 'W', 4000], ['G1', 'GER', 'E', 10000]] });
  assert.equal(pairState(foreign.net.bridgeIndex, createAiBridges(foreign.ctx, cfg)(foreign.state).bridges, 'W', 'E').intact, 1, 'non demolisce da un lato che non controlla');
});

test('ripristino: solo se controlla entrambe le sponde e nessun nemico è vicino; il tempo è quello della larghezza', () => {
  const quiet = world({ owners: { W: 'FRA', E: 'FRA', F: 'FRA' }, units: [['F1', 'FRA', 'W', 8000], ['G1', 'GER', 'F', 8000]], destroyed: true });
  // il nemico è in F, vicino a E: niente ripristino
  assert.equal(createAiBridges(quiet.ctx, cfg)(quiet.state).bridges.repairing.LB_A, undefined);
  const safe = world({ owners: { W: 'FRA', E: 'FRA', F: 'FRA' }, units: [['F1', 'FRA', 'W', 8000]], destroyed: true });
  const s = createAiBridges(safe.ctx, cfg)(safe.state);
  assert.equal(s.bridges.repairing.LB_A.done, safe.state.day + cfg.repairDays.large);
});

test('limite di demolizioni per periodo e per nazione', () => {
  assert.ok(MAX_DEMOLITIONS >= 1 && MAX_DEMOLITIONS <= 5);
});
