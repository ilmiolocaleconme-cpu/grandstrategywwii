// Terreno e fiumi nella battaglia terrestre (16/11/2026): regole pure, dati reali e sistema giornaliero su una rete sintetica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainDefense, terrainCategoryFactor, riverFactor, validateTerrainCombat } from '../src/rules/terrainCombat.js';
import { createRiverIndex, validateRiverCrossings, buildRiverCrossings } from '../src/data/riverCrossings.js';
import { buildFile } from '../scripts/build-river-crossings.js';
import { divisionPower, resolveBattleDay } from '../src/rules/combat.js';
import { tickMovement, issueMove, createMovementState, validateMovement } from '../src/rules/movement.js';
import { createTheaterSystem, playerDeclareWar, battleGround } from '../src/game/theaterState.js';
import { createMovementSystem } from '../src/game/movementState.js';
import { groundDefenseOf } from '../src/game/theaterPlan.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = read('units/terrain_combat.json');
const terrainDoc = read('terrain.json');
const riversFile = read('military/river_crossings.json');

test('configurazione reale valida; errori riconosciuti', () => {
  assert.deepEqual(validateTerrainCombat(cfg), []);
  assert.ok(validateTerrainCombat({ ...cfg, defense: { ...cfg.defense, montagna: 0.5 } }).length > 0, 'la difesa non scende sotto 1');
  assert.ok(validateTerrainCombat({ ...cfg, category: { submarine: { pianura: 1 } } }).length > 0);
  assert.ok(validateTerrainCombat({ ...cfg, river: { medium: 0.5, large: 0.8 } }).length > 0, 'il fiume grande pesa almeno quanto il medio');
  assert.ok(validateTerrainCombat(null).length > 0);
});

test('difesa del terreno: media pesata sulle frazioni; senza dato vale 1', () => {
  assert.equal(terrainDefense({ frazioni: { pianura: 1 } }, cfg), 1);
  assert.equal(terrainDefense({ frazioni: { montagna: 1 } }, cfg), cfg.defense.montagna);
  assert.equal(terrainDefense({ frazioni: { pianura: 0.5, montagna: 0.5 } }, cfg), (1 + cfg.defense.montagna) / 2);
  assert.equal(terrainDefense(null, cfg), 1);
  assert.equal(terrainDefense({ frazioni: { montagna: 1 } }, null), 1);
  assert.equal(terrainDefense({ frazioni: {} }, cfg), 1);
  // dati reali: il Badakhshan (97% montagna) difende meglio di una provincia di sola pianura, mai meno di 1
  const bad = terrainDefense(terrainDoc.province.P_AFG_BADAKHSHAN, cfg);
  assert.ok(bad > 1.4 && bad <= cfg.defense.montagna);
  for (const t of Object.values(terrainDoc.province)) { const d = terrainDefense(t, cfg); assert.ok(d >= 1 && d <= 1.5 + 1e-9); }
});

test('categoria e terreno: corazzati penalizzati in montagna, truppe da montagna avvantaggiate, fanteria neutra', () => {
  const mont = { frazioni: { montagna: 1 } };
  assert.equal(terrainCategoryFactor('armored', mont, cfg), cfg.category.armored.montagna);
  assert.equal(terrainCategoryFactor('mountain', mont, cfg), cfg.category.mountain.montagna);
  assert.equal(terrainCategoryFactor('infantry', mont, cfg), 1);
  assert.equal(terrainCategoryFactor('armored', { frazioni: { pianura: 1 } }, cfg), 1);
  assert.equal(terrainCategoryFactor('armored', { frazioni: { pianura: 0.5, palude: 0.5 } }, cfg), (1 + cfg.category.armored.palude) / 2);
  assert.equal(terrainCategoryFactor('command', mont, cfg), 1);
  assert.equal(terrainCategoryFactor('armored', null, cfg), 1);
});

test('fiume: solo medi e grandi riducono l’attaccante', () => {
  assert.equal(riverFactor('medium', cfg), cfg.river.medium);
  assert.equal(riverFactor('large', cfg), cfg.river.large);
  assert.equal(riverFactor('small', cfg), 1);
  assert.equal(riverFactor(undefined, cfg), 1);
  assert.equal(divisionPower({ category: 'infantry', effective: 1000, mult: 0.6 }), 600);
  assert.equal(divisionPower({ category: 'infantry', effective: 1000 }), 1000, 'senza mult nulla cambia');
});

test('fiumi tra posti: file identico alla rigenerazione, valido, con il Reno tra le sponde di Essen', async () => {
  assert.deepEqual(await buildFile(), riversFile);
  assert.deepEqual(validateRiverCrossings(riversFile), []);
  const idx = createRiverIndex(riversFile);
  assert.equal(idx.size, riversFile.pairs.length);
  assert.deepEqual(idx.between('P_DEU_ESSEN_SP1', 'P_DEU_ESSEN_SP2'), { riverId: 'R_RHINE', widthClass: 'large' });
  assert.deepEqual(idx.between('P_DEU_ESSEN_SP2', 'P_DEU_ESSEN_SP1'), idx.between('P_DEU_ESSEN_SP1', 'P_DEU_ESSEN_SP2'));
  assert.equal(idx.between('P_DEU_ESSEN_SP1', 'P_DEU_ESSEN_SP1'), null);
  assert.equal(idx.between('P_DEU_ESSEN_SP1', 'P_AFG_BADGHIS'), null);
  assert.ok(validateRiverCrossings({ ...riversFile, pairs: [[0, 0, 0]] }).length > 0);
  assert.ok(validateRiverCrossings({ ...riversFile, pairs: [...riversFile.pairs, riversFile.pairs[0]] }).length > 0);
  assert.ok(validateRiverCrossings(riversFile, { placeIds: new Set() }).length > 0);
});

test('fiumi tra posti: si tiene il fiume più largo e si ignorano i piccoli', () => {
  const f = buildRiverCrossings({
    provinceIds: ['A', 'B', 'C'],
    rivers: [{ id: 'R_S', widthClass: 'small' }, { id: 'R_M', widthClass: 'medium' }, { id: 'R_L', widthClass: 'large' }],
    links: { schema: 'links-v2', checksum: 'x', nodes: [{ p: 0 }, { p: 1 }, { p: 2 }], links: [{ id: 'L1', a: 0, b: 1 }, { id: 'L2', a: 1, b: 2 }], bridges: [{ link: 'L1', riverId: 'R_M' }, { link: 'L1', riverId: 'R_L' }, { link: 'L2', riverId: 'R_S' }] },
  });
  assert.deepEqual(f.counts, { pairs: 1, medium: 0, large: 1 });
  assert.deepEqual(createRiverIndex(f).between('B', 'A'), { riverId: 'R_L', widthClass: 'large' });
  assert.equal(createRiverIndex(f).between('B', 'C'), null);
});

test('movimento: registra il posto di provenienza a ogni passo', () => {
  const net = { neighbors: (m) => ({ A: ['B'], B: ['A', 'C'], C: ['B'] }[m]), km: () => 20 };
  const r = issueMove(createMovementState(), { id: 'U', category: 'infantry' }, 'C', { initial: new Map([['U', 'A']]), net, canEnter: () => true });
  let m = tickMovement(r.movement, net.km);
  assert.equal(m.positions.U, 'B'); assert.equal(m.from.U, 'A');
  m = tickMovement(m, net.km);
  assert.equal(m.positions.U, 'C'); assert.equal(m.from.U, 'B');
  assert.deepEqual(validateMovement(m), []);
  assert.ok(validateMovement({ ...m, from: { U: 5 } }).length > 0);
  assert.deepEqual(validateMovement({ schema: 'movement-v1', positions: {}, orders: {} }), [], 'i salvataggi senza from restano validi');
});

// ---- sistema giornaliero: rete A(GER) - B(FRA) - C(FRA), 20 km a tratta; B è montagna, fra A e B scorre un fiume grande ----
const OWNERS = { A: 'GER', B: 'FRA', C: 'FRA' };
const NB = { A: ['B'], B: ['A', 'C'], C: ['B'] };
const net = { has: (m) => m in OWNERS, neighbors: (m) => NB[m] ?? [], km: () => 20, owner: (m) => OWNERS[m] ?? null, name: (m) => `Prov ${m}` };
const UNITS = [
  { id: 'G1', name: '1. Div', nation: 'GER', category: 'infantry', echelon: 'division' },
  { id: 'G2', name: '2. Pz', nation: 'GER', category: 'armored', echelon: 'division' },
  { id: 'F1', name: '1re Div', nation: 'FRA', category: 'infantry', echelon: 'division' },
];
const unitsById = new Map(UNITS.map((u) => [u.id, u]));
const div = (n) => ({ templateId: 't', since: '1936-01-01', items: { 'manpower.war': { planned: 10000, effective: n, source: 'template' } } });
const DEPLOY = { entries: [{ unit: 'G1', province: 'A' }, { unit: 'G2', province: 'A' }, { unit: 'F1', province: 'B' }] };
const initial = new Map(DEPLOY.entries.map((e) => [e.unit, e.province]));
const plain = { getNet: () => net, unitsById, deploymentDoc: DEPLOY, initial };
const TERRAIN = { B: { frazioni: { montagna: 1 } } };
const ground = { ...plain, terrainCfg: cfg, terrainOf: (p) => TERRAIN[p] ?? null, riverBetween: (a, b) => ([a, b].sort().join('') === 'AB' ? { riverId: 'R_X', widthClass: 'large' } : null) };

function start() {
  const s = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal', forces: { schema: 'forces-v1', initialized: true, divisions: { G1: div(10000), G2: div(10000), F1: div(10000) } } };
  const war = playerDeclareWar(s, 'FRA');
  let m = createMovementState();
  for (const id of ['G1', 'G2']) m = issueMove(m, { id, category: unitsById.get(id).category }, 'B', { initial, net, canEnter: () => true }).movement;
  return { ...war, movement: m };
}
const day = (ctx) => (s) => createTheaterSystem(ctx)(createMovementSystem(net)({ ...s, day: s.day + 1 }));

test('battaglia: montagna e fiume indeboliscono l’attacco e compaiono nel registro; senza dati tutto resta come prima', () => {
  const a = day(plain)(start());
  const b = day(ground)(start());
  const la = a.combat.log.at(-1); const lb = b.combat.log.at(-1);
  assert.equal(la.province, 'B'); assert.equal(lb.province, 'B');
  assert.equal('defense' in la, false); assert.equal('crossing' in la, false);
  assert.equal(lb.defense, cfg.defense.montagna);
  assert.equal(lb.crossing, 2, 'entrambe le divisioni hanno attraversato il fiume');
  assert.ok(lb.attackerLoss > la.attackerLoss, 'gli attaccanti perdono di più');
  assert.ok(lb.defenderLoss < la.defenderLoss, 'i difensori perdono di meno');
});

test('battaglia: i moltiplicatori per unità sono quelli attesi; in città il terreno non si applica', () => {
  const s = day(ground)(start());
  const A = [{ id: 'G1', category: 'infantry' }, { id: 'G2', category: 'armored' }]; const D = [{ id: 'F1', category: 'infantry' }];
  const g = battleGround(s, ground, net, 'B', A, D);
  assert.equal(g.attackers[0].mult, cfg.river.large);
  assert.equal(g.attackers[1].mult, cfg.category.armored.montagna * cfg.river.large);
  assert.equal(g.defenders[0].mult, 1);
  assert.deepEqual(g.crossing, ['G1', 'G2']);
  const city = battleGround(s, ground, { ...net, isCity: () => true }, 'B', A, D);
  assert.equal(city.defense, 1); assert.equal(city.attackers[1].mult, cfg.river.large, 'in città resta solo il fiume');
  const none = battleGround(s, plain, net, 'B', A, D);
  assert.equal(none.defense, 1); assert.deepEqual(none.crossing, []); assert.equal(none.attackers[1].mult, 1);
});

test('battaglia: chi è respinto non porta con sé l’attraversamento', () => {
  let s = start();
  s = { ...s, forces: { ...s.forces, divisions: { ...s.forces.divisions, G1: div(1500), G2: div(1500) } } };
  for (let i = 0; i < 30 && !(s.combat?.log ?? []).some((e) => e.outcome === 'attaccanti respinti'); i += 1) s = day(ground)(s);
  assert.ok(s.combat.log.some((e) => e.outcome === 'attaccanti respinti'));
  assert.equal(s.movement.positions.G1, 'A');
  assert.equal('G1' in (s.movement.from ?? {}), false);
});

test('rapporto di forze di riferimento e piani: il terreno alza la superiorità richiesta', () => {
  const att = [{ id: 'a', category: 'infantry', effective: 15000, planned: 15000 }]; const def = [{ id: 'd', category: 'infantry', effective: 10000, planned: 10000 }];
  const open = resolveBattleDay({ attackers: att, defenders: def });
  const hill = resolveBattleDay({ attackers: att, defenders: def, defenseMultiplier: cfg.defense.montagna });
  assert.ok(open.attackerPower > open.defenderPower);
  assert.equal(hill.attackerPower, hill.defenderPower, '1,5:1 contro la montagna è parità');
  assert.equal(groundDefenseOf(ground, net, 'B'), cfg.defense.montagna);
  assert.equal(groundDefenseOf(ground, net, 'A'), 1);
  assert.equal(groundDefenseOf(plain, net, 'B'), 1);
  assert.equal(groundDefenseOf(ground, { ...net, isCity: () => true }, 'B'), 1);
});
