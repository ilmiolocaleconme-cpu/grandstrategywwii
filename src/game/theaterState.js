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
// terreno, fiumi e ponti non modificano ancora la battaglia (defenseMultiplier = 1 salvo `ctx.defenseMultiplier`); niente rifornimenti, morale
// o comandanti nell'esito; nessun dato storico di guerra: la guerra si dichiara a mano.
import { createWar, declareWar, atWar, enemiesOf } from '../rules/war.js';
import { createTheaters, createAssignment, cancelAssignment, completeAssignment, dropUnits, activeAssignments } from '../rules/theater.js';
import { resolveBattleDay, categoryPower } from '../rules/combat.js';
import { positionOf, issueMove, cancelMove } from '../rules/movement.js';
import { provinceStateOf, patchProvinceState } from './provinceState.js';
import { controllerOf } from '../map/geo.js';
import { provinceController, canEnterWar, isFighter, effectiveOf } from './warCommon.js';
import { planAssignment } from './theaterPlan.js';
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
    const u = ctx.unitsById.get(uid);
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
  for (const e of ctx.deploymentDoc.entries) {
    const u = ctx.unitsById.get(e.unit);
    if (!u || !isFighter(state, u)) continue;
    const pos = positionOf(state.movement, ctx.initial, u.id);
    if (!pos) continue;
    const m = effectiveOf(state, u.id);
    if (!map.has(pos)) map.set(pos, []);
    map.get(pos).push({ id: u.id, nation: u.nation, category: u.category, effective: m.effective, planned: m.planned, bonus: entrenchBonus(s0.entrench?.days?.[u.id] ?? 0, ctx.entrenchCfg ?? DEFAULT_ENTRENCH) });
  }
  return map;
}

function applyLoss(state, id, loss) {
  if (!loss) return state;
  const d = state.forces.divisions[id];
  const m = d.items['manpower.war'];
  return { ...state, forces: { ...state.forces, divisions: { ...state.forces.divisions, [id]: { ...d, items: { ...d.items, 'manpower.war': { ...m, effective: m.effective - loss } } } } } };
}

function setPosition(state, unitId, province, ctx) {
  const mv = state.movement ?? { schema: 'movement-v1', positions: {}, orders: {} };
  const { [unitId]: _gone, ...orders } = mv.orders;
  return { ...state, movement: { ...mv, positions: { ...mv.positions, [unitId]: province }, orders } };
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
  return { ...state, combat: { schema: COMBAT_SCHEMA, log } };
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
    const r = resolveBattleDay({ attackers: attackers.map((u) => ({ ...u, bonus: 0 })), defenders, defenseMultiplier: ctx.defenseMultiplier?.(p, s) ?? 1 });
    for (const [id, l] of Object.entries(r.attackerLoss)) s = applyLoss(s, id, l);
    for (const [id, l] of Object.entries(r.defenderLoss)) s = applyLoss(s, id, l);
    s = stopUnits(s, [...attackers, ...defenders].map((u) => u.id));
    const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
    let outcome = 'in corso';
    const retreat = (side, nation) => {
      const to = retreatProvince(s, net, p, nation, hostileProvinces);
      if (to) for (const u of side) s = setPosition(s, u.id, to, ctx);
      return to;
    };
    if (r.defenderRetreats && !r.attackerRetreats) { outcome = retreat(defenders, c) ? 'difensori in ritirata' : 'difensori circondati'; }
    else if (r.attackerRetreats && !r.defenderRetreats) {
      const byNation = new Map();
      for (const u of attackers) byNation.set(u.nation, [...(byNation.get(u.nation) ?? []), u]);
      let moved = false;
      for (const [n, side] of byNation) moved = Boolean(retreat(side, n)) || moved;
      outcome = moved ? 'attaccanti respinti' : 'attaccanti circondati';
    }
    s = logBattle(s, {
      day: s.day, date: s.date, province: p, controller: c,
      attackers: attackers.map((u) => u.id), defenders: defenders.map((u) => u.id),
      attackerLoss: sum(r.attackerLoss), defenderLoss: sum(r.defenderLoss), outcome,
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
    const u = ctx.unitsById.get(id);
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
    const dead = a.units.filter((uid) => { const u = ctx.unitsById.get(uid); return !u || !isFighter(s, u); });
    if (dead.length) s = { ...s, theaters: dropUnits(s.theaters, dead, { date }) };
    const cur = s.theaters.list[a.id];
    if (cur.status !== 'active') continue;
    if (cur.kind === 'attack' && cur.provinces.every((p) => provinceController(s, net, p) === cur.nation)) { s = { ...s, theaters: completeAssignment(s.theaters, a.id, { date }) }; continue; }
    const canEnter = canEnterWar(s, net, cur.nation);
    for (const o of planAssignment(s, ctx, net, cur).orders) {
      const u = ctx.unitsById.get(o.unit);
      const r = issueMove(s.movement ?? { schema: 'movement-v1', positions: {}, orders: {} }, { id: o.unit, category: u.category }, o.to, { initial: ctx.initial, net, canEnter });
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
 * Sistema giornaliero. ctx: { getNet(state) → rete di movimento, unitsById, deploymentDoc, initial (Map unità → provincia), defenseMultiplier? }.
 * Senza guerra né incarichi non fa nulla (stato restituito identico).
 */
export function createTheaterSystem(ctx) {
  return (state) => {
    const hasWar = state.war && Object.keys(state.war.pairs).length > 0;
    const hasAssign = state.theaters && activeAssignments(state.theaters).length > 0;
    const hasDig = state.entrench && Object.keys(state.entrench.dig).length > 0;
    if (!hasWar && !hasAssign && !hasDig) return state;
    const net = ctx.getNet(state);
    if (!net) return state;
    let s = state;
    if (hasWar) { s = battlePhase(s, ctx, net); s = capturePhase(s, ctx, net); }
    if (hasAssign) s = assignmentPhase(s, ctx, net);
    s = entrenchPhase(s, ctx); // dopo gli ordini del giorno: chi parte non guadagna un giorno
    return s;
  };
}

export { enemiesOf };
