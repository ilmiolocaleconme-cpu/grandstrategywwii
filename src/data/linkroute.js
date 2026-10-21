// Instradamento di un collegamento tra le sedi di due province confinanti: la linea deve restare dentro le due province
// (mai sul mare né sopra una terza provincia). Funzioni PURE: la funzione `provAt(lon, lat)` (indice della provincia nel
// punto, -1 sul mare) e i vertici del confine condiviso arrivano da fuori (scripts/build-links.js).
// Ordine dei tentativi: 1) linea retta; 2) un punto sul confine condiviso (due tratti dritti); 3) percorso a griglia sulla
// terra delle due province, poi "tirato" a tratti dritti; 4) nessun percorso via terra: tratta marittima (retta, segnata).

import { kmBetween } from './links.js';

const SAMPLE_KM = 4;

/** Vero se tutti i punti intermedi del segmento p→q stanno in una delle province `allowed` (Set di indici, o funzione indice → booleano). */
export function legInside(p, q, provAt, allowed) {
  const ok = typeof allowed === 'function' ? allowed : (v) => allowed.has(v);
  const km = kmBetween(p[0], p[1], q[0], q[1]);
  const n = Math.max(4, Math.ceil(km / SAMPLE_KM));
  for (let i = 1; i < n; i += 1) {
    const f = i / n;
    if (!ok(provAt(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f))) return false;
  }
  return true;
}

/** Lunghezza in km di una polilinea [[lon, lat], …]. */
export function polylineKm(c) {
  let s = 0;
  for (let i = 1; i < c.length; i += 1) s += kmBetween(c[i - 1][0], c[i - 1][1], c[i][0], c[i][1]);
  return s;
}

/** Toglie i punti inutili: da ogni punto va al più lontano raggiungibile in linea retta restando dentro le province. */
export function pullString(path, provAt, allowed) {
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !legInside(path[i], path[j], provAt, allowed)) j -= 1;
    out.push(path[j]);
    i = j;
  }
  return out;
}

/** Piccolo heap binario per l'A*: [priorità, valore]. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(p, v) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const q = (i - 1) >> 1; if (a[q][0] <= a[i][0]) break; [a[q], a[i]] = [a[i], a[q]]; i = q; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
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
 * Percorso a griglia (A*, 8 direzioni) sulla terra delle province `allowed`; null se non c'è. Con `thirdCost` (> 1) si può
 * passare anche sulle altre province, a costo moltiplicato. `bbox` = [x0, y0, x1, y1].
 */
export function gridRoute(a, b, provAt, allowed, bbox, { maxCells = 160, maxVisited = 60000, thirdCost = 0 } = {}) {
  const [x0, y0, x1, y1] = bbox;
  const cell = Math.max(0.01, Math.max(x1 - x0, y1 - y0) / maxCells);
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const ny = Math.ceil((y1 - y0) / cell) + 1;
  const cx = (i) => x0 + i * cell;
  const cy = (j) => y0 + j * cell;
  const cellOf = (p) => [Math.min(nx - 1, Math.max(0, Math.round((p[0] - x0) / cell))), Math.min(ny - 1, Math.max(0, Math.round((p[1] - y0) / cell)))];
  const [ai, aj] = cellOf(a); const [bi, bj] = cellOf(b);
  const memo = new Map();
  const passable = (i, j) => {
    const k = j * nx + i;
    let v = memo.get(k);
    if (v === undefined) {
      if ((i === ai && j === aj) || (i === bi && j === bj)) v = 1;
      else { const p = provAt(cx(i), cy(j)); v = allowed.has(p) ? 1 : thirdCost && p >= 0 ? thirdCost : 0; } // 0 = bloccato (mare o, senza thirdCost, altra provincia)
      memo.set(k, v);
    }
    return v;
  };
  const key = (i, j) => j * nx + i;
  const g = new Map([[key(ai, aj), 0]]);
  const from = new Map();
  const heap = new Heap();
  const h = (i, j) => kmBetween(cx(i), cy(j), b[0], b[1]);
  heap.push(h(ai, aj), [ai, aj]);
  let visited = 0;
  while (heap.size) {
    const [, [i, j]] = heap.pop();
    if (i === bi && j === bj) {
      const path = [[b[0], b[1]]];
      let k = key(i, j);
      while (from.has(k)) { k = from.get(k); const pj = Math.floor(k / nx); const pi = k - pj * nx; path.push([cx(pi), cy(pj)]); }
      path[path.length - 1] = [a[0], a[1]];
      return path.reverse();
    }
    visited += 1;
    if (visited > maxVisited) return null;
    const gi = g.get(key(i, j));
    for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) {
      if (!di && !dj) continue;
      const ni = i + di; const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const w = passable(ni, nj);
      if (!w) continue;
      if (di && dj && (!passable(i + di, j) || !passable(i, j + dj))) continue; // niente tagli d'angolo sul mare o su altre province
      const step = kmBetween(cx(i), cy(j), cx(ni), cy(nj)) * w;
      const gn = gi + step;
      const nk = key(ni, nj);
      if (gn < (g.get(nk) ?? Infinity)) { g.set(nk, gn); from.set(nk, key(i, j)); heap.push(gn + h(ni, nj), [ni, nj]); }
    }
  }
  return null;
}

/**
 * Tracciato di un collegamento: { coords, how } con how = 'straight' | 'bend' | 'grid' | 'third' (via terra ma sopra altre
 * province, quando le due non si raggiungono da sole: sponde di fiume, enclave) | 'sea'.
 * a, b = [lon, lat] delle sedi; pa, pb = indici delle province; border = vertici del confine condiviso ([[lon, lat], …]);
 * bbox = riquadro delle due province (per la griglia). `border` può essere una funzione (calcolata solo se serve).
 */
export function routeLink({ a, b, pa, pb, provAt, border = [], bbox, maxBend = 60 }) {
  const allowed = new Set([pa, pb]);
  if (legInside(a, b, provAt, allowed)) return { coords: [a, b], how: 'straight' };
  const cands = (typeof border === 'function' ? border() : border)
    .map((m) => ({ m, d: kmBetween(a[0], a[1], m[0], m[1]) + kmBetween(m[0], m[1], b[0], b[1]) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, maxBend);
  for (const { m } of cands) {
    if (legInside(a, m, provAt, allowed) && legInside(m, b, provAt, allowed)) return { coords: [a, m, b], how: 'bend' };
  }
  if (bbox) {
    const path = gridRoute(a, b, provAt, allowed, bbox);
    if (path) return { coords: pullString(path, provAt, allowed), how: 'grid' };
  }
  if (bbox) {
    const m = 0.3;
    const wide = [bbox[0] - m, bbox[1] - m, bbox[2] + m, bbox[3] + m];
    const path = gridRoute(a, b, provAt, allowed, wide, { thirdCost: 3 });
    if (path) return { coords: pullString(path, provAt, (v) => v >= 0), how: 'third' };
  }
  return { coords: [a, b], how: 'sea' };
}
