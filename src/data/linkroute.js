// Instradamento di un collegamento tra le sedi di due province confinanti: la linea deve restare dentro le due province
// (mai sul mare né sopra una terza provincia). Funzioni PURE: la funzione `provAt(lon, lat)` (indice della provincia nel
// punto, -1 sul mare) e i vertici del confine condiviso arrivano da fuori (scripts/build-links.js).
// Ordine dei tentativi: 1) linea retta; 2) un punto sul confine condiviso (due tratti dritti); 3) percorso a griglia sulla
// terra delle due province, poi "tirato" a tratti dritti; 4) nessun percorso via terra: tratta marittima (retta, segnata).
// Lungo le coste: i primi tentativi chiedono un MARGINE dal mare (COAST_MARGIN_KM) e la griglia paga di più le celle
// sul bordo del mare, così le strade restano dentro terra quando possono; poi gli angoli si arrotondano (smoothPath).

import { kmBetween } from './links.js';

const SAMPLE_KM = 4;
const toRad = Math.PI / 180;

/** Margine dal mare chiesto ai tracciati (km) e tratto vicino alle sedi in cui non si pretende (le città possono stare sulla costa). */
export const COAST_MARGIN_KM = 1.5;
const MARGIN_EXEMPT_KM = 8;

/**
 * Vero se tutti i punti intermedi del segmento p→q stanno in una delle province `allowed` (Set di indici, o funzione indice → booleano).
 * Con `margin` (km) anche i punti spostati di ± margin di traverso devono essere su terra (in una provincia qualsiasi): la linea non
 * costeggia il mare; gli ultimi MARGIN_EXEMPT_KM vicino agli estremi sono esenti (le sedi possono stare sulla costa).
 */
export function legInside(p, q, provAt, allowed, margin = 0) {
  const ok = typeof allowed === 'function' ? allowed : (v) => allowed.has(v);
  const km = kmBetween(p[0], p[1], q[0], q[1]);
  const n = Math.max(4, Math.ceil(km / SAMPLE_KM));
  let ox = 0; let oy = 0;
  if (margin > 0) { // normale al segmento, in gradi, lunga `margin` km
    const kx = 111.32 * Math.cos(((p[1] + q[1]) / 2) * toRad);
    const tx = (q[0] - p[0]) * kx; const ty = (q[1] - p[1]) * 110.57;
    const len = Math.hypot(tx, ty) || 1;
    ox = (-ty / len) * margin / kx; oy = (tx / len) * margin / 110.57;
  }
  for (let i = 1; i < n; i += 1) {
    const f = i / n;
    const x = p[0] + (q[0] - p[0]) * f; const y = p[1] + (q[1] - p[1]) * f;
    if (!ok(provAt(x, y))) return false;
    if (margin > 0 && km * f > MARGIN_EXEMPT_KM && km * (1 - f) > MARGIN_EXEMPT_KM && (provAt(x + ox, y + oy) < 0 || provAt(x - ox, y - oy) < 0)) return false;
  }
  return true;
}

/** Lunghezza in km di una polilinea [[lon, lat], …]. */
export function polylineKm(c) {
  let s = 0;
  for (let i = 1; i < c.length; i += 1) s += kmBetween(c[i - 1][0], c[i - 1][1], c[i][0], c[i][1]);
  return s;
}

/**
 * Toglie i punti inutili: da ogni punto va al più lontano raggiungibile in linea retta restando dentro le province. Con `margin`
 * preferisce i tratti che stanno lontani dal mare; se nessuno lo fa, ripiega su quelli che almeno restano su terra.
 */
export function pullString(path, provAt, allowed, margin = 0) {
  const out = [path[0]];
  let i = 0;
  const last = path.length - 1;
  while (i < last) {
    let j = last;
    while (j > i + 1 && !legInside(path[i], path[j], provAt, allowed, margin)) j -= 1;
    if (margin > 0 && j === i + 1) { j = last; while (j > i + 1 && !legInside(path[i], path[j], provAt, allowed)) j -= 1; }
    out.push(path[j]);
    i = j;
  }
  return out;
}

const CORNER_RATIOS = [0.45, 0.3, 0.18, 0.1, 0.05];

/**
 * Arrotonda ogni angolo con una curva (arco quadratico campionato) tenendo fermi gli estremi. Ogni angolo prova prima il taglio
 * più largo (fino a 0,45 dei due lati) e poi tagli sempre più stretti: si tiene il primo che resta dentro `allowed` (e su terra);
 * se nessuno va, l'angolo resta com'è. I tratti prima e dopo la curva sono pezzi dei lati originali, quindi sempre validi.
 */
export function smoothPath(coords, provAt, allowed, { samples = 3, maxPoints = 64 } = {}) {
  if (coords.length < 3) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length - 1; i += 1) {
    const v = coords[i]; const p = coords[i - 1]; const n = coords[i + 1];
    let curve = null;
    for (const r of CORNER_RATIOS) {
      const A = [v[0] + (p[0] - v[0]) * r, v[1] + (p[1] - v[1]) * r];
      const B = [v[0] + (n[0] - v[0]) * r, v[1] + (n[1] - v[1]) * r];
      const pts = [];
      for (let k = 0; k <= samples; k += 1) {
        const t = k / samples; const u = 1 - t;
        pts.push([u * u * A[0] + 2 * u * t * v[0] + t * t * B[0], u * u * A[1] + 2 * u * t * v[1] + t * t * B[1]]);
      }
      let fine = true;
      for (let k = 0; k < pts.length - 1 && fine; k += 1) fine = legInside(pts[k], pts[k + 1], provAt, allowed);
      if (fine) { curve = pts; break; }
    }
    if (curve && out.length + curve.length + (coords.length - 1 - i) <= maxPoints) out.push(...curve); else out.push(v);
  }
  out.push(coords[coords.length - 1]);
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
 * passare anche sulle altre province, a costo moltiplicato. Con `coastCost` (> 1) le celle accanto al mare costano di più:
 * il percorso si tiene dentro terra quando può. `bbox` = [x0, y0, x1, y1].
 */
export function gridRoute(a, b, provAt, allowed, bbox, { maxCells = 160, maxVisited = 60000, thirdCost = 0, coastCost = 0 } = {}) {
  const [x0, y0, x1, y1] = bbox;
  const cell = Math.max(0.01, Math.max(x1 - x0, y1 - y0) / maxCells);
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const ny = Math.ceil((y1 - y0) / cell) + 1;
  const cx = (i) => x0 + i * cell;
  const cy = (j) => y0 + j * cell;
  const cellOf = (p) => [Math.min(nx - 1, Math.max(0, Math.round((p[0] - x0) / cell))), Math.min(ny - 1, Math.max(0, Math.round((p[1] - y0) / cell)))];
  const [ai, aj] = cellOf(a); const [bi, bj] = cellOf(b);
  const rawMemo = new Map(); // provincia nella cella (indice, -1 = mare)
  const at = (i, j) => {
    const k = j * nx + i;
    let v = rawMemo.get(k);
    if (v === undefined) { v = provAt(cx(i), cy(j)); rawMemo.set(k, v); }
    return v;
  };
  const nearSea = (i, j) => (i > 0 && at(i - 1, j) < 0) || (i < nx - 1 && at(i + 1, j) < 0) || (j > 0 && at(i, j - 1) < 0) || (j < ny - 1 && at(i, j + 1) < 0);
  const memo = new Map();
  const passable = (i, j) => {
    const k = j * nx + i;
    let v = memo.get(k);
    if (v === undefined) {
      if ((i === ai && j === aj) || (i === bi && j === bj)) v = 1;
      else {
        const p = at(i, j);
        v = allowed.has(p) ? 1 : thirdCost && p >= 0 ? thirdCost : 0; // 0 = bloccato (mare o, senza thirdCost, altra provincia)
        if (v && coastCost > 1 && nearSea(i, j)) v *= coastCost;
      }
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

/** Retta o un punto sul confine condiviso (`cands` = candidati già ordinati), con il margine dal mare indicato; null se non si riesce. */
function straightOrBend(a, b, provAt, allowed, cands, margin) {
  if (legInside(a, b, provAt, allowed, margin)) return { coords: [a, b], how: 'straight' };
  for (const { m } of cands()) {
    if (legInside(a, m, provAt, allowed, margin) && legInside(m, b, provAt, allowed, margin)) return { coords: [a, m, b], how: 'bend' };
  }
  return null;
}

/**
 * Tracciato di un collegamento: { coords, how } con how = 'straight' | 'bend' | 'grid' | 'third' (via terra ma sopra altre
 * province, quando le due non si raggiungono da sole: sponde di fiume, enclave) | 'sea'.
 * a, b = [lon, lat] delle sedi; pa, pb = indici delle province; border = vertici del confine condiviso ([[lon, lat], …]);
 * bbox = riquadro delle due province (per la griglia). `border` può essere una funzione (calcolata solo se serve).
 * Prima si cerca un tracciato che stia lontano dal mare (COAST_MARGIN_KM); se non c'è, o è un giro troppo lungo, quello di
 * prima (anche rasente la costa). Alla fine gli angoli si arrotondano (smoothPath).
 */
export function routeLink({ a, b, pa, pb, provAt, border = [], bbox, maxBend = 60 }) {
  const allowed = new Set([pa, pb]);
  let memo = null;
  const cands = () => memo ?? (memo = (typeof border === 'function' ? border() : border)
    .map((m) => ({ m, d: kmBetween(a[0], a[1], m[0], m[1]) + kmBetween(m[0], m[1], b[0], b[1]) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, maxBend));
  const direct = kmBetween(a[0], a[1], b[0], b[1]);
  const smooth = (r, ok = allowed) => (r.coords.length >= 3 ? { ...r, coords: smoothPath(r.coords, provAt, ok) } : r);

  // 1) lontano dal mare
  let r = straightOrBend(a, b, provAt, allowed, cands, COAST_MARGIN_KM);
  if (r) return smooth(r);
  if (bbox) {
    const path = gridRoute(a, b, provAt, allowed, bbox, { coastCost: 4 });
    if (path) {
      const c = pullString(path, provAt, allowed, COAST_MARGIN_KM);
      if (polylineKm(c) <= 1.5 * direct + 6) return smooth({ coords: c, how: 'grid' });
    }
  }
  // 2) come prima: anche rasente la costa
  r = straightOrBend(a, b, provAt, allowed, cands, 0);
  if (r) return smooth(r);
  if (bbox) {
    const path = gridRoute(a, b, provAt, allowed, bbox);
    if (path) return smooth({ coords: pullString(path, provAt, allowed), how: 'grid' });
  }
  if (bbox) {
    const m = 0.3;
    const wide = [bbox[0] - m, bbox[1] - m, bbox[2] + m, bbox[3] + m];
    const path = gridRoute(a, b, provAt, allowed, wide, { thirdCost: 3, coastCost: 2 });
    const onLand = (v) => v >= 0;
    if (path) return smooth({ coords: pullString(path, provAt, onLand), how: 'third' }, onLand);
  }
  return { coords: [a, b], how: 'sea' };
}
