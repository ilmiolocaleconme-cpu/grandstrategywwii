// Nomi delle nazioni (e degli imperi) sulla mappa: una scritta grande al centro del territorio, leggibile a zoom lontano.
// Funzioni pure in unità di mappa, senza React: usate sia dalla mappa SVG sia da quella Canvas. Testate in tests/nationLabels.test.js.
//
// Una "nazione" è il controllore (controllerOf): un impero con stati fantoccio compare una volta sola, come il suo colore.
// Il centro è il punto più interno del pezzo di territorio più grande (esclavi e colonie lontane non lo spostano):
// griglia di occupazione -> componente connessa più grande -> trasformata delle distanze -> massimo.
// Il lavoro è una tantum e a fette (`createNationLabelJob`), per non bloccare la prima schermata.

import { polygonsOf, project, controllerOf } from './geo.js';
import { pointInRings, CHAR_W, TEXT_H } from './labelfit.js';

export const NATION_LABEL_MIN_PX = 8; // sotto questo corpo la scritta non si mostra
export const NATION_LABEL_MAX_PX = 34; // oltre, il corpo smette di crescere (la scritta resta leggibile e non invade)
export const NATION_FADE_K = [4, 8]; // la scritta svanisce tra questi zoom: da k=8 ci sono i nomi delle province

const GRID_CELLS = 45; // celle lungo la dimensione tipica del territorio
const MAX_GRID = 160; // tetto per lato

function bboxOfRings(rings) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of rings[0]) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** Raggruppa le province per controllore; tiene solo i gruppi con un nome. Ordine stabile (per id). */
export function groupByController(items, nationNames, control) {
  const groups = new Map();
  for (const it of items) {
    const id = controllerOf(it.props.owner, control);
    if (!nationNames[id]) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(it);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Posizione, corpo e lunghezza della scritta per un gruppo di province. Ritorna null se il territorio è vuoto. */
export function labelForGroup(id, name, items) {
  const polys = [];
  let sumBox = 0;
  let gx0 = Infinity;
  let gy0 = Infinity;
  let gx1 = -Infinity;
  let gy1 = -Infinity;
  items.forEach((it, itemIdx) => {
    for (const poly of polygonsOf(it.feature)) {
      const rings = poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat)));
      if (rings[0].length < 4) continue;
      const b = bboxOfRings(rings);
      polys.push({ rings, b, itemIdx });
      sumBox += (b.x1 - b.x0) * (b.y1 - b.y0);
      if (b.x0 < gx0) gx0 = b.x0;
      if (b.y0 < gy0) gy0 = b.y0;
      if (b.x1 > gx1) gx1 = b.x1;
      if (b.y1 > gy1) gy1 = b.y1;
    }
  });
  if (polys.length === 0 || sumBox <= 0) return null;
  const w = gx1 - gx0;
  const h = gy1 - gy0;
  const cell = Math.max(Math.sqrt(sumBox) / GRID_CELLS, w / MAX_GRID, h / MAX_GRID);
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));

  // occupazione: il centro della cella è dentro una provincia del gruppo?
  const occ = new Uint8Array(cols * rows);
  const owner = new Int32Array(cols * rows).fill(-1); // quale provincia occupa la cella
  for (let r = 0; r < rows; r += 1) {
    const y = gy0 + (r + 0.5) * cell;
    for (let c = 0; c < cols; c += 1) {
      const x = gx0 + (c + 0.5) * cell;
      for (const p of polys) {
        if (x < p.b.x0 || x > p.b.x1 || y < p.b.y0 || y > p.b.y1) continue;
        if (pointInRings(x, y, p.rings)) { occ[r * cols + c] = 1; owner[r * cols + c] = p.itemIdx; break; }
      }
    }
  }

  // componente connessa (4 vicini) più grande
  const comp = new Int32Array(cols * rows).fill(-1);
  const sizes = [];
  const stack = [];
  for (let i = 0; i < occ.length; i += 1) {
    if (!occ[i] || comp[i] >= 0) continue;
    const label = sizes.length;
    let n = 0;
    stack.push(i);
    comp[i] = label;
    while (stack.length) {
      const j = stack.pop();
      n += 1;
      const c = j % cols;
      const r = (j - c) / cols;
      if (c > 0 && occ[j - 1] && comp[j - 1] < 0) { comp[j - 1] = label; stack.push(j - 1); }
      if (c < cols - 1 && occ[j + 1] && comp[j + 1] < 0) { comp[j + 1] = label; stack.push(j + 1); }
      if (r > 0 && occ[j - cols] && comp[j - cols] < 0) { comp[j - cols] = label; stack.push(j - cols); }
      if (r < rows - 1 && occ[j + cols] && comp[j + cols] < 0) { comp[j + cols] = label; stack.push(j + cols); }
    }
    sizes.push(n);
  }
  if (sizes.length === 0) return null;
  // il pezzo principale è quello con più province (la Francia metropolitana, non l'Algeria, anche se più vasta); a parità, più celle
  const provs = sizes.map(() => new Set());
  for (let i = 0; i < comp.length; i += 1) if (comp[i] >= 0) provs[comp[i]].add(owner[i]);
  let best = 0;
  for (let k = 1; k < sizes.length; k += 1) {
    if (provs[k].size > provs[best].size || (provs[k].size === provs[best].size && sizes[k] > sizes[best])) best = k;
  }

  // trasformata delle distanze (3-4) dal bordo del pezzo scelto; fuori dal pezzo = 0
  const inside = (i) => comp[i] === best;
  const INF = 1e9;
  const d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i += 1) d[i] = inside(i) ? INF : 0;
  const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? 0 : d[r * cols + c]);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(c - 1, r) + 3, at(c, r - 1) + 3, at(c - 1, r - 1) + 4, at(c + 1, r - 1) + 4);
    }
  }
  for (let r = rows - 1; r >= 0; r -= 1) {
    for (let c = cols - 1; c >= 0; c -= 1) {
      const i = r * cols + c;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(c + 1, r) + 3, at(c, r + 1) + 3, at(c + 1, r + 1) + 4, at(c - 1, r + 1) + 4);
    }
  }

  // centro: massimo della distanza; a parità, il più vicino al baricentro del pezzo
  let sx = 0;
  let sy = 0;
  let c0 = Infinity;
  let c1 = -Infinity;
  let r0 = Infinity;
  let r1 = -Infinity;
  for (let i = 0; i < d.length; i += 1) {
    if (!inside(i)) continue;
    const c = i % cols;
    const r = (i - c) / cols;
    sx += c;
    sy += r;
    if (c < c0) c0 = c;
    if (c > c1) c1 = c;
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
  }
  sx /= sizes[best];
  sy /= sizes[best];
  let bi = -1;
  let bd = -1;
  let bt = Infinity;
  for (let i = 0; i < d.length; i += 1) {
    if (!inside(i)) continue;
    const c = i % cols;
    const r = (i - c) / cols;
    const tie = (c - sx) ** 2 + (r - sy) ** 2;
    if (d[i] > bd + 1e-6 || (Math.abs(d[i] - bd) <= 1e-6 && tie < bt)) { bd = d[i]; bi = i; bt = tie; }
  }
  const bc = bi % cols;
  const br = (bi - bc) / cols;

  // larghezza utile: tratto orizzontale continuo dentro il pezzo, sulla riga del centro
  let left = bc;
  let right = bc;
  while (left > 0 && inside(br * cols + left - 1)) left -= 1;
  while (right < cols - 1 && inside(br * cols + right + 1)) right += 1;
  const runW = (right - left + 1) * cell;
  const compW = (c1 - c0 + 1) * cell;
  const compH = (r1 - r0 + 1) * cell;

  // lunghezza: il tratto libero; per le forme strette (es. una penisola) si lascia debordare un po', fino al 92 % dell'estensione
  const text = String(name).toLocaleUpperCase('it');
  const length = Math.min(compW * 0.92, Math.max(runW, compW * 0.55));
  let size = length / (text.length * CHAR_W);
  const maxSize = (compH * 0.45) / TEXT_H;
  if (size > maxSize) size = maxSize;
  return {
    id,
    text,
    x: gx0 + (bc + 0.5) * cell,
    y: gy0 + (br + 0.5) * cell,
    size,
    length: size * text.length * CHAR_W,
    area: sizes[best],
    bx0: gx0 + c0 * cell, // estensione del pezzo principale: la scritta può scorrere entro questi limiti per restare in vista
    bx1: gx0 + (c1 + 1) * cell,
    by0: gy0 + r0 * cell,
    by1: gy0 + (r1 + 1) * cell,
  };
}

/**
 * Lavoro a fette: `step(budgetMs)` ritorna null finché non ha finito, poi l'elenco delle scritte (ordinato dalla più grande).
 * Una nazione per volta: la fetta più lunga è quella dei territori più estesi.
 */
export function createNationLabelJob(items, nationNames, control) {
  const groups = groupByController(items, nationNames, control);
  const out = [];
  let next = 0;
  return {
    total: groups.length,
    step(budgetMs = 8) {
      const t0 = performance.now();
      while (next < groups.length && performance.now() - t0 < budgetMs) {
        const [id, its] = groups[next];
        next += 1;
        const l = labelForGroup(id, nationNames[id], its);
        if (l) out.push(l);
      }
      if (next < groups.length) return null;
      return out.sort((a, b) => b.length - a.length);
    },
  };
}

/** Versione sincrona (test e strumenti). */
export function buildNationLabels(items, nationNames, control) {
  const job = createNationLabelJob(items, nationNames, control);
  let r = null;
  while ((r = job.step(1e9)) === null);
  return r;
}

/** Opacità in base allo zoom: piena fino a NATION_FADE_K[0], nulla da NATION_FADE_K[1]. */
export function nationAlpha(k) {
  const [a, b] = NATION_FADE_K;
  if (k <= a) return 1;
  if (k >= b) return 0;
  return 1 - (k - a) / (b - a);
}

/**
 * Scritte da mostrare per la vista corrente. `labels`: da createNationLabelJob; `pxPerUnit`: pixel per unità di mappa a zoom 1;
 * `offsets`: copie del mondo visibili; `opts.visible` {x0,x1,y0,y1}: rettangolo visibile in unità di mappa (copia base). Il corpo in pixel è limitato tra NATION_LABEL_MIN_PX (sotto: nascosta) e NATION_LABEL_MAX_PX
 * (sopra: smette di crescere). Si salta chi si sovrappone a una scritta più grande già scelta. Ogni elemento: {id, text, x, y, size, length, off, alpha}.
 */
export function placeNationLabels(labels, k, pxPerUnit, offsets = [0], opts = {}) {
  const alpha = nationAlpha(k);
  if (alpha <= 0 || !labels?.length) return [];
  const minPx = opts.minPx ?? NATION_LABEL_MIN_PX;
  const maxPx = opts.maxPx ?? NATION_LABEL_MAX_PX;
  const unitPx = pxPerUnit * k;
  const placed = [];
  for (const off of offsets) {
    const rects = [];
    for (const l of labels) {
      const fontPx = l.size * unitPx;
      if (fontPx < minPx) continue;
      let f = fontPx > maxPx ? maxPx / fontPx : 1;
      const v = opts.visible;
      if (v && l.length * f > 0.5 * (v.x1 - v.x0)) f = (0.5 * (v.x1 - v.x0)) / l.length; // mai più larga della metà dello schermo
      const size = l.size * f;
      if (size * unitPx < minPx) continue;
      const length = l.length * f;
      const hw = length / 2;
      const hh = (size * TEXT_H) / 2;
      // se la scritta esce dalla vista la si fa scorrere, restando dentro l'estensione della nazione ("UNIONE SOVIETICA" non resta tagliata)
      let x = l.x;
      let y = l.y;
      if (v && l.bx1 !== undefined) {
        const vx0 = v.x0 - off;
        const vx1 = v.x1 - off;
        if (x - hw < vx0 || x + hw > vx1) x = Math.min(vx1 - hw, Math.max(vx0 + hw, x));
        const ov = 0.3 * length; // la scritta può debordare un po' dai confini della nazione, per restare in vista
        x = l.bx1 - l.bx0 + 2 * ov >= length ? Math.min(l.bx1 - hw + ov, Math.max(l.bx0 + hw - ov, x)) : (l.bx0 + l.bx1) / 2;
        if (y - hh < v.y0 || y + hh > v.y1) y = Math.min(v.y1 - hh, Math.max(v.y0 + hh, y));
        y = l.by1 - l.by0 >= 2 * hh ? Math.min(l.by1 - hh, Math.max(l.by0 + hh, y)) : (l.by0 + l.by1) / 2;
      }
      const r = { x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh };
      if (rects.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
      rects.push(r);
      placed.push({ id: l.id, text: l.text, x, y, size, length, off, alpha });
    }
  }
  return placed;
}
