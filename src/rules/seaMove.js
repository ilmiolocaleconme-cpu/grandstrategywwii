// Movimento via mare tra porti PROPRI (12/11/2026, scelta B dell'utente per le exclave come la Prussia orientale). Funzioni PURE.
// Si usa SOLO quando non esiste una via di terra su territorio consentito (vedi issueMove): tratta di terra fino a un porto proprio,
// traversata (findSeaRoute fra i porti propri delle due coste, giorni già comprensivi della sosta nei due porti), tratta di terra fino alla meta.
// VERSIONE SEMPLIFICATA (base: ipotesi, da rivedere): nessuna capacità di trasporto, nessun costo, nessun rischio (sommergibili, blocchi, tempeste),
// nessuna nave reale impegnata; stretti controllati da altri e zone chiuse (ghiaccio artico) seguono findSeaRoute. Il porto è scelto dalla rotta di mare
// più rapida, non dal totale (come i rinforzi, vedi depotRoute). Un porto vale se ha livello ≥ 1 nello stato di partita (game/seaState.js).
import { findPath } from './movement.js';
import { findSeaRoute } from '../data/seaRoutes.js';

/** Distanze di terra (km) dalle province raggiungibili da `from` entrando solo dove `canEnter` (Dijkstra, ordine deterministico). */
export function landDistances(net, from, canEnter) {
  const dist = new Map([[from, 0]]); const done = new Set();
  for (;;) {
    let cur = null; let best = Infinity;
    for (const [m, d] of dist) if (!done.has(m) && (d < best || (d === best && m < cur))) { cur = m; best = d; }
    if (cur === null) return dist;
    done.add(cur);
    for (const n of net.neighbors(cur)) {
      if (done.has(n) || !canEnter(n)) continue;
      const nd = best + net.km(cur, n);
      if (!dist.has(n) || nd < dist.get(n)) dist.set(n, nd);
    }
  }
}

/**
 * Piano via mare da `from` a `to`. sea: { context (createSeaContext legato allo stato), motherOf(idProvincia) → madre, nation }.
 * Ritorna { path: [from, …, portoPartenza, portoArrivo, …, to], seaLeg: indice della tratta di mare in path, seaDays } oppure null
 * (nessun porto, nessuna rotta, o la meta è già raggiungibile per terra: in quel caso questa funzione non serve).
 */
export function seaPlan(net, from, to, canEnter, sea) {
  if (!sea?.context || from === to || !net.has(from) || !net.has(to) || !canEnter(to)) return null;
  const passable = (m) => m === from || m === to || canEnter(m);
  const fromLand = landDistances(net, from, passable);
  if (fromLand.has(to)) return null;
  const toLand = landDistances(net, to, passable);
  // TUTTI i porti propri (non uno per zona, come per il commercio): una exclave come la Prussia orientale ha il suo porto sulla stessa zona di mare di un'altra provincia.
  // Per zona e per lato si tiene il porto più vicino per terra (findSeaRoute lavora su un porto per zona).
  const ports = (sea.context.allPortsOf ?? sea.context.portsOf)(sea.nation).map((p) => ({ ...p, mother: sea.motherOf(p.province) }));
  const nearest = (list, land) => {
    const byZone = new Map();
    for (const p of list) {
      const cur = byZone.get(p.zone);
      if (!cur || land.get(p.mother) < land.get(cur.mother) || (land.get(p.mother) === land.get(cur.mother) && p.province < cur.province)) byZone.set(p.zone, p);
    }
    return [...byZone.values()];
  };
  const fromPorts = nearest(ports.filter((p) => fromLand.has(p.mother)), fromLand);
  const toPorts = nearest(ports.filter((p) => toLand.has(p.mother)), toLand);
  const graph = sea.context.graph;
  const route = findSeaRoute(graph, fromPorts, toPorts, { closedZones: new Set(graph.params.closedZones ?? []) });
  if (!route.ok) return null;
  const a = route.ports.from.mother; const b = route.ports.to.mother;
  if (a === b) return null; // stesso porto = stessa terra: non può succedere se from e to non sono collegati, difesa per non creare una tratta di mare nulla
  const head = findPath(net, from, a, passable);
  const tail = findPath(net, b, to, passable);
  if (!head || !tail) return null;
  return { path: [...head, ...tail], seaLeg: head.length - 1, seaDays: route.days };
}
