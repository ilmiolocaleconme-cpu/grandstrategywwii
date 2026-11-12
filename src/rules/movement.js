// Movimento delle unità di terra tra province madri. Funzioni PURE (nessun I/O, nessun caso): stesso stato, stesso risultato.
//
// MODELLO (semplice e dichiarato): l'unità si sposta di provincia in provincia lungo il grafo di adiacenza; ogni passo dura
// ceil(distanza_tra_i_centri / velocità_di_marcia) giorni; durante il passo l'unità resta nella provincia di partenza e compare
// in quella d'arrivo solo alla fine. Una nuova destinazione sostituisce l'ordine in corso (il passo già iniziato si perde).
// SCELTE PROVVISORIE (base: ipotesi, da rivedere col modello logistico):
//  - MARCH_KM_PER_DAY: velocità di marcia per categoria, valori di partenza di bilanciamento, NON dati storici;
//  - la distanza è tra i centri dei riquadri delle province (approssimazione);
//  - si entra solo in province della propria nazione (nessuna guerra, diplomazia o accesso modellati: vedi `canEnter`).
// MARE (12/11/2026, src/rules/seaMove.js): se non c'è una via di terra e il chiamante passa `sea`, l'ordine include UNA tratta di mare tra porti propri (order.seaLegs: indice tratta → giorni fissi).
// NON MODELLATI: fiumi e attraversamenti (ponti, guadi), terreno, stagione, rifornimenti, combattimento, ferrovia; per il mare capacità, costi e rischi.

import { seaPlan } from './seaMove.js';

export const MOVEMENT_SCHEMA = 'movement-v1';
export const MARCH_KM_PER_DAY = Object.freeze({ infantry: 20, mountain: 15, airborne: 20, cavalry: 35, motorized: 50, mechanized: 40, armored: 35, command: 20 });
export const DEFAULT_MARCH = 20;

export function createMovementState() {
  return { schema: MOVEMENT_SCHEMA, positions: {}, orders: {} };
}

export function marchSpeed(category) {
  return MARCH_KM_PER_DAY[category] ?? DEFAULT_MARCH;
}

/** Giorni per un passo di `km` chilometri (almeno 1). */
export function hopDays(km, category) {
  if (!(km >= 0)) throw new RangeError('hopDays: km non valido');
  return Math.max(1, Math.ceil(km / marchSpeed(category)));
}

/** Provincia in cui si trova l'unità: posizione di partita, altrimenti dislocazione iniziale (Map unità → provincia), altrimenti null. */
export function positionOf(movement, initial, unitId) {
  return movement?.positions?.[unitId] ?? initial.get(unitId) ?? null;
}

/**
 * Percorso più corto (meno passi, a parità meno km) da `from` a `to` entrando solo dove `canEnter(id)`.
 * net: { neighbors(id) → ids, km(a, b) }. Ritorna [from, ..., to] oppure null.
 */
export function findPath(net, from, to, canEnter) {
  if (from === to) return [from];
  if (!canEnter(to)) return null;
  const dist = new Map([[from, 0]]);
  const hops = new Map([[from, 0]]);
  const prev = new Map();
  const queue = [from];
  const better = (id, h, d) => !hops.has(id) || h < hops.get(id) || (h === hops.get(id) && d < dist.get(id));
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i];
    for (const n of net.neighbors(cur)) {
      if (!canEnter(n)) continue;
      const h = hops.get(cur) + 1;
      const d = dist.get(cur) + net.km(cur, n);
      if (better(n, h, d)) {
        const isNew = !hops.has(n);
        hops.set(n, h); dist.set(n, d); prev.set(n, cur);
        if (isNew) queue.push(n);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}

/**
 * Dà l'ordine di muoversi. unit: { id, category }. initial: Map unità → provincia. net/canEnter come findPath.
 * Ritorna { ok, movement, path, days, reason }; reason: 'unknown_position' | 'same_province' | 'no_route'.
 */
export function issueMove(movement, unit, to, { initial, net, canEnter, sea = null }) {
  const from = positionOf(movement, initial, unit.id);
  if (!from) return { ok: false, movement, reason: 'unknown_position' };
  if (from === to) return { ok: false, movement, reason: 'same_province' };
  let path = findPath(net, from, to, canEnter);
  let seaLegs = null;
  if (!path && sea) { // nessuna via di terra: tratta di mare tra porti propri (exclave, isole)
    const plan = seaPlan(net, from, to, canEnter, sea);
    if (plan) { path = plan.path; seaLegs = { [plan.seaLeg]: plan.seaDays }; }
  }
  if (!path) return { ok: false, movement, reason: 'no_route' };
  const legDays = (i, a, b) => seaLegs?.[i] ?? hopDays(net.km(a, b), unit.category);
  const days = path.slice(1).reduce((s, id, i) => s + legDays(i, path[i], id), 0);
  const order = { path, leg: 0, daysLeft: legDays(0, path[0], path[1]), category: unit.category, totalDays: days, ...(seaLegs ? { seaLegs } : {}) };
  return { ok: true, movement: { ...movement, orders: { ...movement.orders, [unit.id]: order } }, path, days, ...(seaLegs ? { seaLegs } : {}) };
}

/** Annulla l'ordine: l'unità resta dove si trova. */
export function cancelMove(movement, unitId) {
  if (!movement.orders[unitId]) return movement;
  const { [unitId]: _gone, ...rest } = movement.orders;
  return { ...movement, orders: rest };
}

/** Un giorno di marcia. `kmBetween(a, b)` per i passi successivi al primo. */
export function tickMovement(movement, kmBetween) {
  const ids = Object.keys(movement.orders);
  if (ids.length === 0) return movement;
  const positions = { ...movement.positions };
  const orders = {};
  for (const id of ids.sort()) {
    const o = movement.orders[id];
    const daysLeft = o.daysLeft - 1;
    if (daysLeft > 0) { orders[id] = { ...o, daysLeft }; continue; }
    const leg = o.leg + 1;
    positions[id] = o.path[leg];
    if (leg < o.path.length - 1) {
      orders[id] = { ...o, leg, daysLeft: o.seaLegs?.[leg] ?? hopDays(kmBetween(o.path[leg], o.path[leg + 1]), o.category) };
    }
  }
  return { ...movement, positions, orders };
}

/** Errori di forma (lista vuota = valido). */
export function validateMovement(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return ['movimento: non è un oggetto'];
  const errors = [];
  if (m.schema !== MOVEMENT_SCHEMA) errors.push(`movimento: schema ${JSON.stringify(m.schema)}`);
  if (m.positions === null || typeof m.positions !== 'object') errors.push('movimento: positions mancante');
  else for (const [k, v] of Object.entries(m.positions)) if (typeof v !== 'string' || v === '') errors.push(`movimento: posizione di ${k} non valida`);
  if (m.orders === null || typeof m.orders !== 'object') return [...errors, 'movimento: orders mancante'];
  for (const [k, o] of Object.entries(m.orders)) {
    if (!Array.isArray(o?.path) || o.path.length < 2 || !o.path.every((p) => typeof p === 'string')) errors.push(`movimento: percorso di ${k} non valido`);
    else if (!Number.isInteger(o.leg) || o.leg < 0 || o.leg >= o.path.length - 1) errors.push(`movimento: tratta di ${k} fuori percorso`);
    if (!Number.isInteger(o?.daysLeft) || o.daysLeft < 1) errors.push(`movimento: giorni di ${k} non validi`);
    if (o?.seaLegs !== undefined) { // tratte di mare (opzionale): indice di tratta → giorni interi ≥ 1
      const legs = o.seaLegs;
      if (legs === null || typeof legs !== 'object' || Array.isArray(legs)) errors.push(`movimento: tratte di mare di ${k} non valide`);
      else for (const [i, d] of Object.entries(legs)) if (!Number.isInteger(Number(i)) || Number(i) < 0 || Number(i) >= (o.path?.length ?? 0) - 1 || !Number.isInteger(d) || d < 1) errors.push(`movimento: tratta di mare ${i} di ${k} non valida`);
    }
  }
  return errors;
}
