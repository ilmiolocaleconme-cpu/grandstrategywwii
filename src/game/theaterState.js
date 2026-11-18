// Incarichi di teatro, guerra e battaglie nello stato della partita (campi OPZIONALI `war`, `theaters`, `combat`: nessuna migrazione dello schema).
// Le regole pure sono in src/rules/{war,theater,combat}.js; qui: azioni del giocatore e SISTEMA GIORNALIERO (dopo il movimento).
//
// Ogni giorno, per le sole divisioni con una dotazione (state.forces) e uomini effettivi > 0:
//  1. contatto: in una provincia dove sono presenti il controllore e unità di nazioni in guerra con lui si combatte (resolveBattleDay);
//     le unità che arrivano in una provincia contesa fermano la marcia; la parte che cede si ritira in una provincia amica adiacente;
//  2. conquista: una provincia senza difensori e con truppe di una nazione in guerra con il controllore passa all'occupante;
//  3. incarichi: le unità senza ordine si dirigono verso l'obiettivo più vicino (attacco: province da prendere; difesa: province da tenere);
//     l'incarico di attacco si chiude quando tutti gli obiettivi sono dell'incaricante.
// PROVVISORIO / MANCANTE: l'IA non dichiara guerra, non attacca e non assegna incarichi (i difensori restano e combattono dove sono);
// TERRENO E FIUMI (16/11/2026): con `ctx.terrainOf` e `ctx.terrainCfg` il terreno della provincia moltiplica la difesa e pesa sulla potenza di
// ogni divisione secondo la categoria; con `ctx.riverBetween` un attaccante arrivato attraversando un fiume medio o grande combatte ridotto
// finché resta in quel posto (src/rules/terrainCombat.js; provenienza da state.movement.from). Lo stato dei ponti non conta ancora.
// Niente rifornimenti, morale o comandanti nell'esito; nessun dato storico di guerra: la guerra si dichiara a mano.
import { createWar, declareWar, atWar, enemiesOf } from '../rules/war.js';
import { unitOf } from '../rules/unitRegistry.js';
import { createTheaters, createAssignment, cancelAssignment, completeAssignment, dropUnits, activeAssignments } from '../rules/theater.js';
import { resolveBattleDay, resolveUrbanBattleDay, categoryPower, equipmentLosses, apRoundsBonus } from '../rules/combat.js';
import { positionOf, issueMove, cancelMove } from '../rules/movement.js';
import { provinceStateOf, patchProvinceState } from './provinceState.js';
import { controllerOf } from '../map/geo.js';
import { provinceController, canEnterWar, isFighter, effectiveOf } from './warCommon.js';
import { planAssignment } from './theaterPlan.js';
import { terrainDefense, terrainCategoryFactor, riverFactor } from '../rules/terrainCombat.js';
import { firepowerBase, sideHardness, cohesionOf, cohesionLoss, cohesionPower, experiencePower, sideBreaks, recoverCohesion, frontageOf, splitLine, drawSupply, splitCasualties, mobileShare, retreatPrisoners, addCasualties, createCohesion, seasonFactor, COHESION_SCHEMA, CASUALTIES_SCHEMA } from '../rules/battleV2.js';
import { RETREAT_BELOW } from '../rules/combat.js';
import { conditionOf, createConditionState, clamp as clampCondition } from '../rules/divisionCondition.js';
import { createEntrench, entrenchBonus, setDig, tickEntrench, validateEntrench, DEFAULT_ENTRENCH } from '../rules/entrench.js';
export { provinceController, canEnterWar, isFighter };

/** Cosa significa «Muovi» verso una provincia: marcia su territorio proprio; attacco se la controlla un nemico in guerra con il giocatore; altrimenti marcia (che fallirà senza percorso su territorio proprio). */
export function moveIntent(state, net, to) {
  const c = provinceController(state, net, to);
  if (c === state.player) return { kind: 'move', controller: c };
  if (state.war && enemiesOf(state.war, state.player).includes(c)) return { kind: 'attack', controller: c };
  return { kind: 'move', controller: c };
}

export { validateWar } from '../rules/war.js';
export { validateTheaters } from '../rules/theater.js';
export { validateEntrench };
export const COMBAT_SCHEMA = 'combat-v1';
export const LOG_LIMIT = 100;

export function validateCombat(c) {
  if (c === undefined) return [];
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return ['combattimento: non è un oggetto'];
  const errors = [];
  if (c.schema !== COMBAT_SCHEMA) errors.push(`combattimento: schema ${JSON.stringify(c.schema)}`);
  if (!Array.isArray(c.log)) errors.push('combattimento: log mancante');
  else if (c.log.length > LOG_LIMIT) errors.push('combattimento: log oltre il limite');
  return errors;
}

export function playerDeclareWar(state, target) {
  if (!state.player) throw new Error('nessun giocatore');
  return { ...state, war: declareWar(state.war ?? createWar(), { a: state.player, b: target, date: state.date }) };
}

/**
 * Il giocatore dà un incarico: kind, province (id madri) e unità. Controlli: unità sue e in grado di combattere; attacco = obiettivi
 * controllati da nazioni in guerra con te; difesa = province che controlli. Lancia un Error sui blocchi. Ritorna { state, id }.
 */
export function playerAssign(state, { kind, provinces, units, ctx }) {
  const net = ctx.getNet(state);
  const own = [];
  for (const uid of units) {
    const u = unitOf(state, uid, ctx.unitsById);
    if (!u) throw new Error(`unità inesistente: ${uid}`);
    if (u.nation !== state.player) throw new Error(`${u.name} non è tua`);
    if (!isFighter(state, u)) throw new Error(`${u.name} non può combattere (nessuna dotazione o uomini a zero)`);
    own.push(uid);
  }
  for (const p of provinces) {
    if (!net.has(p)) throw new Error(`provincia sconosciuta: ${p}`);
    const c = provinceController(state, net, p);
    if (kind === 'attack' && !atWar(state.war, c, state.player)) throw new Error(`${net.name(p)} è controllata da ${c}: non sei in guerra con lei`);
    if (kind === 'defend' && c !== state.player) throw new Error(`${net.name(p)} non è tua (la controlla ${c})`);
  }
  const r = createAssignment(state.theaters ?? createTheaters(), { nation: state.player, kind, provinces, units: own, date: state.date });
  return { state: { ...state, theaters: r.state }, id: r.id };
}

export function playerCancelAssignment(state, id) {
  const th = state.theaters;
  const a = th?.list?.[id];
  if (!a) throw new Error(`incarico inesistente: ${id}`);
  if (a.nation !== state.player) throw new Error('non è un tuo incarico');
  let movement = state.movement;
  if (movement) for (const u of a.units) movement = cancelMove(movement, u);
  return { ...state, theaters: cancelAssignment(th, id, { date: state.date }), ...(movement ? { movement } : {}) };
}

// ---- sistema giornaliero ---------------------------------------------------------------------------------------------------------------

function combatantsByProvince(state, ctx) {
  const s0 = state;
  const map = new Map();
  const canon = ctx.getNet?.(state)?.canon ?? ((x) => x); // si combatte per POSTO: la sponda (una madre divisa vale la sponda principale)
  for (const e of ctx.deploymentDoc.entries) {
    const u = unitOf(state, e.unit, ctx.unitsById);
    if (!u || !isFighter(state, u)) continue;
    const at = positionOf(state.movement, ctx.initial, u.id);
    if (!at) continue;
    const pos = canon(at);
    const m = effectiveOf(state, u.id);
    if (!map.has(pos)) map.set(pos, []);
    const rifle = ctx.rifleBonus?.(s0, u) ?? 0; // qualità dei fucili della nazione (src/rules/rifleQuality.js): vale in attacco e in difesa
    const equipment = ctx.equipmentFactor?.(s0, u) ?? 1; // dotazione d'armi della divisione (src/rules/equipmentFill.js)
    map.get(pos).push({ id: u.id, nation: u.nation, category: u.category, effective: m.effective, planned: m.planned, rifle, equipment, dug: Math.min(1, (s0.entrench?.days?.[u.id] ?? 0) / ((ctx.entrenchCfg ?? DEFAULT_ENTRENCH).rampDays || 1)), bonus: entrenchBonus(s0.entrench?.days?.[u.id] ?? 0, ctx.entrenchCfg ?? DEFAULT_ENTRENCH) + rifle });
  }
  return map;
}

// Perdite di una divisione: uomini e, in proporzione, equipaggiamento (src/rules/combat.js → equipmentLosses). ctx.onEquipmentLost(state, id, lost) (facoltativo)
// aggiorna ciò che dipende dai pezzi persi (es. qualità dei fucili della nazione).
function applyLoss(state, id, loss, ctx = {}) {
  if (!loss) return state;
  const d = state.forces.divisions[id];
  const m = d.items['manpower.war'];
  const lost = equipmentLosses(d.items, m.effective, loss);
  const items = { ...d.items, 'manpower.war': { ...m, effective: m.effective - loss } };
  for (const [k, n] of Object.entries(lost)) items[k] = { ...items[k], effective: items[k].effective - n };
  const s = { ...state, forces: { ...state.forces, divisions: { ...state.forces.divisions, [id]: { ...d, items } } } };
  return Object.keys(lost).length && ctx.onEquipmentLost ? ctx.onEquipmentLost(s, id, lost) : s;
}

function setPosition(state, unitId, province, ctx) {
  const mv = state.movement ?? { schema: 'movement-v1', positions: {}, orders: {} };
  const { [unitId]: _gone, ...orders } = mv.orders;
  const next = { ...mv, positions: { ...mv.positions, [unitId]: province }, orders };
  if (mv.from && unitId in mv.from) { const { [unitId]: _from, ...from } = mv.from; next.from = from; } // una ritirata non è un attraversamento
  return { ...state, movement: next };
}

/**
 * Terreno e fiumi di una battaglia nel posto `p`: { defense, attackers, defenders, crossing }. `defense` moltiplica la potenza dei difensori;
 * le due liste sono le unità con `mult` (terreno per categoria; per gli attaccanti anche il fiume attraversato); `crossing` = id degli
 * attaccanti penalizzati dal fiume. Senza `ctx.terrainOf` / `ctx.riverBetween` tutto vale 1.
 */
export function battleGround(state, ctx, net, p, attackers, defenders) {
  const cfg = ctx.terrainCfg ?? null;
  const terrain = cfg && net.isCity?.(p) !== true ? ctx.terrainOf?.(net.provinceOf?.(p) ?? p) ?? null : null;
  const canon = net.canon ?? ((x) => x);
  const crossing = [];
  const river = (u) => {
    const from = state.movement?.from?.[u.id];
    if (!cfg || !ctx.riverBetween || !from || canon(from) === p) return 1;
    const f = riverFactor(ctx.riverBetween(canon(from), p)?.widthClass, cfg);
    if (f < 1) crossing.push(u.id);
    return f;
  };
  const ground = (u) => terrainCategoryFactor(u.category, terrain, cfg);
  return {
    defense: terrainDefense(terrain, cfg),
    attackers: attackers.map((u) => ({ ...u, mult: ground(u) * river(u) })),
    defenders: defenders.map((u) => ({ ...u, mult: ground(u) })),
    crossing,
  };
}

function stopUnits(state, ids) {
  if (!state.movement) return state;
  let m = state.movement;
  for (const id of ids) m = cancelMove(m, id);
  return m === state.movement ? state : { ...state, movement: m };
}

function retreatProvince(state, net, from, nation, hostile) {
  const options = net.neighbors(from).filter((n) => provinceController(state, net, n) === nation && !hostile.has(n)).sort((a, b) => net.km(from, a) - net.km(from, b) || (a < b ? -1 : 1));
  return options[0] ?? null;
}

function logBattle(state, entry) {
  const log = [...(state.combat?.log ?? []), entry].slice(-LOG_LIMIT);
  return { ...state, combat: { ...(state.combat ?? {}), schema: COMBAT_SCHEMA, log } };
}

// ---- BATTAGLIA v2 (16/11/2026, src/rules/battleV2.js + data/units/battle_v2.json): attiva solo con `ctx.battleCfg` ----------------------
// Per ogni battaglia: 1) larghezza del fronte (linea e riserva); 2) munizioni e carburante dalle scorte nazionali; 3) potenza di fuoco dalle armi
// (ctx.rawFirepower) contro la quota corazzata del nemico, con preparazione d'artiglieria il primo giorno; 4) coesione, esperienza, stagione.
// Senza `ctx.rawFirepower` (o per una divisione senza armi riconosciute) la potenza resta quella di prima, per uomini e categoria.
function prepareV2(state, ctx, net, p, attackers, defenders, g) {
  const cfg = ctx.battleCfg;
  let s = state;
  const isCity = net.isCity?.(p) === true;
  const terrain = isCity ? null : ctx.terrainOf?.(net.provinceOf?.(p) ?? p) ?? null;
  const width = frontageOf(terrain, isCity, cfg);
  const withCoh = (list) => list.map((u) => ({ ...u, cohesion: cohesionOf(s.cohesion, u.id) }));
  const A = splitLine(withCoh(g.attackers), width); const D = splitLine(withCoh(g.defenders), width);
  // rifornimenti: fabbisogno del giorno delle divisioni IN LINEA, prelevato dalle scorte della nazione (assente lo stato delle nazioni: copertura piena)
  const need = new Map();
  const addNeed = (u, phase) => {
    const n = need.get(u.nation) ?? { ammo: 0, fuel: 0 };
    n.ammo += ctx.ammoNeed?.(u, phase) ?? 0;
    if (cfg.supply.fuelCategories.includes(u.category)) n.fuel += ctx.fuelNeed?.(u) ?? 0;
    need.set(u.nation, n);
  };
  A.line.forEach((u) => addNeed(u, 'attack')); D.line.forEach((u) => addNeed(u, 'defense'));
  const supply = new Map();
  for (const nation of [...need.keys()].sort()) {
    const n = s.nations?.[nation];
    if (!n) { supply.set(nation, { ammo: 1, fuel: 1 }); continue; }
    const am = drawSupply(n.stocks?.munitions, need.get(nation).ammo); const fu = drawSupply(n.stocks?.fuel, need.get(nation).fuel);
    supply.set(nation, { ammo: am.coverage, fuel: fu.coverage });
    if (am.used > 0 || fu.used > 0) s = { ...s, nations: { ...s.nations, [nation]: { ...n, stocks: { ...n.stocks, ...(am.used > 0 ? { munitions: am.left } : {}), ...(fu.used > 0 ? { fuel: fu.left } : {}) } } } };
  }
  // battaglia nuova (nessuno scontro qui ieri) = giorno di preparazione d'artiglieria
  const prev = s.combat?.battles?.[p];
  const since = prev && prev.last >= s.day - 1 ? prev.since : s.day;
  const prep = s.day - since < cfg.phases.prepDays;
  const fuelOf = (u) => supply.get(u.nation)?.fuel ?? 1;
  const raws = new Map([...A.line, ...D.line].map((u) => [u.id, ctx.rawFirepower?.(s, u) ?? null]));
  const hard = (line) => sideHardness(line.map((u) => ({ ...u, fuel: fuelOf(u), armor: raws.get(u.id)?.recognized ? raws.get(u.id).armor : 1 })), cfg);
  const hA = hard(A.line); const hD = hard(D.line);
  const centre = net.centre?.(p) ?? null;
  const ready = (u, enemyH, attacking) => {
    const sup = supply.get(u.nation) ?? { ammo: 1, fuel: 1 };
    const cond = conditionRead(s, ctx, u);
    const raw = raws.get(u.id);
    let mult = (u.mult ?? 1) * cohesionPower(u.cohesion, cfg) * experiencePower(cond?.experience, cfg) * (attacking ? seasonFactor(s.date, centre, u.category, cfg) : 1);
    const out = { ...u, cond };
    if (raw?.recognized) {
      out.base = firepowerBase(raw, enemyH, { effective: u.effective, planned: u.planned, category: u.category, ammo: sup.ammo, fuel: sup.fuel, prep: attacking && prep && sup.ammo >= cfg.phases.prepMinAmmo }, cfg);
    } else { // regola di prima, ma munizioni e carburante contano lo stesso (media delle classi leggera e artiglieria)
      const af = cfg.supply.ammoFloor;
      const floor = (af.small + af.artillery) / 2;
      mult *= (floor + (1 - floor) * sup.ammo) * (cfg.supply.fuelCategories.includes(u.category) ? cfg.supply.fuelFloor + (1 - cfg.supply.fuelFloor) * sup.fuel : 1);
    }
    out.mult = mult;
    return out;
  };
  return {
    state: s, width, prep, since, supply,
    lineA: A.line.map((u) => ready(u, hD, true)), lineD: D.line.map((u) => ready(u, hA, false)), reserveA: A.reserve, reserveD: D.reserve,
  };
}

// Morale ed esperienza: con `ctx.conditionCfg` (data/units/condition_config.json) si leggono da state.conditions e la battaglia li muove
// (regole in battle_v2.json → condition); altrimenti si usa `ctx.conditionOf` in sola lettura (o i valori medi).
const conditionRead = (state, ctx, u) => (ctx.conditionCfg ? conditionOf(state.conditions ?? createConditionState(), u.id, ctx.conditionCfg, u.nation) : ctx.conditionOf?.(state, u) ?? null);
function conditionShift(state, ctx, unit, { morale = 0, experience = 0, moraleCap = 100 }) {
  const cc = ctx.conditionCfg; const cfg = ctx.battleCfg;
  if (!cc || !cfg || (morale === 0 && experience === 0)) return state;
  const conditions = state.conditions ?? createConditionState();
  const cur = conditionOf(conditions, unit.id, cc, unit.nation);
  const r2 = (v) => Math.round(v * 100) / 100;
  const nextMorale = morale > 0 ? Math.max(cur.morale, Math.min(moraleCap, cur.morale + morale)) : clampCondition(cur.morale + morale);
  const nextExp = experience > 0 ? Math.max(cur.experience, Math.min(cfg.condition.experienceCap, cur.experience + experience)) : cur.experience;
  if (nextMorale === cur.morale && nextExp === cur.experience) return state;
  const entry = { experience: r2(nextExp), morale: r2(nextMorale), readiness: cur.readinessBeforeDistance, policy: cur.policy, isNew: cur.isNew, trainedThrough: cur.trainedThrough };
  return { ...state, conditions: { ...conditions, byUnit: { ...conditions.byUnit, [unit.id]: entry } } };
}

const setCohesion = (state, values) => {
  const byUnit = { ...(state.cohesion?.byUnit ?? {}) };
  for (const [id, v] of Object.entries(values)) { if (v >= 100) delete byUnit[id]; else byUnit[id] = Math.max(0, Math.round(v * 100) / 100); }
  return { ...state, cohesion: { schema: COHESION_SCHEMA, byUnit } };
};

/** Errori di forma di `state.cohesion` e `state.casualties` (opzionali). */
export function validateBattleExtras(state) {
  const errors = [];
  const c = state.cohesion;
  if (c !== undefined) {
    if (c === null || typeof c !== 'object' || c.schema !== COHESION_SCHEMA || c.byUnit === null || typeof c.byUnit !== 'object') errors.push('coesione: forma non valida');
    else for (const [id, v] of Object.entries(c.byUnit)) if (!(v >= 0 && v <= 100)) errors.push(`coesione: valore di ${id} fuori da 0..100`);
  }
  const k = state.casualties;
  if (k !== undefined) {
    if (k === null || typeof k !== 'object' || k.schema !== CASUALTIES_SCHEMA || k.byNation === null || typeof k.byNation !== 'object') errors.push('perdite: forma non valida');
    else for (const [n, row] of Object.entries(k.byNation)) for (const [f, v] of Object.entries(row ?? {})) if (!(v >= 0)) errors.push(`perdite: ${n}.${f} non valido`);
  }
  return errors;
}

function battlePhase(state, ctx, net) {
  let s = state;
  const by = combatantsByProvince(s, ctx);
  const hostileProvinces = new Set();
  for (const [p, units] of by) {
    const c = provinceController(s, net, p);
    if (units.some((u) => u.nation !== c && atWar(s.war, u.nation, c))) hostileProvinces.add(p);
  }
  for (const p of [...by.keys()].sort()) {
    const units = by.get(p);
    const c = provinceController(s, net, p);
    const defenders = units.filter((u) => u.nation === c);
    const attackers = units.filter((u) => u.nation !== c && atWar(s.war, u.nation, c));
    if (defenders.length === 0 || attackers.length === 0) continue;
    // nel nodo di una zona urbana si combatte con le regole urbane (imboscate, difesa rafforzata, mezzi penalizzati)
    const solve = net.isCity?.(p) === true ? resolveUrbanBattleDay : resolveBattleDay;
    // proiettili perforanti (13/11/2026): bonus contro la quota di corazzati dell'altra parte, se la nazione ha la tecnologia (ctx.apRounds → { max, coverage })
    const ap = (u, enemies) => { const a = ctx.apRounds?.(s, u.nation); return a ? apRoundsBonus(enemies, a.max, a.coverage) : 0; };
    const g = battleGround(s, ctx, net, p, attackers, defenders); // terreno della provincia e fiume attraversato dagli attaccanti
    const cfg2 = ctx.battleCfg ?? null;
    const v2 = cfg2 ? prepareV2(s, ctx, net, p, attackers, defenders, g) : null;
    if (v2) s = v2.state;
    const lineA = v2 ? v2.lineA : g.attackers; const lineD = v2 ? v2.lineD : g.defenders;
    const r = solve({ attackers: lineA.map((u) => ({ ...u, bonus: u.rifle + ap(u, defenders) })), defenders: lineD.map((u) => ({ ...u, bonus: u.bonus + ap(u, attackers) })), defenseMultiplier: (ctx.defenseMultiplier?.(p, s) ?? 1) * g.defense, ...(cfg2 ? { lossBase: cfg2.losses.base, lossCap: cfg2.losses.cap } : {}) });
    const tally = { a: { killed: 0, wounded: 0, missing: 0, prisoners: 0 }, d: { killed: 0, wounded: 0, missing: 0, prisoners: 0 } };
    const nationOf = new Map([...attackers, ...defenders].map((u) => [u.id, u.nation]));
    const lose = (id, l, side) => {
      s = applyLoss(s, id, l, ctx);
      if (!cfg2 || !(l > 0)) return;
      const parts = splitCasualties(l, cfg2);
      s = { ...s, casualties: addCasualties(s.casualties, nationOf.get(id), parts) };
      for (const k of ['killed', 'wounded', 'missing']) tally[side][k] += parts[k];
    };
    for (const [id, l] of Object.entries(r.attackerLoss)) lose(id, l, 'a');
    for (const [id, l] of Object.entries(r.defenderLoss)) lose(id, l, 'd');
    s = stopUnits(s, [...attackers, ...defenders].map((u) => u.id));
    const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
    let aRetreats = r.attackerRetreats; let dRetreats = r.defenderRetreats;
    if (v2) {
      // coesione: chi è in linea la perde secondo la pressione nemica; la riserva recupera piano. Cede chi scende alla soglia (o sotto il 25% degli uomini)
      const next = {};
      const drain = (line, own, other, defending) => line.map((u) => {
        const loss = cohesionLoss({ ratio: own > 0 ? other / own : Infinity, cond: u.cond, commander: ctx.hasCommander?.(s, u.id) === true, defending, entrench: defending ? u.dug : 0 }, cfg2);
        next[u.id] = Math.max(0, u.cohesion - loss);
        const left = effectiveOf(s, u.id)?.effective ?? 0;
        const heavy = u.effective > 0 && (u.effective - left) / u.effective > cfg2.condition.heavyLossShare; // giornata di forti perdite: il morale cala
        s = conditionShift(s, ctx, u, { experience: cfg2.condition.experiencePerDay, morale: heavy ? -cfg2.condition.moraleHeavyLoss : 0 });
        return { effective: left, planned: u.planned, cohesion: next[u.id] };
      });
      const afterA = drain(lineA, r.attackerPower, r.defenderPower, false); const afterD = drain(lineD, r.defenderPower, r.attackerPower, true);
      for (const u of [...v2.reserveA, ...v2.reserveD]) next[u.id] = recoverCohesion(u.cohesion, 'reserve', cfg2);
      s = setCohesion(s, next);
      const spent = (list) => { const e = list.reduce((t, u) => t + u.effective, 0); const pl = list.reduce((t, u) => t + u.planned, 0); return pl > 0 && e / pl < RETREAT_BELOW; };
      aRetreats = sideBreaks(afterA, cfg2) || spent(afterA) || r.attackerPower === 0;
      dRetreats = !aRetreats && (sideBreaks(afterD, cfg2) || spent(afterD) || r.defenderPower === 0); // se cedono entrambi, cede chi attacca
      s = { ...s, combat: { ...(s.combat ?? { schema: COMBAT_SCHEMA, log: [] }), battles: { ...Object.fromEntries(Object.entries(s.combat?.battles ?? {}).filter(([, b]) => b.last >= s.day - 1)), [p]: { since: v2.since, last: s.day } } } };
    }
    let outcome = 'in corso';
    // v2: chi si ritira lascia prigionieri (di più se inseguito da truppe mobili); chi non ha dove ritirarsi si arrende
    const capture = (side, winners, key, all) => {
      if (!cfg2) return;
      const mobile = mobileShare(winners.map((u) => ({ ...u, effective: effectiveOf(s, u.id)?.effective ?? 0 })), cfg2);
      for (const u of side) {
        const men = effectiveOf(s, u.id)?.effective ?? 0;
        const n = all ? men : retreatPrisoners(men, mobile, cfg2);
        if (!(n > 0)) continue;
        s = applyLoss(s, u.id, n, ctx);
        s = { ...s, casualties: addCasualties(s.casualties, u.nation, { prisoners: n }) };
        tally[key].prisoners += n;
      }
    };
    const retreat = (side, nation, winners, key) => {
      const to = retreatProvince(s, net, p, nation, hostileProvinces);
      capture(side, winners, key, !to);
      if (to) for (const u of side) s = setPosition(s, u.id, to, ctx);
      return to;
    };
    const surrounded = cfg2 ? ': resa' : '';
    const mood = (winners, losers) => { // v2: chi vince prende morale, chi cede lo perde
      if (!cfg2) return;
      for (const u of winners) s = conditionShift(s, ctx, u, { morale: cfg2.condition.moraleWin });
      for (const u of losers) s = conditionShift(s, ctx, u, { morale: -cfg2.condition.moraleRetreat });
    };
    if (dRetreats && !aRetreats) { outcome = retreat(defenders, c, lineA, 'd') ? 'difensori in ritirata' : `difensori circondati${surrounded}`; mood(lineA, defenders); }
    else if (aRetreats && !dRetreats) {
      const byNation = new Map();
      for (const u of attackers) byNation.set(u.nation, [...(byNation.get(u.nation) ?? []), u]);
      let moved = false;
      for (const [n, side] of byNation) moved = Boolean(retreat(side, n, lineD, 'a')) || moved;
      outcome = moved ? 'attaccanti respinti' : `attaccanti circondati${surrounded}`;
      mood(lineD, attackers);
    }
    const low = (k) => (v2 ? [...v2.supply].filter(([, x]) => x[k] < 1).map(([n]) => n) : []);
    s = logBattle(s, {
      day: s.day, date: s.date, province: p, controller: c,
      attackers: attackers.map((u) => u.id), defenders: defenders.map((u) => u.id),
      attackerLoss: sum(r.attackerLoss) + tally.a.prisoners, defenderLoss: sum(r.defenderLoss) + tally.d.prisoners, outcome,
      ...(g.defense !== 1 ? { defense: g.defense } : {}), ...(g.crossing.length ? { crossing: g.crossing.length } : {}), // solo se contano: i registri di prima restano uguali
      ...(v2 ? { split: tally, ...(v2.reserveA.length || v2.reserveD.length ? { reserve: [v2.reserveA.length, v2.reserveD.length] } : {}), ...(v2.prep ? { prep: true } : {}), ...(low('ammo').length ? { lowAmmo: low('ammo') } : {}), ...(low('fuel').length ? { lowFuel: low('fuel') } : {}) } : {}),
    });
  }
  return s;
}

function capturePhase(state, ctx, net) {
  let s = state;
  const by = combatantsByProvince(s, ctx);
  for (const p of [...by.keys()].sort()) {
    const units = by.get(p);
    const c = provinceController(s, net, p);
    if (units.some((u) => u.nation === c)) continue;
    const taker = units.filter((u) => atWar(s.war, u.nation, c)).map((u) => u.nation).sort()[0];
    if (!taker) continue;
    const native = controllerOf(net.owner(p), s.control);
    s = patchProvinceState(s, p, taker === native ? { controller: null, occupation: 'none' } : { controller: taker, occupation: 'occupied' });
    s = stopUnits(s, units.filter((u) => u.nation === taker).map((u) => u.id));
    s = logBattle(s, { day: s.day, date: s.date, province: p, controller: c, attackers: units.filter((u) => u.nation === taker).map((u) => u.id), defenders: [], attackerLoss: 0, defenderLoss: 0, outcome: `conquistata da ${taker}` });
  }
  return s;
}

function entrenchPhase(state, ctx) {
  const cfg = ctx.entrenchCfg ?? DEFAULT_ENTRENCH;
  const base = state.entrench ?? createEntrench();
  const defendUnits = new Set(activeAssignments(state.theaters ?? createTheaters()).filter((a) => a.kind === 'defend').flatMap((a) => a.units));
  const ids = new Set([...Object.keys(base.dig), ...defendUnits]);
  if (ids.size === 0) return state;
  const fought = new Set((state.combat?.log ?? []).filter((e) => e.day === state.day).flatMap((e) => [...e.attackers, ...e.defenders]));
  const candidates = [];
  for (const id of ids) {
    const pos = positionOf(state.movement, ctx.initial, id);
    if (!pos) continue;
    candidates.push({ id, pos, hasOrder: Boolean(state.movement?.orders?.[id]), fought: fought.has(id), manual: base.dig[id] === true && !defendUnits.has(id) });
  }
  return { ...state, entrench: tickEntrench(base, candidates, cfg) };
}

// Recupero della coesione (v2): chi oggi non era in una battaglia recupera, più piano se è in marcia. A 100 la voce si toglie (stato piccolo).
function cohesionPhase(state, ctx) {
  const cfg = ctx.battleCfg;
  if (!cfg) return state;
  const fought = new Set((state.combat?.log ?? []).filter((e) => e.day === state.day).flatMap((e) => [...e.attackers, ...e.defenders]));
  let s = state;
  const byUnit = s.cohesion?.byUnit ?? {};
  const next = {};
  for (const id of Object.keys(byUnit).sort()) if (!fought.has(id)) next[id] = recoverCohesion(byUnit[id], s.movement?.orders?.[id] ? 'moving' : 'idle', cfg);
  if (Object.keys(next).length) s = setCohesion(s, next);
  // morale: fuori dalla battaglia risale piano fino al valore di partenza della nazione (mai oltre)
  if (ctx.conditionCfg && s.conditions && cfg.condition.moraleRecoverPerDay > 0) {
    const none = createConditionState();
    for (const id of Object.keys(s.conditions.byUnit).sort()) {
      const u = unitOf(s, id, ctx.unitsById);
      if (!u || fought.has(id)) continue;
      const base = conditionOf(none, id, ctx.conditionCfg, u.nation).morale;
      if (s.conditions.byUnit[id].morale < base && s.conditions.byUnit[id].isNew !== true) s = conditionShift(s, ctx, u, { morale: cfg.condition.moraleRecoverPerDay, moraleCap: base });
    }
  }
  return s;
}

/** Coesione di una unità (0..100; 100 se mai intaccata). */
export const unitCohesion = (state, unitId) => cohesionOf(state.cohesion, unitId);

/** Trinceramento di una unità: { digging, days, bonus } (bonus 0 se non si sta trincerando). */
export function entrenchOf(state, unitId, cfg = DEFAULT_ENTRENCH) {
  const days = state.entrench?.days?.[unitId] ?? 0;
  const digging = state.entrench?.dig?.[unitId] === true;
  return { digging, days, bonus: digging ? entrenchBonus(days, cfg) : 0 };
}

/** Il giocatore ordina a divisioni PROPRIE di trincerarsi (o smettere). Ritorna il nuovo stato; lancia un Error su unità non tue o che non combattono. */
export function playerToggleEntrench(state, { unitIds, on, ctx }) {
  const positions = {};
  for (const id of unitIds) {
    const u = unitOf(state, id, ctx.unitsById);
    if (!u) throw new Error(`unità inesistente: ${id}`);
    if (u.nation !== state.player) throw new Error(`${u.name} non è tua`);
    if (on && !isFighter(state, u)) throw new Error(`${u.name} non può trincerarsi (nessuna dotazione o uomini a zero)`);
    positions[id] = positionOf(state.movement, ctx.initial, id);
    if (on && !positions[id]) throw new Error(`${u.name}: posizione sconosciuta`);
  }
  return { ...state, entrench: setDig(state.entrench ?? createEntrench(), { unitIds, on, positions }) };
}

function nearestTarget(state, net, from, targets, canEnter) {
  let best = null;
  for (const t of [...targets].sort()) {
    const path = findPath(net, from, t, canEnter);
    if (!path) continue;
    let km = 0;
    for (let i = 1; i < path.length; i += 1) km += net.km(path[i - 1], path[i]);
    if (!best || km < best.km) best = { t, km };
  }
  return best?.t ?? null;
}

function assignmentPhase(state, ctx, net) {
  let s = state;
  const date = s.date;
  for (const a of activeAssignments(s.theaters ?? createTheaters())) {
    const dead = a.units.filter((uid) => { const u = unitOf(state, uid, ctx.unitsById); return !u || !isFighter(s, u); });
    if (dead.length) s = { ...s, theaters: dropUnits(s.theaters, dead, { date }) };
    const cur = s.theaters.list[a.id];
    if (cur.status !== 'active') continue;
    if (cur.kind === 'attack' && cur.provinces.every((p) => provinceController(s, net, p) === cur.nation)) { s = { ...s, theaters: completeAssignment(s.theaters, a.id, { date }) }; continue; }
    const canEnter = canEnterWar(s, net, cur.nation);
    for (const o of planAssignment(s, ctx, net, cur).orders) {
      const u = unitOf(state, o.unit, ctx.unitsById);
      const r = issueMove(s.movement ?? { schema: 'movement-v1', positions: {}, orders: {} }, { id: o.unit, category: u.category, speed: ctx.marchSpeedOf?.(s, u) ?? null }, o.to, { initial: ctx.initial, net, canEnter });
      if (r.ok) s = { ...s, movement: r.movement };
    }
  }
  return s;
}

/** Avvisi «servono più truppe» (e «in raccolta») degli incarichi attivi di una nazione. ctx come createTheaterSystem. */
export function theaterAlerts(state, ctx, nation) {
  const net = ctx.getNet(state);
  if (!net || !state.theaters) return [];
  return activeAssignments(state.theaters).filter((a) => a.nation === nation).flatMap((a) => planAssignment(state, ctx, net, a).alerts);
}

/** Il giocatore forza (o toglie la forzatura di) un attacco: parte anche senza la superiorità richiesta. */
export function playerForceAttack(state, id, force = true) {
  const a = state.theaters?.list?.[id];
  if (!a) throw new Error(`incarico inesistente: ${id}`);
  if (a.nation !== state.player) throw new Error('non è un tuo incarico');
  if (a.kind !== 'attack') throw new Error('si forza solo un attacco');
  return { ...state, theaters: { ...state.theaters, list: { ...state.theaters.list, [id]: { ...a, force } } } };
}

/**
 * Sistema giornaliero. ctx: { getNet(state) → rete di movimento, unitsById, deploymentDoc, initial (Map unità → provincia), defenseMultiplier?,
 * marchSpeedOf?(state, u) → km/giorno della divisione secondo i veicoli effettivi (18/11/2026);
 * battleCfg? (data/units/battle_v2.json: accende la battaglia v2) con rawFirepower?(state, u), conditionCfg? (condition_config.json: morale ed
 * esperienza letti da state.conditions e mossi dalla battaglia) oppure conditionOf?(state, u) → { morale, experience } in sola lettura,
 * hasCommander?(state, id), ammoNeed?(u, fase) e fuelNeed?(u) in t/giorno; terrainCfg? (data/units/terrain_combat.json), terrainOf?(provincia madre) → voce di terrain.json, riverBetween?(a, b) → { widthClass } | null }.
 * Senza guerra né incarichi non fa nulla (stato restituito identico).
 */
export function createTheaterSystem(ctx) {
  return (state) => {
    const hasWar = state.war && Object.keys(state.war.pairs).length > 0;
    const hasAssign = state.theaters && activeAssignments(state.theaters).length > 0;
    const hasDig = state.entrench && Object.keys(state.entrench.dig).length > 0;
    const hasCoh = Boolean(ctx.battleCfg) && ((state.cohesion && Object.keys(state.cohesion.byUnit).length > 0) || (Boolean(ctx.conditionCfg) && Boolean(state.combat?.log?.length)));
    if (!hasWar && !hasAssign && !hasDig && !hasCoh) return state;
    const net = ctx.getNet(state);
    if (!net) return state;
    let s = state;
    if (hasWar) { s = battlePhase(s, ctx, net); s = capturePhase(s, ctx, net); }
    if (hasCoh || s.cohesion) s = cohesionPhase(s, ctx);
    if (hasAssign) s = assignmentPhase(s, ctx, net);
    s = entrenchPhase(s, ctx); // dopo gli ordini del giorno: chi parte non guadagna un giorno
    return s;
  };
}

export { enemiesOf };
