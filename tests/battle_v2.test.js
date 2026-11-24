// Battaglia v2 (16/11/2026): potenza di fuoco, coesione, fronte, rifornimenti, perdite divise, fasi e stagione. Regole pure, template reali e
// sistema giornaliero su una rete sintetica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  validateBattleV2, rawFirepower, weaponWeight, tankParts, firepowerBase, artilleryShare, crewFactor, sideHardness, ammoFactors, fuelFactor, resilience, cohesionLoss, cohesionPower,
  experiencePower, sideBreaks, recoverCohesion, frontageOf, splitLine, drawSupply, splitCasualties, mobileShare, retreatPrisoners, addCasualties,
  casualtiesOf, casualtyDrain, seasonFactor, cohesionOf,
} from '../src/rules/battleV2.js';
import { divisionPower, resolveBattleDay, resolveUrbanBattleDay } from '../src/rules/combat.js';
import { buildCategoryOf, buildWeaponOf } from '../src/rules/equipmentFill.js';
import { createTheaterSystem, playerDeclareWar, validateBattleExtras, unitCohesion } from '../src/game/theaterState.js';
import { createMovementSystem } from '../src/game/movementState.js';
import { createMovementState, issueMove } from '../src/rules/movement.js';
import { createCasualtySystem } from '../src/game/casualtyState.js';
import { powerOfUnit } from '../src/game/theaterPlan.js';
import { validateState } from '../src/game/state.js';
import { conditionOf } from '../src/rules/divisionCondition.js';
import { applyArrivals, validateReinforcementFields } from '../src/rules/reinforcements.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = read('units/battle_v2.json');
const hospitalCare = read('medical/hospital_care.json');
const catalogs = readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => f.startsWith('catalog')).map((f) => read(`units/equipment/${f}`));
const CATALOG = { entries: catalogs.flatMap((c) => c.entries), aliases: catalogs.flatMap((c) => c.aliases ?? []) };
const CATEGORY_OF = buildCategoryOf(CATALOG);
const WEAPON_OF = buildWeaponOf(CATALOG);
const conditionCfg = read('units/condition_config.json');
const tplRaw = (file, fill = 1) => {
  const t = read(`units/templates/${file}.json`);
  const items = Object.fromEntries(Object.entries(t.equipment ?? {}).map(([k, v]) => [`equipment.${k}`, { planned: v.value, effective: v.value === null ? null : v.value * fill }]));
  const men = t.manpower?.war?.value ?? 0;
  return { men, category: t.appliesTo?.category, raw: rawFirepower(items, (k) => WEAPON_OF(t.appliesTo?.nation, k), cfg, men), items, nation: t.appliesTo?.nation };
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
  // 20/11/2026 (schema unico): la fanteria 1936 è la somma dei battaglioni tarati sul 1939 (più MG 34 e mortai del vecchio template a mano) e vale
  // il 9% in più dei suoi uomini. Scala NON cambiata: a 0,55 la fanteria giapponese scendeva sotto il minimo del test sui buchi dei dati.
  assert.ok(baseOf(deu) / deu.men > 0.97 && baseOf(deu) / deu.men < 1.12, `scala: ${baseOf(deu)} contro ${deu.men} uomini`);
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
  const noAt = { ...deu, raw: rawFirepower(Object.fromEntries(Object.entries(deu.items).filter(([k]) => CATEGORY_OF('DEU', k) !== 'ANTI_TANK_GUN')), (k) => WEAPON_OF('DEU', k), cfg, deu.men) };
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

// ---- 17/11/2026: calibro e tipo di carro; morale ed esperienza mossi dalla battaglia ----
test('pesi per calibro e per tipo di carro; senza dato vale il peso medio della categoria', () => {
  assert.equal(weaponWeight({ category: 'HOWITZER', caliber: 150 }, cfg).soft, 300);
  assert.equal(weaponWeight({ category: 'HOWITZER', caliber: 75 }, cfg).soft, 100);
  assert.equal(weaponWeight({ category: 'HOWITZER', caliber: null }, cfg).soft, cfg.firepower.weights.HOWITZER.soft);
  assert.equal(weaponWeight('HOWITZER', cfg).soft, cfg.firepower.weights.HOWITZER.soft);
  assert.ok(weaponWeight({ category: 'ANTI_TANK_GUN', caliber: 75 }, cfg).hard > weaponWeight({ category: 'ANTI_TANK_GUN', caliber: 37 }, cfg).hard * 3);
  assert.ok(weaponWeight({ category: 'MORTAR', caliber: 50 }, cfg).soft < weaponWeight({ category: 'MORTAR', caliber: 81 }, cfg).soft);
  const l3 = weaponWeight({ category: 'TANK', role: 'tankette' }, cfg); const heavy = weaponWeight({ category: 'TANK', role: 'heavy_tank' }, cfg);
  assert.ok(heavy.hard > l3.hard * 20 && heavy.armor > l3.armor * 4);
  assert.deepEqual(weaponWeight({ category: 'TANK', role: null }, cfg), { ...cfg.firepower.weights.TANK, armor: 1 });
  assert.equal(weaponWeight({ category: 'BICYCLE' }, cfg), null);
  assert.equal(WEAPON_OF('DEU', 'equipment.ART-DEU-HOW-150').caliber, 150);
  assert.equal(WEAPON_OF('DEU', 'manpower.war'), null);
  // ogni ruolo di carro del catalogo ha un peso
  for (const e of CATALOG.entries) if (e.category === 'TANK' && e.role) assert.ok(cfg.firepower.tankRoles[e.role], `ruolo ${e.role} di ${e.equipment_id} senza peso`);
});

test('corazza dei carri: una divisione di tankette è un bersaglio quasi non corazzato', () => {
  const tanks = (role) => rawFirepower({ 'equipment.t': { planned: 100, effective: 100 } }, () => ({ category: 'TANK', role }), cfg, 5000);
  assert.equal(tanks('tankette').armor, cfg.firepower.tankRoles.tankette.armor);
  assert.equal(tanks(null).armor, 1);
  const h = (armor) => sideHardness([{ category: 'armored', effective: 10000, armor }], cfg);
  assert.ok(h(0.3) < h(1) * 0.35);
  assert.ok(h(1.35) <= 0.95);
  const ita = tplRaw('divisione_corazzata_italia_1940'); const ita39 = tplRaw('divisione_corazzata_italia_1939'); const urss = tplRaw('divisione_corazzata_urss_1940');
  // 19/11/2026: i carri sovietici hanno il loro peso per modello; dal 1942, con i T-34 e i KV, molto sopra.
  // 24/11/2026 (Italia passo 4): anche i carri italiani hanno il peso per modello (M 11, M 13: corazze chiodate e sottili, e un battaglione di L 3):
  // la divisione corazzata italiana del 1940 è poco sotto la sovietica del 1940 (BT e T-26 con i primi T-34) e molto sopra quella di sole tankette del 1939.
  const urss42 = rawFirepower(urss.items, (k) => WEAPON_OF('USSR', k), cfg, urss.men, { year: 1942, resolve: (id) => WEAPON_OF('USSR', `equipment.${id}`) });
  assert.ok(ita39.raw.armor < ita.raw.armor && ita.raw.armor < urss.raw.armor && urss.raw.armor < urss42.armor);
  assert.ok(ita.raw.armor > urss.raw.armor * 0.75, 'non troppo sotto');
});

test('sistema: la battaglia muove morale ed esperienza; a riposo il morale risale fino al valore di partenza', () => {
  const w = world({
    units: [mk('G1', 'GER'), mk('G2', 'GER'), mk('G3', 'GER'), mk('F1', 'FRA')], deploy: { G1: 'A', G2: 'A', G3: 'A', F1: 'B' },
    divisions: { G1: infantry(), G2: infantry(), G3: infantry(), F1: infantry() }, moves: [['G1', 'B'], ['G2', 'B'], ['G3', 'B']], extra: { conditionCfg, conditionOf: undefined },
  });
  const base = (id, nation) => conditionOf({ schema: 'conditions-v1', byUnit: {} }, id, conditionCfg, nation);
  const of = (s, id, nation) => conditionOf(s.conditions ?? { schema: 'conditions-v1', byUnit: {} }, id, conditionCfg, nation);
  let s = w.s;
  for (let i = 0; i < 20 && !(s.combat?.log ?? []).some((e) => e.outcome === 'difensori in ritirata'); i += 1) s = w.day(s);
  const days = s.combat.log.filter((e) => e.defenders.length).length;
  assert.ok(Math.abs(of(s, 'G1', 'GER').experience - (base('G1', 'GER').experience + days * cfg.condition.experiencePerDay)) < 0.01, 'esperienza: un passo per giorno in linea');
  assert.ok(of(s, 'F1', 'FRA').morale <= base('F1', 'FRA').morale - cfg.condition.moraleRetreat, 'chi si ritira perde morale');
  assert.ok(of(s, 'G1', 'GER').morale >= base('G1', 'GER').morale, 'chi vince non lo perde');
  assert.deepEqual(validateState.length >= 0 && validateBattleExtras(s), []);
  const low = of(s, 'F1', 'FRA').morale;
  for (let i = 0; i < 3; i += 1) s = w.day({ ...s, movement: { ...s.movement, orders: {} } });
  const later = of(s, 'F1', 'FRA').morale;
  assert.ok(later > low && later <= base('F1', 'FRA').morale);
  let t = s; for (let i = 0; i < 40; i += 1) t = { ...createTheaterSystem(w.ctx)({ ...t, day: t.day + 1, war: t.war }) };
  assert.ok(of(t, 'F1', 'FRA').morale <= base('F1', 'FRA').morale, 'mai oltre il valore di partenza');
});

// ---- 17/11/2026: Panzer tedeschi per modello ----
const DEU_TANK = WEAPON_OF('DEU', 'equipment.carri');
const resolveDeu = (id) => WEAPON_OF('DEU', `equipment.${id}`);
const panzer = (item, year) => rawFirepower({ 'equipment.carri': item }, (k) => WEAPON_OF('DEU', k), cfg, 0, { year, resolve: resolveDeu });
const hardOf = (raw) => raw.direct.hard;

test('Panzer: ogni modello ha il suo peso; la voce generica dei template è la classe TNK-DEU-TANK', () => {
  assert.equal(DEU_TANK.id, 'TNK-DEU-TANK');
  const w = (id) => weaponWeight(resolveDeu(id), cfg);
  const ids = ['TNK-DEU-PZ-I', 'TNK-DEU-PZ-II', 'TNK-DEU-PZ-III', 'TNK-DEU-PZ-IV', 'TNK-DEU-PZ-V', 'TNK-DEU-PZ-VI', 'TNK-DEU-PZ-VIB'];
  for (const id of ids) assert.deepEqual({ soft: w(id).soft, hard: w(id).hard, armor: w(id).armor }, cfg.firepower.tankModels[id]);
  // corazza crescente lungo le generazioni (18/11/2026: il Pz IV a canna corta, 14–30 mm, è meno corazzato del Pz III: si confrontano le generazioni)
  const chain = [['TNK-DEU-PZ-I'], ['TNK-DEU-PZ-II'], ['TNK-DEU-PZ-III', 'TNK-DEU-PZ-IV'], ['TNK-DEU-PZ-III-J', 'TNK-DEU-PZ-IV-G'], ['TNK-DEU-PZ-V'], ['TNK-DEU-PZ-VI'], ['TNK-DEU-PZ-VIB']];
  for (let i = 1; i < chain.length; i += 1) assert.ok(Math.min(...chain[i].map((id) => w(id).armor)) >= Math.max(...chain[i - 1].map((id) => w(id).armor)), `corazza: ${chain[i]} contro ${chain[i - 1]}`);
  assert.ok(w('TNK-DEU-PZ-IV-G').armor > w('TNK-DEU-PZ-IV').armor && w('TNK-DEU-PZ-III-J').armor > w('TNK-DEU-PZ-III').armor);
  assert.ok(w('TNK-DEU-PZ-IV').soft > w('TNK-DEU-PZ-I').soft * 3 && w('TNK-DEU-PZ-III').hard > w('TNK-DEU-PZ-I').hard * 20);
  assert.deepEqual(validateBattleV2(cfg, { catalogIds: new Set(CATALOG.entries.map((e) => e.equipment_id)) }), []);
  assert.ok(validateBattleV2(cfg, { catalogIds: new Set(['TNK-DEU-TANK']) }).length > 0);
  assert.ok(validateBattleV2({ ...cfg, firepower: { ...cfg.firepower, fleetMix: { 'TNK-DEU-TANK': [{ from: 1936, mix: { 'TNK-DEU-PZ-I': 0.5 } }] } } }).length > 0);
});

test('Panzer: la dotazione iniziale segue il parco dell’anno di nascita della divisione', () => {
  const item = { planned: 400, effective: 400 };
  assert.deepEqual(tankParts(item, DEU_TANK, 400, 1936, cfg, resolveDeu).map((p) => [p.weapon.id, p.n]), [['TNK-DEU-PZ-I', 400]]);
  assert.deepEqual(tankParts(item, DEU_TANK, 400, 1900, cfg, resolveDeu).map((p) => p.weapon.id), ['TNK-DEU-PZ-I'], 'prima del primo anno vale la prima riga');
  const y39 = tankParts(item, DEU_TANK, 400, 1939, cfg, resolveDeu);
  assert.ok(Math.abs(y39.reduce((s, p) => s + p.n, 0) - 400) < 1e-9);
  assert.equal(y39.find((p) => p.weapon.id === 'TNK-DEU-PZ-IV').n, 24); // settembre 1939: 6% Panzer IV (parco con i carri cechi, 17/11/2026)
  assert.equal(y39.find((p) => p.weapon.id === 'TNK-DEU-PZ-35T').n, 24);
  assert.equal(panzer(item, 1936).direct.soft, 400 * 18);
  assert.equal(panzer(item, 1936).armor, 0.4);
  assert.ok(hardOf(panzer(item, 1941)) > hardOf(panzer(item, 1939)) * 2.5 && hardOf(panzer(item, 1939)) > hardOf(panzer(item, 1936)) * 3); // 18/11: Pz IV corto più debole contro i carri
  assert.ok(panzer(item, 1944).armor > 1.2);
  // una voce senza fleetMix (altre nazioni) resta com'era
  const fra = WEAPON_OF('FRA', 'equipment.TNK-FRA-B1BIS-1940');
  assert.deepEqual(tankParts(item, fra, 400, 1940, cfg, null), [{ n: 400, weapon: fra }]);
});

test('Panzer: i carri arrivati dalla produzione restano registrati per modello e sostituiscono i persi', () => {
  const t = (qty, model, day) => ({ id: `P|c|${day}|${model}`, divisionId: 'P', item: 'equipment.carri', qty, sentOn: '1940-01-01', arrivesOn: `1940-01-${day}`, from: 'stock', stockKey: `equipment.${model}` });
  let f = { schema: 'forces-v1', initialized: true, divisions: { P: { templateId: 't', since: '1936-01-01', items: { 'equipment.carri': { planned: 400, effective: 300, source: 'template' } } } }, transfers: [t(60, 'TNK-DEU-PZ-IV', '02'), t(80, 'TNK-DEU-PZ-III', '03')] };
  f = applyArrivals(f, '1940-01-02').forces;
  assert.deepEqual(f.divisions.P.items['equipment.carri'].models, { 'TNK-DEU-PZ-IV': 60 });
  f = applyArrivals(f, '1940-01-03').forces;
  const it = f.divisions.P.items['equipment.carri'];
  assert.equal(it.effective, 400, 'non oltre il previsto: 40 Panzer III presi su 80');
  assert.deepEqual(it.models, { 'TNK-DEU-PZ-IV': 60, 'TNK-DEU-PZ-III': 40 });
  assert.deepEqual(validateReinforcementFields(f), []);
  // 300 Panzer I della dotazione 1936 + 60 Panzer IV + 40 Panzer III
  const parts = Object.fromEntries(tankParts(it, DEU_TANK, 400, 1936, cfg, resolveDeu).map((p) => [p.weapon.id, p.n]));
  assert.deepEqual(parts, { 'TNK-DEU-PZ-IV': 60, 'TNK-DEU-PZ-III': 40, 'TNK-DEU-PZ-I': 300 });
  assert.ok(hardOf(panzer(it, 1936)) > hardOf(panzer({ planned: 400, effective: 400 }, 1936)) * 4);
  // perdite pesanti: restano 50 carri, poi arrivano 100 Tiger → i registrati di prima si riducono a 50 in proporzione
  const hit = { ...f, divisions: { P: { ...f.divisions.P, items: { 'equipment.carri': { ...it, effective: 50 } } } }, transfers: [t(100, 'TNK-DEU-PZ-VI', '09')] };
  const after = applyArrivals(hit, '1940-01-09').forces.divisions.P.items['equipment.carri'];
  assert.equal(after.effective, 150);
  assert.deepEqual(after.models, { 'TNK-DEU-PZ-IV': 30, 'TNK-DEU-PZ-III': 20, 'TNK-DEU-PZ-VI': 100 });
  // registrati oltre gli effettivi (perdite non ancora rimpiazzate): in battaglia contano in proporzione
  const worn = tankParts({ ...it, effective: 100 }, DEU_TANK, 100, 1936, cfg, resolveDeu);
  assert.deepEqual(Object.fromEntries(worn.map((p) => [p.weapon.id, p.n])), { 'TNK-DEU-PZ-IV': 60, 'TNK-DEU-PZ-III': 40 });
  // arrivo dalla voce stessa o da scorta generica: nessun modello registrato
  const plain = applyArrivals({ ...f, divisions: { Q: { templateId: 't', since: '1936-01-01', items: { 'equipment.carri': { planned: 10, effective: 0, source: 'template' } } } }, transfers: [{ id: 'x', divisionId: 'Q', item: 'equipment.carri', qty: 5, sentOn: '1940-01-01', arrivesOn: '1940-01-02', from: 'stock' }, { id: 'y', divisionId: 'Q', item: 'equipment.carri', qty: 2, sentOn: '1940-01-01', arrivesOn: '1940-01-02', from: 'stock', stockKey: 'tanks' }] }, '1940-01-02').forces;
  assert.equal('models' in plain.divisions.Q.items['equipment.carri'], false);
  assert.ok(validateReinforcementFields({ divisions: { P: { items: { a: { models: { x: -1 } } } } } }).length > 0);
});

test('corazzate sovietiche (18/11/2026): nei posti di T-34 e KV la divisione nata nel 1941 ha in maggioranza BT e T-26; i T-34 prodotti contano come T-34', () => {
  const W = (id) => WEAPON_OF('USSR', `equipment.${id}`);
  const t34 = W('TNK-USSR-T34-1940');
  const mix = (item, year) => { const o = {}; for (const p of tankParts(item, t34, item.effective, year, cfg, W)) o[p.weapon.id] = Math.round(((o[p.weapon.id] ?? 0) + p.n) * 100) / 100; return o; };
  assert.deepEqual(mix({ planned: 210, effective: 200 }, 1941), { 'TNK-USSR-T34-1940': 50, 'TNK-USSR-BT-1940': 90, 'TNK-USSR-T26-1940': 60 });
  assert.deepEqual(mix({ planned: 210, effective: 200 }, 1943), { 'TNK-USSR-T34-1940': 200 });
  assert.deepEqual(mix({ planned: 210, effective: 200, models: { 'TNK-USSR-T34-1940': 100 } }, 1941), { 'TNK-USSR-T34-1940': 125, 'TNK-USSR-BT-1940': 45, 'TNK-USSR-T26-1940': 30 }, '100 prodotti + 25% dei 100 iniziali');
  const raw = (y) => rawFirepower({ 'equipment.TNK-USSR-T34-1940': { planned: 210, effective: 210 }, 'equipment.TNK-USSR-KV-1940': { planned: 63, effective: 63 } }, (k) => WEAPON_OF('USSR', k), cfg, 0, { year: y, resolve: W });
  assert.ok(raw(1941).armor < raw(1943).armor * 0.85 && raw(1941).direct.hard < raw(1943).direct.hard * 0.75);
});
