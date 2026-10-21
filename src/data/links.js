// Grafo dei collegamenti per il gioco (data/links.json): UN collegamento stradale e UNO ferroviario per ogni coppia
// di province confinanti, tra le «sedi» delle province (la città più popolosa), lungo il percorso migliore trovato
// sulla rete di strade/ferrovie (data/transport.json, da Natural Earth). Funzioni PURE, senza I/O.
//
// Perché: la rete di Natural Earth è cartografica (linee parallele, nessuna topologia). Qui ogni tratto usato appartiene
// a UN solo segmento (nessuna sovrapposizione) e un ponte è un tratto del segmento stesso, con la sua geometria:
// strada e ponte sono la stessa linea. Tutto è `quality: hypothesis`: rete moderna, sedi da popolazione moderna.

import { lineLengthKm } from './rivers.js';

export const LINKS_SCHEMA = 'links-v1';
export const MODES = Object.freeze(['road', 'rail']);

/** Moltiplicatore di costo per livello: i livelli alti sono preferiti nella ricerca del percorso. */
export const LEVEL_COST = Object.freeze({
  road: { 1: 2, 2: 1.25, 3: 1 },
  rail: { 2: 1.5, 3: 1 },
});

/** Semilunghezza in km del tratto-ponte per classe di larghezza del fiume. */
export const BRIDGE_HALF_KM = Object.freeze({ small: 1.2, medium: 2, large: 3 });

const toRad = Math.PI / 180;

export function kmBetween(lon0, lat0, lon1, lat1) {
  const kx = 111.32 * Math.cos(((lat0 + lat1) / 2) * toRad);
  return Math.hypot((lon0 - lon1) * kx, (lat0 - lat1) * 110.57);
}

/**
 * Rete di una modalità: nodi (vertici agganciati a una griglia di `snapDeg`) e archi non orientati.
 * `lines` = righe di transport.json ({k, level, rank, n?, y?, c:[lon,lat,...]}); si usano solo quelle di `mode`.
 * Archi duplicati (stesso paio di nodi) si fondono tenendo livello più alto e rango più basso.
 */
export function buildNetwork(lines, mode, snapDeg = 0.004) {
  const ids = new Map();
  const lon = [];
  const lat = [];
  const node = (x, y) => {
    const key = `${Math.round(x / snapDeg)}|${Math.round(y / snapDeg)}`;
    let id = ids.get(key);
    if (id === undefined) { id = lon.length; ids.set(key, id); lon.push(x); lat.push(y); }
    return id;
  };
  const edges = []; // { a, b, km, level, rank, n, y }
  const seen = new Map();
  for (const l of lines) {
    if (l.k !== mode) continue;
    let prev = null;
    for (let i = 0; i < l.c.length; i += 2) {
      const cur = node(l.c[i], l.c[i + 1]);
      if (prev !== null && prev !== cur) {
        const key = prev < cur ? `${prev}|${cur}` : `${cur}|${prev}`;
        const old = seen.get(key);
        if (old === undefined) {
          seen.set(key, edges.length);
          edges.push({ a: prev, b: cur, km: kmBetween(lon[prev], lat[prev], lon[cur], lat[cur]), level: l.level, rank: l.rank ?? 99, n: l.n, y: l.y });
        } else {
          const e = edges[old];
          if (l.level > e.level) { e.level = l.level; e.n = l.n; e.y = l.y; }
          if ((l.rank ?? 99) < e.rank) e.rank = l.rank ?? 99;
        }
      }
      prev = cur;
    }
  }
  const adj = lon.map(() => []);
  edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  return { mode, lon, lat, edges, adj, size: lon.length };
}

// Heap binario minimo su coppie [costo, nodo].
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(c, v) {
    const a = this.a;
    a.push([c, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/**
 * Percorso di costo minimo da `src` a `dst` passando solo per nodi con `allowed(nodo)` vero.
 * Ritorna { nodes:[...], edges:[indici d'arco in ordine], km, cost } oppure null. Costo = km × LEVEL_COST[mode][livello].
 */
export function shortestPath(net, src, dst, allowed) {
  if (src === dst) return { nodes: [src], edges: [], km: 0, cost: 0 };
  const cost = LEVEL_COST[net.mode];
  const dist = new Map([[src, 0]]);
  const from = new Map(); // nodo -> arco usato per arrivarci
  const done = new Set();
  const heap = new Heap();
  heap.push(0, src);
  while (heap.size > 0) {
    const [d, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === dst) break;
    for (const ei of net.adj[u]) {
      const e = net.edges[ei];
      const v = e.a === u ? e.b : e.a;
      if (done.has(v) || !allowed(v)) continue;
      const nd = d + e.km * (cost[e.level] ?? 2);
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); from.set(v, ei); heap.push(nd, v); }
    }
  }
  if (!done.has(dst)) return null;
  const nodes = [dst];
  const edges = [];
  let km = 0;
  for (let u = dst; u !== src;) {
    const ei = from.get(u);
    const e = net.edges[ei];
    edges.push(ei);
    km += e.km;
    u = e.a === u ? e.b : e.a;
    nodes.push(u);
  }
  nodes.reverse(); edges.reverse();
  return { nodes, edges, km, cost: dist.get(dst) };
}

/**
 * Catene: gli archi usati (insieme di indici) si raggruppano in catene di nodi di grado 2, spezzate ai nodi di
 * grado ≠ 2, ai nodi `breaks` (sedi) e dove cambiano livello o nome. Ogni arco sta in UNA sola catena.
 * Ritorna [{ nodes:[...], level, rank, n?, y? }] e la mappa arco -> indice di catena.
 */
export function buildChains(net, usedEdges, breaks = new Set()) {
  const used = new Set(usedEdges);
  const deg = new Map();
  const at = new Map();
  for (const ei of used) {
    const e = net.edges[ei];
    for (const u of [e.a, e.b]) { deg.set(u, (deg.get(u) ?? 0) + 1); if (!at.has(u)) at.set(u, []); at.get(u).push(ei); }
  }
  const same = (x, y) => x.level === y.level && x.n === y.n;
  const isBreak = (u, e1, e2) => deg.get(u) !== 2 || breaks.has(u) || (e1 !== undefined && e2 !== undefined && !same(net.edges[e1], net.edges[e2]));
  const visited = new Set();
  const chains = [];
  const edgeChain = new Map();
  const walk = (start, firstEdge) => {
    const nodes = [start];
    const es = [];
    let u = start;
    let ei = firstEdge;
    for (;;) {
      visited.add(ei);
      es.push(ei);
      const e = net.edges[ei];
      u = e.a === u ? e.b : e.a;
      nodes.push(u);
      const next = (at.get(u) ?? []).filter((x) => x !== ei);
      if (next.length !== 1 || isBreak(u, ei, next[0]) || visited.has(next[0])) break;
      ei = next[0];
    }
    const first = net.edges[es[0]];
    const chain = { nodes, level: first.level, rank: Math.min(...es.map((x) => net.edges[x].rank)), n: first.n, y: first.y };
    es.forEach((x) => edgeChain.set(x, chains.length));
    chains.push(chain);
  };
  const startNodes = [...at.keys()].filter((u) => deg.get(u) !== 2 || breaks.has(u)).sort((p, q) => p - q);
  for (const u of startNodes) for (const ei of at.get(u)) if (!visited.has(ei)) walk(u, ei);
  for (const ei of [...used].sort((p, q) => p - q)) if (!visited.has(ei)) walk(net.edges[ei].a, ei); // anelli senza nodi di rottura
  return { chains, edgeChain };
}

/** Lunghezze cumulate in km lungo una polilinea [[lon,lat],...]. */
export function cumulativeKm(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i += 1) cum.push(cum[i - 1] + kmBetween(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
  return cum;
}

function pointAt(coords, cum, s) {
  const total = cum[cum.length - 1];
  const t = Math.min(Math.max(s, 0), total);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i += 1;
  const span = cum[i] - cum[i - 1] || 1;
  const f = (t - cum[i - 1]) / span;
  return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f, i];
}

/** Tratto della polilinea tra le distanze s0 e s1 (km dall'inizio): punti interpolati agli estremi, vertici in mezzo. */
export function sliceByDistance(coords, cum, s0, s1) {
  const [x0, y0, i0] = pointAt(coords, cum, s0);
  const [x1, y1, i1] = pointAt(coords, cum, s1);
  const out = [[x0, y0]];
  for (let i = i0; i < i1; i += 1) if (cum[i] > s0 && cum[i] < s1) out.push(coords[i]);
  out.push([x1, y1]);
  return out;
}

/**
 * Incroci di una polilinea con i fiumi, con la distanza `s` (km) dall'inizio: [{ riverId, s, lon, lat }] in ordine.
 * `grid` = buildRiverSegmentGrid, `intersect` = segmentIntersection (passati per tenere il modulo senza dipendenze circolari).
 * Incroci dello stesso fiume entro `thinKm` sono UN solo ponte (meandri).
 */
export function crossingsAlong(coords, cum, grid, intersect, cell, thinKm = 4) {
  const found = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a1 = coords[i]; const a2 = coords[i + 1];
    const x0 = Math.floor(Math.min(a1[0], a2[0]) / cell); const x1 = Math.floor(Math.max(a1[0], a2[0]) / cell);
    const y0 = Math.floor(Math.min(a1[1], a2[1]) / cell); const y1 = Math.floor(Math.max(a1[1], a2[1]) / cell);
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) {
      for (const seg of grid.get(`${x}|${y}`) ?? []) {
        const p = intersect(a1, a2, seg.a, seg.b);
        if (!p) continue;
        const s = cum[i] + kmBetween(a1[0], a1[1], p.x, p.y);
        found.push({ riverId: seg.riverId, s, lon: p.x, lat: p.y });
      }
    }
  }
  found.sort((p, q) => p.s - q.s);
  const out = [];
  for (const f of found) if (!out.some((o) => o.riverId === f.riverId && Math.abs(o.s - f.s) < thinKm)) out.push(f);
  return out;
}

/** Direzione non orientata (0..179°) di un tratto nello spazio lon/lat (come headingDeg di transport.js). */
export function heading(a, b) {
  const d = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return Math.round(((d % 180) + 180) % 180) % 180;
}

export { lineLengthKm };

/** Controlli sul file. `provinceIds` = elenco ordinato degli id, `riverIds` = Set. Ritorna la lista degli errori. */
export function validateLinks(file, { provinceIds, riverIds } = {}) {
  const errors = [];
  if (file?.schema !== LINKS_SCHEMA) errors.push(`schema atteso ${LINKS_SCHEMA}`);
  if (file?.quality !== 'hypothesis') errors.push('intestazione: qualità attesa "hypothesis"');
  const nP = provinceIds?.length ?? Infinity;
  const segIds = new Set();
  for (const s of file?.segments ?? []) {
    if (segIds.has(s.id)) errors.push(`${s.id}: id segmento duplicato`);
    segIds.add(s.id);
    if (!MODES.includes(s.k)) errors.push(`${s.id}: modalità non valida`);
    if (!(s.c?.length >= 4) || s.c.length % 2 !== 0) errors.push(`${s.id}: coordinate non valide`);
    if (s.br && riverIds && !riverIds.has(s.br.r)) errors.push(`${s.id}: ponte su fiume sconosciuto ${s.br.r}`);
  }
  const seats = new Set();
  for (const n of file?.nodes ?? []) {
    if (!Number.isInteger(n.p) || n.p < 0 || n.p >= nP) errors.push(`sede: indice di provincia non valido ${n.p}`);
    if (seats.has(n.p)) errors.push(`sede duplicata per la provincia ${n.p}`);
    seats.add(n.p);
  }
  const linkIds = new Set();
  for (const l of file?.links ?? []) {
    if (linkIds.has(l.id)) errors.push(`${l.id}: id collegamento duplicato`);
    linkIds.add(l.id);
    if (!MODES.includes(l.mode)) errors.push(`${l.id}: modalità non valida`);
    if (!(l.a < l.b) || l.a < 0 || l.b >= nP) errors.push(`${l.id}: province non valide`);
    if (!seats.has(l.a) || !seats.has(l.b)) errors.push(`${l.id}: manca la sede di una provincia`);
    if (!(l.km > 0)) errors.push(`${l.id}: km non validi`);
    for (const s of l.segs ?? []) if (!segIds.has(s)) errors.push(`${l.id}: segmento sconosciuto ${s}`);
  }
  const brIds = new Set();
  for (const b of file?.bridges ?? []) {
    if (brIds.has(b.id)) errors.push(`${b.id}: id ponte duplicato`);
    brIds.add(b.id);
    if (!segIds.has(b.seg)) errors.push(`${b.id}: segmento sconosciuto ${b.seg}`);
    if (![1, 2, 3].includes(b.level)) errors.push(`${b.id}: livello non valido`);
    if (!Number.isInteger(b.ang) || b.ang < 0 || b.ang > 179) errors.push(`${b.id}: direzione non valida`);
    if (riverIds && !riverIds.has(b.riverId)) errors.push(`${b.id}: fiume sconosciuto ${b.riverId}`);
  }
  if (file?.counts && (file.counts.links !== file.links?.length || file.counts.segments !== file.segments?.length || file.counts.bridges !== file.bridges?.length)) errors.push('intestazione: conteggi diversi dal contenuto');
  return errors;
}
