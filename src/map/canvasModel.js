// Modello della mappa per il renderer Canvas 2D (prototipo): geometrie in array tipizzati (nessuna stringa SVG),
// bordi nazionali, versioni semplificate, ricerca della provincia sotto un punto e del fiume vicino a un punto.
// Funzioni pure, senza React né DOM: testate in tests/canvas.test.js. I dati sono gli stessi di MapView
// (data/provinces, rivers_geo, lakes): niente copie. L'interfaccia degli elementi (id, props, areaKm2, bbox, feature)
// è quella usata da pickLabels e dal pannello, quindi i nomi e il pannello restano gli stessi.

import { WORLD_W, polygonsOf, featureAreaKm2, boundsOf } from './geo.js';

const COS0 = WORLD_W / 360;
const SEAM_X = Math.fround(180 * COS0); // ascissa (float32) del meridiano +-180

// Tolleranze delle versioni semplificate, in unità di mappa (le stesse di LOD_TOLERANCES in geo.js).
export const CANVAS_LOD_TOLS = [0.06, 0.02, 0.005];

/** Arco sulla cucitura dell'antimeridiano (entrambi gli estremi su +180 o su -180), su coordinate proiettate float32. */
const isSeamX = (ax, bx) => ax === bx && Math.abs(ax) === SEAM_X;

/**
 * Modello dalle province unite. `coords`: x,y proiettate (float32, intercalate) di tutti i vertici; gli anelli sono
 * consecutivi (`ringOffsets[r]`..`ringOffsets[r+1]`); ogni elemento ha l'intervallo di anelli `ringStart`..`ringEnd`.
 * Costruzione volutamente leggera (è sul percorso della prima schermata): l'area (`areaKm2`) si calcola solo alla prima
 * lettura e i legami tra vertici dei bordi (buildBorders) si costruiscono dopo la prima schermata.
 */
const modelCache = new WeakMap();
export function buildCanvasModel(collection) {
  // App (pannello) e mappa chiedono lo stesso modello: si costruisce una volta sola per collezione
  if (!modelCache.has(collection)) modelCache.set(collection, buildCanvasModelUncached(collection));
  return modelCache.get(collection);
}

function buildCanvasModelUncached(collection) {
  const feats = collection.features;
  let nVert = 0;
  let nRing = 0;
  for (const f of feats) for (const poly of polygonsOf(f)) for (const ring of poly) { nRing += 1; nVert += ring.length; }
  const coords = new Float32Array(nVert * 2);
  const ringOffsets = new Uint32Array(nRing + 1);
  const items = [];
  let v = 0;
  let r = 0;
  for (let fi = 0; fi < feats.length; fi += 1) {
    const f = feats[fi];
    const ringStart = r;
    let hasSeam = false;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const poly of polygonsOf(f)) {
      for (let k = 0; k < poly.length; k += 1) {
        const ring = poly[k];
        ringOffsets[r] = v;
        r += 1;
        for (let i = 0; i < ring.length; i += 1) {
          const lon = ring[i][0];
          const x = lon * COS0;
          const y = -ring[i][1];
          coords[2 * v] = x;
          coords[2 * v + 1] = y;
          v += 1;
          if (k === 0) { // il riquadro conta solo l'anello esterno di ogni poligono, come boundsOf
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
          if (!hasSeam && i + 1 < ring.length && Math.abs(lon) === 180 && lon === ring[i + 1][0]) hasSeam = true;
        }
      }
    }
    const item = {
      id: f.properties.id,
      props: f.properties,
      bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      feature: f,
      index: fi,
      ringStart,
      ringEnd: r,
      hasSeam,
    };
    let area = null;
    Object.defineProperty(item, 'areaKm2', { enumerable: true, configurable: true, get() { if (area === null) area = featureAreaKm2(f); return area; } });
    items.push(item);
  }
  ringOffsets[r] = v;
  return { items, coords, ringOffsets, bounds: boundsOf(feats), byId: new Map(items.map((i) => [i.id, i])) };
}

// --- bordi nazionali ----------------------------------------------------------------------------------
// Stessa regola di nationalBorderRuns (geo.js): tutti gli archi tranne quelli condivisi esattamente da due province
// dello stesso proprietario (le due metà sulla cucitura contano come condivise anche se della stessa provincia).
// Qui gli archi si riconoscono con chiavi numeriche invece di stringhe: molto più veloce all'avvio.
export function buildBorders(model) {
  const { items, coords, ringOffsets } = model;
  const nVert = ringOffsets[ringOffsets.length - 1];
  // identificatore del vertice: stesso punto (stesse coordinate float32) = stesso id; +180 e -180 sono lo stesso meridiano
  const vid = new Int32Array(nVert);
  const vmap = new Map();
  for (let i = 0; i < nVert; i += 1) {
    let x = coords[2 * i];
    if (x === -SEAM_X) x = SEAM_X;
    const key = (Math.round(x * 1e5) + 13000000) * 20000000 + (Math.round(coords[2 * i + 1] * 1e5) + 10000000);
    let id = vmap.get(key);
    if (id === undefined) { id = vmap.size; vmap.set(key, id); }
    vid[i] = id;
  }
  const NV = vmap.size + 1;
  const edge = new Map();
  const cnt = [];
  const first = [];
  const second = [];
  const ownerOf = [];
  const ownerIds = new Map();
  for (const it of items) {
    if (!ownerIds.has(it.props.owner)) ownerIds.set(it.props.owner, ownerIds.size);
    ownerOf.push(ownerIds.get(it.props.owner));
  }
  for (const it of items) {
    for (let r = it.ringStart; r < it.ringEnd; r += 1) {
      const s = ringOffsets[r];
      const e = ringOffsets[r + 1];
      for (let i = s; i + 1 < e; i += 1) {
        const a = vid[i];
        const b = vid[i + 1];
        const key = a < b ? a * NV + b : b * NV + a;
        const k = edge.get(key);
        if (k === undefined) { edge.set(key, cnt.length); cnt.push(1); first.push(it.index); second.push(-1); }
        else { cnt[k] += 1; if (cnt[k] === 2) second[k] = it.index; }
      }
    }
  }
  const points = [];
  const runStarts = [];
  for (const it of items) {
    for (let r = it.ringStart; r < it.ringEnd; r += 1) {
      const s = ringOffsets[r];
      const e = ringOffsets[r + 1];
      let open = false;
      for (let i = s; i + 1 < e; i += 1) {
        const a = vid[i];
        const b = vid[i + 1];
        const k = edge.get(a < b ? a * NV + b : b * NV + a);
        const seam = isSeamX(coords[2 * i], coords[2 * (i + 1)]);
        const interior = cnt[k] === 2 && (seam || first[k] !== second[k]) && ownerOf[first[k]] === ownerOf[second[k]];
        if (interior) { open = false; continue; }
        if (!open) { runStarts.push(points.length / 2); points.push(coords[2 * i], coords[2 * i + 1]); open = true; }
        points.push(coords[2 * (i + 1)], coords[2 * (i + 1) + 1]);
      }
    }
  }
  runStarts.push(points.length / 2);
  return { points: Float32Array.from(points), runStarts: Uint32Array.from(runStarts) };
}

// --- semplificazione (Douglas-Peucker su array tipizzati) ------------------------------------------------
let stack = new Int32Array(1024);
let keepBuf = new Uint8Array(1024);

/** Douglas-Peucker sulla polilinea coords[i0..j0] (indici di vertice assoluti). Marca keep[indice - base] per i vertici tenuti; gli estremi si tengono sempre. */
function dpKeep(coords, i0, j0, tol, keep, base) {
  keep[i0 - base] = 1;
  keep[j0 - base] = 1;
  if (j0 - i0 < 2) return;
  const t2 = tol * tol;
  const need = 4 * (j0 - i0 + 2);
  if (stack.length < need) stack = new Int32Array(need);
  let sp = 0;
  stack[sp++] = i0;
  stack[sp++] = j0;
  while (sp > 0) {
    const j = stack[--sp];
    const i = stack[--sp];
    const ax = coords[2 * i];
    const ay = coords[2 * i + 1];
    const dx = coords[2 * j] - ax;
    const dy = coords[2 * j + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let wi = -1;
    for (let k = i + 1; k < j; k += 1) {
      const px = coords[2 * k] - ax;
      const py = coords[2 * k + 1] - ay;
      let d2;
      if (len2 === 0) d2 = px * px + py * py;
      else {
        const u = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - u * dx;
        const ey = py - u * dy;
        d2 = ex * ex + ey * ey;
      }
      if (d2 > worst) { worst = d2; wi = k; }
    }
    if (worst > t2) {
      keep[wi - base] = 1;
      stack[sp++] = i;
      stack[sp++] = wi;
      stack[sp++] = wi;
      stack[sp++] = j;
    }
  }
}

/** Accoda a `out` l'anello chiuso [s, e) semplificato come ringToPath: due metà, tolleranza più fine se collassa. */
function simplifyRingInto(coords, s, e, tol, out) {
  const n = e - s;
  if (tol <= 0 || n <= 5) { for (let i = s; i < e; i += 1) out.push(coords[2 * i], coords[2 * i + 1]); return; }
  if (keepBuf.length < n) keepBuf = new Uint8Array(n * 2);
  const m = s + (n >> 1);
  let kept = 0;
  for (const t of [tol, tol / 4, tol / 16]) {
    keepBuf.fill(0, 0, n);
    dpKeep(coords, s, m, t, keepBuf, s);
    dpKeep(coords, m, e - 1, t, keepBuf, s);
    kept = 0;
    for (let i = 0; i < n; i += 1) kept += keepBuf[i];
    if (kept >= 6) break;
  }
  if (kept < 4) { for (let i = s; i < e; i += 1) out.push(coords[2 * i], coords[2 * i + 1]); return; }
  for (let i = 0; i < n; i += 1) if (keepBuf[i]) out.push(coords[2 * (s + i)], coords[2 * (s + i) + 1]);
}

/**
 * Semplificazione veloce (un solo passaggio, senza ricorsione): si tengono i vertici a distanza almeno `tol` dall'ultimo tenuto,
 * più primo e ultimo. Serve alla prima schermata, dove il tempo conta più della finezza; la versione Douglas-Peucker la sostituisce poi in secondo piano.
 */
function radialRingInto(coords, s, e, tol, out) {
  const n = e - s;
  if (tol <= 0 || n <= 5) { for (let i = s; i < e; i += 1) out.push(coords[2 * i], coords[2 * i + 1]); return; }
  const base = out.length;
  for (const t of [tol, tol / 4, tol / 16]) {
    out.length = base;
    const t2 = t * t;
    let lx = coords[2 * s];
    let ly = coords[2 * s + 1];
    out.push(lx, ly);
    for (let i = s + 1; i < e - 1; i += 1) {
      const x = coords[2 * i];
      const y = coords[2 * i + 1];
      const dx = x - lx;
      const dy = y - ly;
      if (dx * dx + dy * dy >= t2) { out.push(x, y); lx = x; ly = y; }
    }
    out.push(coords[2 * (e - 1)], coords[2 * (e - 1) + 1]);
    if ((out.length - base) / 2 >= 6) return;
  }
  if ((out.length - base) / 2 < 4) { out.length = base; for (let i = s; i < e; i += 1) out.push(coords[2 * i], coords[2 * i + 1]); }
}

/** Polilinea aperta: come radialRingInto ma senza ritentare (gli estremi restano). */
function radialLineInto(points, s, e, tol, out) {
  const t2 = tol * tol;
  let lx = points[2 * s];
  let ly = points[2 * s + 1];
  out.push(lx, ly);
  for (let i = s + 1; i < e - 1; i += 1) {
    const x = points[2 * i];
    const y = points[2 * i + 1];
    const dx = x - lx;
    const dy = y - ly;
    if (dx * dx + dy * dy >= t2) { out.push(x, y); lx = x; ly = y; }
  }
  out.push(points[2 * (e - 1)], points[2 * (e - 1) + 1]);
}

/**
 * Lavoro a fette per costruire una versione semplificata delle province (stessa numerazione degli anelli del modello).
 * `step(budgetMs)` ritorna null finché non ha finito, poi { coords, ringOffsets }. Le province sulla cucitura restano al dettaglio pieno.
 * `method`: 'dp' (Douglas-Peucker, più fedele) o 'radial' (veloce, per la prima schermata).
 */
export function createLodJob(model, tol, method = 'dp') {
  const simplify = method === 'radial' ? radialRingInto : simplifyRingInto;
  const { items, coords, ringOffsets } = model;
  const out = [];
  const offsets = new Uint32Array(ringOffsets.length);
  let next = 0;
  return {
    step(budgetMs) {
      const t0 = performance.now();
      while (next < items.length && performance.now() - t0 < budgetMs) {
        const it = items[next];
        next += 1;
        for (let r = it.ringStart; r < it.ringEnd; r += 1) {
          offsets[r] = out.length / 2;
          simplify(coords, ringOffsets[r], ringOffsets[r + 1], it.hasSeam ? 0 : tol, out);
        }
      }
      if (next < items.length) return null;
      offsets[ringOffsets.length - 1] = out.length / 2;
      return { coords: Float32Array.from(out), ringOffsets: offsets };
    },
  };
}

/** Come createLodJob, per i bordi nazionali (polilinee aperte: gli estremi restano). */
export function createBorderLodJob(borders, tol, method = 'dp') {
  const { points, runStarts } = borders;
  const nRuns = runStarts.length - 1;
  const out = [];
  const starts = [];
  let next = 0;
  return {
    step(budgetMs) {
      const t0 = performance.now();
      while (next < nRuns && performance.now() - t0 < budgetMs) {
        const s = runStarts[next];
        const e = runStarts[next + 1];
        next += 1;
        starts.push(out.length / 2);
        const n = e - s;
        if (n <= 2) { for (let i = s; i < e; i += 1) out.push(points[2 * i], points[2 * i + 1]); continue; }
        if (method === 'radial') { radialLineInto(points, s, e, tol, out); continue; }
        if (keepBuf.length < n) keepBuf = new Uint8Array(n * 2);
        keepBuf.fill(0, 0, n);
        dpKeep(points, s, e - 1, tol, keepBuf, s);
        for (let i = 0; i < n; i += 1) if (keepBuf[i]) out.push(points[2 * (s + i)], points[2 * (s + i) + 1]);
      }
      if (next < nRuns) return null;
      starts.push(out.length / 2);
      return { points: Float32Array.from(out), runStarts: Uint32Array.from(starts) };
    },
  };
}

// --- ricerca del punto -----------------------------------------------------------------------------------
/** Il punto (x, y), in unità di mappa, è dentro la provincia? Regola pari-dispari su tutti gli anelli (come il riempimento). */
export function pointInItem(model, item, x, y) {
  const { coords, ringOffsets } = model;
  let inside = false;
  for (let r = item.ringStart; r < item.ringEnd; r += 1) {
    const s = ringOffsets[r];
    const e = ringOffsets[r + 1];
    for (let i = s, j = e - 1; i < e; j = i, i += 1) {
      const xi = coords[2 * i];
      const yi = coords[2 * i + 1];
      const xj = coords[2 * j];
      const yj = coords[2 * j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Provincia sotto il punto (unità di mappa, già riportato alla copia base del mondo). In caso di sovrapposizione vince l'ultima disegnata, come in SVG. */
export function pickProvinceAt(model, x, y) {
  const { items } = model;
  for (let k = items.length - 1; k >= 0; k -= 1) {
    const b = items[k].bbox;
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
    if (pointInItem(model, items[k], x, y)) return items[k];
  }
  return null;
}

// --- fiumi e laghi -------------------------------------------------------------------------------------------
/** Fiumi (coordinate proiettate in array tipizzati) e laghi (stessi campi di buildWaterModel, senza stringhe SVG). */
export function buildCanvasWater(rivers, riversGeo, lakes, widthOf = () => 1, rankOf = () => 99) {
  const byId = new Map(rivers.map((r) => [r.id, r]));
  const lines = riversGeo.features.map((f) => {
    const c = f.geometry.coordinates;
    const a = new Float32Array(c.length * 2);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < c.length; i += 1) {
      const x = c[i][0] * COS0;
      const y = -c[i][1];
      a[2 * i] = x;
      a[2 * i + 1] = y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const river = byId.get(f.properties.riverId);
    return {
      key: `${f.properties.riverId}#${f.properties.segment}`,
      riverId: f.properties.riverId,
      inLake: Boolean(f.properties.inLake),
      coords: a,
      bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      width: widthOf(river),
      rank: rankOf(river),
    };
  }).sort((a, b) => b.rank - a.rank);
  const lakeItems = lakes.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    props: f.properties,
    areaKm2: f.properties.areaKm2 ?? featureAreaKm2(f),
    bbox: boundsOf([f]),
    feature: f,
    kind: 'lake',
  }));
  return { lines, lakes: lakeItems };
}

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}

/** Fiume visibile più vicino al punto (unità di mappa) entro `tol`, o null. Visibili: rango <= rankLimit e fuori dai laghi, più il fiume selezionato. */
export function pickRiverNear(water, x, y, tol, rankLimit, selectedRiverId = null) {
  let best = null;
  let bestD = tol * tol;
  for (const l of water.lines) {
    if (!((l.rank <= rankLimit && !l.inLake) || l.riverId === selectedRiverId)) continue;
    const b = l.bbox;
    if (x < b.x - tol || x > b.x + b.w + tol || y < b.y - tol || y > b.y + b.h + tol) continue;
    const c = l.coords;
    for (let i = 0; i + 3 < c.length; i += 2) {
      const d = segDist2(x, y, c[i], c[i + 1], c[i + 2], c[i + 3]);
      if (d <= bestD) { bestD = d; best = l.riverId; }
    }
  }
  return best;
}
