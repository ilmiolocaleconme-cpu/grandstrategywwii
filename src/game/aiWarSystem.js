// IA di guerra v1 (30/10/2026): per ogni nazione NON del giocatore in guerra, ogni PERIOD giorni, assegna le divisioni libere a incarichi
// di DIFESA (province proprie minacciate) e di ATTACCO (province nemiche di frontiera battibili). Usa gli stessi incarichi del giocatore
// (src/rules/theater.js): marcia, battaglia e conquista le esegue il sistema di teatro (theaterState.js).
//
// REGOLE (tutti i numeri sono IPOTESI di bilanciamento di Claude, da approvare):
//  - minaccia di una provincia propria = potenza nemica presente + potenza nemica nelle province adiacenti;
//  - difesa: per ogni provincia minacciata (minaccia decrescente) si mandano le divisioni libere più vicine (entro MAX_DEPTH province di
//    territorio proprio) finché la potenza presente o assegnata ≥ minaccia; un incarico di difesa senza più minaccia si scioglie;
//  - attacco: obiettivi = province nemiche adiacenti al proprio territorio; si attacca se la potenza libera nelle vicinanze ≥ ATTACK_RATIO ×
//    quella dei difensori (provincia vuota: basta una divisione); al massimo MAX_ATTACKS nuovi attacchi per periodo e nazione;
//  - le divisioni già in un incarico di attacco non si toccano; nessun incarico per chi non ha dotazione (non combatte).
// NON FATTO / MANCANTE: dichiarazione di guerra dell'IA (nessuna diplomazia: le guerre le dichiara il giocatore o gli eventi), pace/resa,
// riserve strategiche, valutazione di fiumi/terreno/rifornimenti, coordinamento tra alleati (non esistono alleanze), ritirata ordinata,
// produzione e rinforzi orientati alla guerra.
import { createAssignment, cancelAssignment, activeAssignments } from '../rules/theater.js';
import { enemiesOf } from '../rules/war.js';
import { divisionPower } from '../rules/combat.js';
import { positionOf } from '../rules/movement.js';
import { provinceController, isFighter } from './theaterState.js';

export const PERIOD = 7;
export const MAX_DEPTH = 6;
export const ATTACK_RATIO = 1.5;
export const MAX_ATTACKS = 3;

/** Nazioni coinvolte in almeno una guerra, in ordine alfabetico. */
export function nationsAtWar(war) {
  const out = new Set();
  for (const k of Object.keys(war?.pairs ?? {})) for (const n of k.split('|')) out.add(n);
  return [...out].sort();
}

/** Distanze in passi da `start` entro `maxDepth`, passando solo per province che `allow` accetta (start sempre incluso). */
function bfs(net, start, allow, maxDepth) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i];
    if (dist.get(cur) >= maxDepth) continue;
    for (const n of net.neighbors(cur)) {
      if (dist.has(n) || !allow(n)) continue;
      dist.set(n, dist.get(cur) + 1);
      queue.push(n);
    }
  }
  return dist;
}

function snapshot(state, ctx, nation, enemies) {
  const mine = [];
  const enemyPower = new Map();
  for (const e of ctx.deploymentDoc.entries) {
    const u = ctx.unitsById.get(e.unit);
    if (!u || !isFighter(state, u)) continue;
    const pos = positionOf(state.movement, ctx.initial, u.id);
    if (!pos) continue;
    const power = divisionPower({ category: u.category, effective: state.forces.divisions[u.id].items['manpower.war'].effective });
    if (u.nation === nation) mine.push({ id: u.id, pos, power });
    else if (enemies.has(u.nation)) enemyPower.set(pos, (enemyPower.get(pos) ?? 0) + power);
  }
  return { mine, enemyPower };
}

function planNation(state, nation, ctx, net) {
  let s = state;
  const enemies = new Set(enemiesOf(s.war, nation));
  const { mine, enemyPower } = snapshot(s, ctx, nation, enemies);
  const ownProvince = (p) => provinceController(s, net, p) === nation;
  const threat = (p) => (enemyPower.get(p) ?? 0) + net.neighbors(p).reduce((t, n) => t + (enemyPower.get(n) ?? 0), 0);

  // sciogli le difese senza più minaccia
  for (const a of activeAssignments(s.theaters ?? { list: {} })) {
    if (a.nation === nation && a.kind === 'defend' && !a.provinces.some((p) => ownProvince(p) && threat(p) > 0)) s = { ...s, theaters: cancelAssignment(s.theaters, a.id, { date: s.date }) };
  }
  const busy = new Set();
  const defending = new Map(); // provincia → potenza già assegnata a difenderla
  const powerOf = new Map(mine.map((u) => [u.id, u.power]));
  for (const a of activeAssignments(s.theaters ?? { list: {} })) {
    if (a.nation !== nation) continue;
    for (const u of a.units) busy.add(u);
    if (a.kind === 'defend') for (const p of a.provinces) defending.set(p, (defending.get(p) ?? 0) + a.units.reduce((t, u) => t + (powerOf.get(u) ?? 0), 0));
  }
  let idle = mine.filter((u) => !busy.has(u.id));
  const take = (ids) => { idle = idle.filter((u) => !ids.includes(u.id)); };

  // difesa
  const threatened = [...new Set(mine.map((u) => u.pos).concat([...enemyPower.keys()].flatMap((p) => [p, ...net.neighbors(p)])))]
    .filter((p) => ownProvince(p) && threat(p) > 0).sort((a, b) => threat(b) - threat(a) || (a < b ? -1 : 1));
  for (const p of threatened) {
    let covered = (defending.get(p) ?? 0) + mine.filter((u) => u.pos === p && busy.has(u.id) === false).reduce((t, u) => t + u.power, 0);
    if (covered >= threat(p)) continue;
    const dist = bfs(net, p, ownProvince, MAX_DEPTH);
    const pool = idle.filter((u) => dist.has(u.pos)).sort((a, b) => dist.get(a.pos) - dist.get(b.pos) || (a.id < b.id ? -1 : 1));
    const picked = [];
    for (const u of pool) { if (covered >= threat(p)) break; picked.push(u.id); covered += u.power; }
    if (!picked.length) continue;
    s = { ...s, theaters: createAssignment(s.theaters ?? { schema: 'theaters-v1', seq: 0, list: {} }, { nation, kind: 'defend', provinces: [p], units: picked, date: s.date, name: `Difesa IA ${nation}` }).state };
    take(picked);
  }

  // attacco
  const targetSet = new Set();
  for (const u of idle) {
    for (const p of bfs(net, u.pos, ownProvince, MAX_DEPTH).keys()) {
      for (const q of net.neighbors(p)) if (enemies.has(provinceController(s, net, q))) targetSet.add(q);
    }
  }
  const targets = [...targetSet];
  const scored = [];
  for (const q of targets.sort()) {
    const dist = bfs(net, q, (n) => ownProvince(n) || n === q, MAX_DEPTH);
    const near = idle.filter((u) => dist.has(u.pos) && u.pos !== q).sort((a, b) => dist.get(a.pos) - dist.get(b.pos) || (a.id < b.id ? -1 : 1));
    const D = enemyPower.get(q) ?? 0;
    const A = near.reduce((t, u) => t + u.power, 0);
    if (near.length && A >= ATTACK_RATIO * D) scored.push({ q, D, near, ratio: D === 0 ? Infinity : A / D });
  }
  scored.sort((a, b) => b.ratio - a.ratio || (a.q < b.q ? -1 : 1));
  let attacks = 0;
  for (const t of scored) {
    if (attacks >= MAX_ATTACKS) break;
    const near = t.near.filter((u) => idle.some((i) => i.id === u.id));
    if (!near.length) continue;
    const picked = [];
    let sum = 0;
    for (const u of near) { picked.push(u.id); sum += u.power; if (t.D === 0 ? true : sum >= ATTACK_RATIO * t.D) break; }
    if (t.D > 0 && sum < ATTACK_RATIO * t.D) continue;
    s = { ...s, theaters: createAssignment(s.theaters ?? { schema: 'theaters-v1', seq: 0, list: {} }, { nation, kind: 'attack', provinces: [t.q], units: picked, date: s.date, name: `Attacco IA ${nation}` }).state };
    take(picked);
    attacks += 1;
  }
  return s;
}

/** Sistema giornaliero (da mettere PRIMA del sistema di teatro). ctx come createTheaterSystem. Senza guerra non fa nulla. */
export function createAiWarSystem(ctx) {
  return (state) => {
    if (!state.war || Object.keys(state.war.pairs).length === 0) return state;
    if (state.day % PERIOD !== 0) return state;
    const net = ctx.getNet(state);
    if (!net) return state;
    let s = state;
    for (const n of nationsAtWar(state.war)) if (n !== state.player) s = planNation(s, n, ctx, net);
    return s;
  };
}
