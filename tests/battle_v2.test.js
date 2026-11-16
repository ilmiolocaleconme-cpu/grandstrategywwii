// Battaglia v2 (16/11/2026): potenza di fuoco, coesione, fronte, rifornimenti, perdite divise, fasi e stagione. Regole pure, template reali e
// sistema giornaliero su una rete sintetica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  validateBattleV2, rawFirepower, firepowerBase, artilleryShare, crewFactor, sideHardness, ammoFactors, fuelFactor, resilience, cohesionLoss, cohesionPower,
  experiencePower, sideBreaks, recoverCohesion, frontageOf, splitLine, drawSupply, splitCasualties, mobileShare, retreatPrisoners, addCasualties,
  casualtiesOf, casualtyDrain, seasonFactor, cohesionOf,
} from '../src/rules/battleV2.js';
import { divisionPower, resolveBattleDay, resolveUrbanBattleDay } from '../src/rules/combat.js';
import { buildCategoryOf } from '../src/rules/equipmentFill.js';
import { createTheaterSystem, playerDeclareWar, validateBattleExtras, unitCohesion } from '../src/game/theaterState.js';
import { createMovementSystem } from '../src/game/movementState.js';
import { createMovementState, issueMove } from '../src/rules/movement.js';
import { createCasualtySystem } from '../src/game/casualtyState.js';
import { powerOfUnit } from '../src/game/theaterPlan.js';
import { validateState } from '../src/game/state.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = read('units/battle_v2.json');
const hospitalCare = read('medical/hospital_care.json');
const catalogs = readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => f.startsWith('catalog')).map((f) => read(`units/equipment/${f}`));
const CATEGORY_OF = buildCategoryOf({ entries: catalogs.flatMap((c) => c.entries), aliases: catalogs.flatMap((c) => c.aliases ?? []) });
const tplRaw = (file, fill = 1) => {
  const t = read(`units/templates/${file}.json`);
  const items = Object.fromEntries(Object.entries(t.equipment ?? {}).map(([k, v]) => [`equipment.${k}`, { planned: v.value, effective: v.value === null ? null : v.value * fill }]));
  const men = t.manpower?.war?.value ?? 0;
  return { men, category: t.appliesTo?.category, raw: rawFirepower(items, (k) => CATEGORY_OF(t.appliesTo?.nation, k), cfg, men), items, nation: t.appliesTo?.nation };
};
const baseOf = (x, h = 0, extra = {}) => firepowerBase(x.raw, h, { effective: x.men, planned: x.men, category: x.category, ...extra }, cfg);

test('configurazione reale valida; errori riconosciuti', () => {
  assert.deepEqual(validateBattleV2(cfg, { weaponCategories: new Set(Object.keys(cfg.firepower.weights)) }), []);
  assert.ok(validateBattleV2({ ...cfg, casualties: { ...cfg.casualties, killed: 0.5 } }).length > 0);
  assert.ok(validateBattleV2({ ...cfg, frontage: { ...cfg.frontage, montagna: 0 } }).length > 0);
  assert.ok(validateBattleV2({ ...cfg, firepower: { ...cfg.firepower, scale: 0 } }).length > 0);
  assert.ok(validateBattleV2(cfg, { weaponCategories: new Set(['TANK']) }).length > 0);
  assert.ok(validateBattleV2(null).length > 0);
});

test('potenza di fuoco: la fanteria tedesca 1936 al completo vale circa i suoi uomini e metà del fuoco è artiglieria', () => {
  const deu = tplRaw('divisione_fanteria_germania_1936');
  assert.ok(Math.abs(baseOf(deu) / deu.men - 1) < 0.03, `scala: ${baseOf(deu)} contro ${deu.men} uomini`);
  assert.ok(artilleryShare(deu.raw) >= 0.45 && artilleryShare(deu.raw) <= 0.6);
  assert.deepEqual(deu.raw.filled, []);
});

test('potenza di fuoco: più obici = più potenza (prima due divisioni «complete» valevano uguale)', () => {
  const cat = (k) => ({ 'equipment.r': 'INDIVIDUAL_WEAPON', 'equipment.h': 'HOWITZER' }[k] ?? null);
  const div = (h) => rawFirepower({ 'equipment.r': { planned: 10000, effective: 10000 }, 'equipment.h': { planned: h, effective: h } }, cat, cfg, 10000);
  const o = { effective: 10000, planned: 10000, category: 'infantry' };
  assert.ok(firepowerBase(div(72), 0, o, cfg) > firepowerBase(div(12), 0, o, cfg) * 1.5);
});

test('potenza di fuoco: contro i corazzati conta l’anticarro, contro la fanteria no', () => {
  const deu = tplRaw('divisione_fanteria_germania_1939');
  const noAt = { ...deu, raw: rawFirepower(Object.fromEntries(Object.entries(deu.items).filter(([k]) => CATEGORY_OF('DEU', k) !== 'ANTI_TANK_GUN')), (k) => CATEGORY_OF('DEU', k), cfg, deu.men) };
  assert.ok(baseOf(deu, 0.7) < baseOf(deu, 0) * 0.5, 'la fanteria rende meno della metà contro una divisione corazzata');
  assert.ok(baseOf(noAt, 0.7) < baseOf(deu, 0.7) * 0.85, 'senza cannoni anticarro ancora meno');
  assert.ok(baseOf(noAt, 0) > baseOf(deu, 0) * 0.98, 'contro la fanteria l’anticarro quasi non conta');
});

test('buchi dei dati: fucili o mitragliatrici senza quantità si colmano; un template senza nessuna quantità resta alla regola di prima', () => {
  const fra = tplRaw('divisione_fanteria_francia_1939');
  assert.deepEqual(fra.raw.filled, ['INDIVIDUAL_WEAPON']);
  assert.ok(baseOf(fra) > 0.8 * fra.men && baseOf(fra) < 1.2 * fra.men);
  const fra36 = tplRaw('divisione_fanteria_francia_1936');
  assert.equal(fra36.raw.recognized, false);
  for (const f of readdirSync(new URL('../data/units/templates/', import.meta.url)).filter((x) => x.startsWith('divisione_') && !x.includes('riferimenti'))) {
    const t = tplRaw(f.replace('.json', ''));
    if (!t.raw.recognized || !(t.men > 0)) continue;
    const ratio = baseOf(t) / t.men;
    assert.ok(ratio > 0.4 && ratio < 2, `${f}: potenza per uomo ${ratio.toFixed(2)} fuori scala`);
  }
});

test('serventi, munizioni, carburante, preparazione', () => {
  assert.equal(crewFactor(8000, 10000, cfg), 1);
  assert.equal(crewFactor(4000, 10000, cfg), 0.5);
  assert.deepEqual(ammoFactors(1, cfg), { small: 1, artillery: 1, direct: 1 });
  assert.deepEqual(ammoFactors(0, cfg), cfg.supply.ammoFloor);
  assert.equal(fuelFactor('infantry', 0, cfg), 1);
  assert.equal(fuelFactor('armored', 0, cfg), cfg.supply.fuelFloor);
  const deu = tplRaw('divisione_fanteria_germania_1939');
  const dry = baseOf(deu, 0, { ammo: 0 });
  assert.ok(dry < baseOf(deu) * 0.45 && dry > baseOf(deu) * 0.3, 'senza munizioni l’artiglieria tace: resta circa il 40%');
  assert.ok(baseOf(deu, 0, { prep: true }) > baseOf(deu) * 1.2, 'la preparazione vale il +50% della sola artiglieria');
  assert.deepEqual(drawSupply(100, 40), { coverage: 1, used: 40, left: 60 });
  assert.deepEqual(drawSupply(10, 40), { coverage: 0.25, used: 10, left: 0 });
  assert.deepEqual(drawSupply(undefined, 40), { coverage: 0, used: 0, left: 0 });
  assert.equal(drawSupply(5, 0).coverage, 1);
});

test('quota corazzata di una parte: pesata sugli uomini, azzerata senza carburante', () => {
  assert.equal(sideHardness([{ category: 'infantry', effective: 10000 }], cfg), 0);
  assert.equal(sideHardness([{ category: 'armored', effective: 10000 }], cfg), cfg.firepower.hardness.armored);
  assert.equal(sideHardness([{ category: 'armored', effective: 5000 }, { category: 'infantry', effective: 5000 }], cfg), cfg.firepower.hardness.armored / 2);
  assert.equal(sideHardness([{ category: 'armored', effective: 10000, fuel: 0 }], cfg), 0);
});

test('coesione: calo secondo pressione, morale, esperienza, comandante e trincea; soglia di cedimento; recupero', () => {
  const avg = { morale: 70, experience: 45 };
  assert.ok(resilience({ morale: 95, experience: 45 }, false, cfg) > resilience(avg, false, cfg));
  assert.ok(resilience(avg, true, cfg) > resilience(avg, false, cfg));
  const even = cohesionLoss({ ratio: 1, cond: avg }, cfg);
  assert.ok(even > 6 && even < 10, `a forze pari circa 8 al giorno (${even})`);
  assert.equal(cohesionLoss({ ratio: 10, cond: avg }, cfg), cohesionLoss({ ratio: cfg.cohesion.lossCap, cond: avg }, cfg), 'tetto alla pressione');
  assert.equal(cohesionLoss({ ratio: Infinity, cond: avg }, cfg), cohesionLoss({ ratio: cfg.cohesion.lossCap, cond: avg }, cfg));
  assert.ok(cohesionLoss({ ratio: 1, cond: avg, entrench: 1 }, cfg) < even * 0.55, 'la trincea piena dimezza il calo');
  assert.ok(Math.abs(cohesionLoss({ ratio: 1, cond: avg, defending: true }, cfg) - even * 0.8) < 0.02, 'chi difende cala il 20% in meno');
  assert.ok(cohesionLoss({ ratio: 1, cond: { morale: 95, experience: 80 } }, cfg) < even);
  assert.equal(cohesionPower(100, cfg), 1); assert.equal(cohesionPower(0, cfg), cfg.cohesion.powerFloor);
  assert.equal(experiencePower(0, cfg), 0.9); assert.equal(experiencePower(100, cfg), 1.1);
  assert.equal(sideBreaks([{ effective: 1000, cohesion: 20 }], cfg), true);
  assert.equal(sideBreaks([{ effective: 1000, cohesion: 21 }], cfg), false);
  assert.equal(sideBreaks([{ effective: 9000, cohesion: 10 }, { effective: 1000, cohesion: 100 }], cfg), true);
  assert.equal(recoverCohesion(50, 'idle', cfg), 60); assert.equal(recoverCohesion(50, 'moving', cfg), 53); assert.equal(recoverCohesion(50, 'reserve', cfg), 54);
  assert.equal(recoverCohesion(95, 'idle', cfg), 100);
  assert.equal(cohesionOf(undefined, 'X'), 100);
});

test('fronte: meno divisioni in linea in montagna e in città; in linea le più coese', () => {
  assert.equal(frontageOf({ frazioni: { pianura: 1 } }, false, cfg), 8);
  assert.equal(frontageOf({ frazioni: { montagna: 1 } }, false, cfg), 4);
  assert.equal(frontageOf({ frazioni: { pianura: 0.5, montagna: 0.5 } }, false, cfg), 6);
  assert.equal(frontageOf(null, false, cfg), 8);
  assert.equal(frontageOf({ frazioni: { pianura: 1 } }, true, cfg), cfg.frontage.urbano);
  const s = splitLine([{ id: 'a', cohesion: 30, effective: 1 }, { id: 'b', cohesion: 90, effective: 1 }, { id: 'c', cohesion: 90, effective: 5 }], 2);
  assert.deepEqual(s.line.map((u) => u.id), ['c', 'b']); assert.deepEqual(s.reserve.map((u) => u.id), ['a']);
});

test('perdite divise: somma esatta; prigionieri in ritirata e inseguimento; registro e pool', () => {
  for (const n of [0, 1, 7, 99, 1000, 12345]) { const p = splitCasualties(n, cfg); assert.equal(p.killed + p.wounded + p.missing, n); }
  assert.deepEqual(splitCasualties(1000, cfg), { killed: 220, wounded: 660, missing: 120 });
  assert.equal(retreatPrisoners(10000, 0, cfg), 300);
  assert.equal(retreatPrisoners(10000, 1, cfg), 1100);
  assert.equal(mobileShare([{ category: 'armored', effective: 5000 }, { category: 'infantry', effective: 15000 }], cfg), 0.25);
  let c = addCasualties(undefined, 'GER', { killed: 10, wounded: 30, missing: 5 });
  c = addCasualties(c, 'GER', { prisoners: 100 });
  assert.deepEqual(casualtiesOf(c, 'GER'), { killed: 10, wounded: 30, missing: 5, prisoners: 100, hospital: 30, recovered: 0 });
  assert.equal(casualtyDrain(c, 'GER'), 145);
  assert.equal(casualtyDrain(c, 'FRA'), 0);
});

test('stagione: inverno a nord, fango a est per le truppe mobili', () => {
  assert.equal(seasonFactor('1941-12-05', [37, 55], 'infantry', cfg), cfg.season.winter.attacker);
  assert.equal(seasonFactor('1941-12-05', [12, 41], 'infantry', cfg), 1, 'Roma è a sud del limite');
  assert.equal(seasonFactor('1941-10-20', [34, 55], 'armored', cfg), cfg.season.mud.attackerMobile);
  assert.equal(seasonFactor('1941-10-20', [34, 55], 'infantry', cfg), 1);
  assert.equal(seasonFactor('1941-10-20', [2, 49], 'armored', cfg), 1, 'la Francia è a ovest del limite');
  assert.equal(seasonFactor('1941-07-01', [34, 55], 'armored', cfg), 1);
  assert.equal(seasonFactor('1941-12-05', null, 'armored', cfg), 1);
});

test('combat.js: `base` sostituisce uomini × categoria × dotazione; in città si riduce in proporzione', () => {
  assert.equal(divisionPower({ category: 'armored', effective: 5000, base: 12000, equipment: 0.5, bonus: 0.1, mult: 0.5 }), 12000 * 1.1 * 0.5);
  assert.equal(divisionPower({ category: 'armored', effective: 0, base: 12000 }), 0);
  const a = [{ id: 'a', category: 'armored', effective: 10000, planned: 10000, base: 18000 }]; const d = [{ id: 'd', category: 'infantry', effective: 10000, planned: 10000, base: 10000 }];
  const r = resolveUrbanBattleDay({ attackers: a, defenders: d });
  assert.equal(r.attackerPower, 18000 * 0.9 / 1.8);
  assert.equal(resolveBattleDay({ attackers: a, defenders: d }).attackerPower, 18000);
});

// ---- sistema giornaliero: A(GER) - B(FRA) - C(FRA); D(FRA) isolata, raggiungibile solo da A ----
const OWNERS = { A: 'GER', B: 'FRA', C: 'FRA', D: 'FRA' };
const NB = { A: ['B', 'D'], B: ['A', 'C'], C: ['B'], D: ['A'] };
const net = { has: (m) => m in OWNERS, neighbors: (m) => NB[m] ?? [], km: () => 20, owner: (m) => OWNERS[m] ?? null, name: (m) => `Prov ${m}`, centre: () => [5, 44] };
const mk = (id, nation, category = 'infantry') => ({ id, name: id, nation, category, echelon: 'division' });
const WEAPON = { 'equipment.rifles': 'INDIVIDUAL_WEAPON', 'equipment.mg': 'MACHINE_GUN', 'equipment.how': 'HOWITZER', 'equipment.at': 'ANTI_TANK_GUN', 'equipment.tanks': 'TANK' };
const item = (n) => ({ planned: n, effective: n, source: 'template' });
const infantry = (men = 15000) => ({ templateId: 't', since: '1936-01-01', items: { 'manpower.war': item(men), 'equipment.rifles': item(12000), 'equipment.mg': item(400), 'equipment.how': item(48), 'equipment.at': item(40) } });
const armored = (men = 10000) => ({ templateId: 't', since: '1936-01-01', items: { 'manpower.war': item(men), 'equipment.rifles': item(4000), 'equipment.mg': item(200), 'equipment.tanks': item(300) } });

function world({ units, deploy, divisions, stocks = { munitions: 5000, fuel: 5000 }, moves = [], extra = {} }) {
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const DEPLOY = { entries: Object.entries(deploy).map(([unit, province]) => ({ unit, province })) };
  const initial = new Map(DEPLOY.entries.map((e) => [e.unit, e.province]));
  const ctx = {
    getNet: () => net, unitsById, deploymentDoc: DEPLOY, initial, battleCfg: cfg,
    rawFirepower: (state, u) => rawFirepower(state.forces.divisions[u.id]?.items, (k) => WEAPON[k] ?? null, cfg, state.forces.divisions[u.id]?.items['manpower.war'].effective ?? 0),
    conditionOf: () => ({ morale: 70, experience: 45 }), ammoNeed: (u, phase) => (phase === 'attack' ? 8 : 5), fuelNeed: () => 12, ...extra,
  };
  let s = { schema: 8, startDate: '1936-06-01', date: '1936-06-01', day: 0, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal', forces: { schema: 'forces-v1', initialized: true, divisions }, nations: { GER: { stocks: { ...stocks } }, FRA: { stocks: { ...stocks } } } };
  s = playerDeclareWar(s, 'FRA');
  let m = createMovementState();
  for (const [id, to] of moves) m = issueMove(m, { id, category: unitsById.get(id).category }, to, { initial, net, canEnter: () => true }).movement;
  s = { ...s, movement: m };
  const day = (x) => createTheaterSystem(ctx)(createMovementSystem(net)({ ...x, day: x.day + 1 }));
  return { s, day, ctx, unitsById };
}
const men = (s, id) => s.forces.divisions[id].items['manpower.war'].effective;

test('sistema: perdite divise, registro, munizioni consumate, preparazione solo il primo giorno', () => {
  const w = world({ units: [mk('G1', 'GER'), mk('F1', 'FRA')], deploy: { G1: 'A', F1: 'B' }, divisions: { G1: infantry(), F1: infantry() }, moves: [['G1', 'B']] });
  const s1 = w.day(w.s);
  const e1 = s1.combat.log.at(-1);
  assert.equal(e1.province, 'B'); assert.equal(e1.prep, true);
  assert.equal(e1.split.a.killed + e1.split.a.wounded + e1.split.a.missing, e1.attackerLoss);
  assert.equal(15000 - men(s1, 'G1'), e1.attackerLoss);
  assert.equal(casualtiesOf(s1.casualties, 'GER').killed, e1.split.a.killed);
  assert.equal(casualtiesOf(s1.casualties, 'FRA').hospital, e1.split.d.wounded);
  assert.equal(s1.nations.GER.stocks.munitions, 4992); assert.equal(s1.nations.FRA.stocks.munitions, 4995);
  assert.equal(s1.nations.GER.stocks.fuel, 5000, 'la fanteria a piedi non consuma carburante in battaglia');
  assert.ok(unitCohesion(s1, 'G1') < 100 && unitCohesion(s1, 'F1') < 100);
  const s2 = w.day(s1);
  assert.equal('prep' in s2.combat.log.at(-1), false);
  assert.deepEqual(validateBattleExtras(s2), []);
  assert.ok(e1.defenderLoss > s2.combat.log.at(-1).defenderLoss, 'il giorno di preparazione i difensori perdono di più');
});

test('sistema: si cede per coesione, molto prima di scendere al 25% degli uomini; chi si ritira lascia prigionieri', () => {
  const w = world({ units: [mk('G1', 'GER'), mk('G2', 'GER'), mk('G3', 'GER'), mk('F1', 'FRA')], deploy: { G1: 'A', G2: 'A', G3: 'A', F1: 'B' }, divisions: { G1: infantry(), G2: infantry(), G3: infantry(), F1: infantry() }, moves: [['G1', 'B'], ['G2', 'B'], ['G3', 'B']] });
  let s = w.s;
  for (let i = 0; i < 20 && !(s.combat?.log ?? []).some((e) => e.outcome === 'difensori in ritirata'); i += 1) s = w.day(s);
  const end = s.combat.log.find((e) => e.outcome === 'difensori in ritirata');
  assert.ok(end, 'i difensori cedono');
  assert.ok(end.day <= 6, `a 3:1 in pochi giorni (giorno ${end.day})`);
  assert.ok(men(s, 'F1') > 15000 * 0.5, `con oltre metà degli uomini (${men(s, 'F1')})`);
  assert.ok(end.split.d.prisoners > 0);
  assert.equal(casualtiesOf(s.casualties, 'FRA').prisoners, end.split.d.prisoners);
  assert.equal(s.movement.positions.F1, 'C');
});

test('sistema: a forze pari cede prima chi attacca', () => {
  const w = world({ units: [mk('G1', 'GER'), mk('F1', 'FRA')], deploy: { G1: 'A', F1: 'B' }, divisions: { G1: infantry(), F1: infantry() }, moves: [['G1', 'B']] });
  let s = w.s;
  for (let i = 0; i < 30 && !(s.combat?.log ?? []).some((e) => e.outcome !== 'in corso'); i += 1) s = w.day(s);
  assert.equal(s.combat.log.find((e) => e.outcome !== 'in corso').outcome, 'attaccanti respinti');
  assert.equal(s.movement.positions.G1, 'A');
});

test('sistema: l’inseguimento di truppe mobili fa più prigionieri', () => {
  const run = (cat, divs) => {
    const w = world({ units: [mk('G1', 'GER', cat), mk('G2', 'GER', cat), mk('G3', 'GER', cat), mk('F1', 'FRA')], deploy: { G1: 'A', G2: 'A', G3: 'A', F1: 'B' }, divisions: { G1: divs(), G2: divs(), G3: divs(), F1: infantry() }, moves: [['G1', 'B'], ['G2', 'B'], ['G3', 'B']] });
    let s = w.s;
    for (let i = 0; i < 20 && !(s.combat?.log ?? []).some((e) => e.outcome === 'difensori in ritirata'); i += 1) s = w.day(s);
    const e = s.combat.log.find((x) => x.outcome === 'difensori in ritirata');
    return e.split.d.prisoners / (men(s, 'F1') + e.split.d.prisoners);
  };
  assert.ok(run('armored', armored) > run('infantry', infantry) * 2);
});

test('sistema: chi cede senza via di ritirata si arrende', () => {
  const w = world({ units: [mk('G1', 'GER'), mk('G2', 'GER'), mk('G3', 'GER'), mk('F1', 'FRA')], deploy: { G1: 'A', G2: 'A', G3: 'A', F1: 'D' }, divisions: { G1: infantry(), G2: infantry(), G3: infantry(), F1: infantry() }, moves: [['G1', 'D'], ['G2', 'D'], ['G3', 'D']] });
  let s = w.s;
  for (let i = 0; i < 20 && !(s.combat?.log ?? []).some((e) => e.outcome.includes('resa')); i += 1) s = w.day(s);
  const e = s.combat.log.find((x) => x.outcome === 'difensori circondati: resa');
  assert.ok(e);
  assert.equal(men(s, 'F1'), 0);
  assert.ok(e.split.d.prisoners > 5000);
  s = w.day(s);
  assert.equal(s.provinces?.D?.controller, 'GER', 'la provincia cade il giorno dopo');
});

test('sistema: senza munizioni si combatte peggio e il registro lo dice', () => {
  const setup = (stocks) => world({ units: [mk('G1', 'GER'), mk('F1', 'FRA')], deploy: { G1: 'A', F1: 'B' }, divisions: { G1: infantry(), F1: infantry() }, moves: [['G1', 'B']], stocks });
  const full = setup({ munitions: 5000, fuel: 5000 }); const dry = setup({ munitions: 5000, fuel: 5000 });
  dry.s = { ...dry.s, nations: { ...dry.s.nations, GER: { stocks: { munitions: 0, fuel: 0 } } } };
  const a = full.day(full.s).combat.log.at(-1); const b = dry.day(dry.s).combat.log.at(-1);
  assert.deepEqual(b.lowAmmo, ['GER']); assert.equal('lowAmmo' in a, false);
  assert.ok(b.defenderLoss < a.defenderLoss * 0.6);
  assert.equal('prep' in b, true, 'la battaglia è al primo giorno, ma senza munizioni la preparazione non dà bonus');
});

test('sistema: senza carburante i corazzati rendono molto meno', () => {
  const setup = () => world({ units: [mk('G1', 'GER', 'armored'), mk('F1', 'FRA')], deploy: { G1: 'A', F1: 'B' }, divisions: { G1: armored(), F1: infantry() }, moves: [['G1', 'B']] });
  const full = setup(); const dry = setup();
  dry.s = { ...dry.s, nations: { ...dry.s.nations, GER: { stocks: { munitions: 5000, fuel: 0 } } } };
  const a = full.day(full.s); const b = dry.day(dry.s);
  assert.equal(a.nations.GER.stocks.fuel, 4988);
  assert.deepEqual(b.combat.log.at(-1).lowFuel, ['GER']);
  assert.ok(b.combat.log.at(-1).defenderLoss < a.combat.log.at(-1).defenderLoss * 0.6);
});

test('sistema: oltre la larghezza del fronte si resta in riserva, senza perdite', () => {
  const ids = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
  const w = world({
    units: [...ids.map((i) => mk(i, 'GER')), mk('F1', 'FRA')], deploy: { ...Object.fromEntries(ids.map((i) => [i, 'A'])), F1: 'B' },
    divisions: { ...Object.fromEntries(ids.map((i) => [i, infantry()])), F1: infantry() }, moves: ids.map((i) => [i, 'B']),
    extra: { terrainCfg: read('units/terrain_combat.json'), terrainOf: () => ({ frazioni: { montagna: 1 } }) },
  });
  const s = w.day(w.s);
  const e = s.combat.log.at(-1);
  assert.deepEqual(e.reserve, [2, 0]);
  assert.equal(ids.filter((i) => men(s, i) === 15000).length, 2, 'due divisioni non hanno combattuto');
  assert.equal(s.nations.GER.stocks.munitions, 5000 - 4 * 8, 'solo chi è in linea consuma munizioni');
});

test('sistema: la coesione si recupera fuori dalla battaglia e la voce sparisce a 100', () => {
  const w = world({ units: [mk('G1', 'GER'), mk('F1', 'FRA')], deploy: { G1: 'A', F1: 'B' }, divisions: { G1: infantry(), F1: infantry() } });
  let s = { ...w.s, cohesion: { schema: 'cohesion-v1', byUnit: { G1: 75, F1: 95 } } };
  s = w.day(s);
  assert.equal(unitCohesion(s, 'G1'), 85); assert.equal('F1' in s.cohesion.byUnit, false);
  s = w.day(w.day(s));
  assert.deepEqual(s.cohesion.byUnit, {});
});

test('piani: la stima della potenza usa la stessa potenza di fuoco della battaglia', () => {
  const w = world({ units: [mk('G1', 'GER'), mk('G2', 'GER', 'armored')], deploy: { G1: 'A', G2: 'A' }, divisions: { G1: infantry(), G2: armored() } });
  const raw = w.ctx.rawFirepower(w.s, w.unitsById.get('G1'));
  const expected = firepowerBase(raw, 0, { effective: 15000, planned: 15000, category: 'infantry' }, cfg) * experiencePower(45, cfg);
  assert.ok(Math.abs(powerOfUnit(w.s, w.unitsById.get('G1'), w.ctx) - expected) < 1e-6);
  assert.equal(powerOfUnit(w.s, w.unitsById.get('G1'), { ...w.ctx, battleCfg: undefined }), 15000, 'senza v2 resta la regola di prima');
});

test('ospedali: guariti + morti + rimasti = feriti; i guariti tornano al pool, la medicina si consuma', () => {
  const sys = createCasualtySystem({ params: hospitalCare });
  const kind = Object.keys(hospitalCare.kinds)[0];
  const base = { casualties: addCasualties(undefined, 'GER', { killed: 100, wounded: 500 }), nations: { GER: { stocks: { medicine: 10 }, hospitals: [{ kind }, { kind }] } } };
  const s = sys(base);
  const c = casualtiesOf(s.casualties, 'GER');
  assert.ok(Math.abs(c.hospital + c.recovered + (c.killed - 100) - 500) < 0.01);
  assert.ok(c.recovered > 0 && c.hospital < 500);
  assert.ok(s.nations.GER.stocks.medicine < 10);
  assert.ok(casualtyDrain(s.casualties, 'GER') < casualtyDrain(base.casualties, 'GER'));
  // senza ospedali: una parte guarisce da sola, una parte muore
  const bare = sys({ casualties: addCasualties(undefined, 'GER', { wounded: 1000 }), nations: { GER: { stocks: {}, hospitals: [] } } });
  const b = casualtiesOf(bare.casualties, 'GER');
  assert.equal(b.recovered, 10); assert.equal(b.killed, 10); assert.equal(b.hospital, 980);
  let long = bare; for (let i = 0; i < 2000; i += 1) long = sys(long);
  assert.equal(casualtiesOf(long.casualties, 'GER').hospital, 0, 'il registro si svuota');
  assert.equal(sys({ nations: {} }).casualties, undefined);
});

test('stato: coesione e perdite sono campi facoltativi validi; forme sbagliate rifiutate', () => {
  assert.deepEqual(validateBattleExtras({}), []);
  assert.ok(validateBattleExtras({ cohesion: { schema: 'x', byUnit: {} } }).length > 0);
  assert.ok(validateBattleExtras({ cohesion: { schema: 'cohesion-v1', byUnit: { U: 120 } } }).length > 0);
  assert.ok(validateBattleExtras({ casualties: { schema: 'casualties-v1', byNation: { GER: { killed: -1 } } } }).length > 0);
  assert.equal(typeof validateState, 'function');
});
