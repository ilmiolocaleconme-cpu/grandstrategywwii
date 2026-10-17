// Logica pura delle zone marittime per la mappa (nomi visibili per zoom, selezione per punto).
// Niente React né Canvas: si prova con node (tests/seaview.test.js).

/** Nomi da mostrare allo zoom `k`: i grandi mari sempre, i golfi da k≥2, gli stretti da k≥4 (non coprono la mappa). */
export function seaLabels(zones, k) {
  return zones.filter((z) => (z.kind === 'strait' || z.kind === 'approach' ? k >= 4 : z.kind === 'gulf' ? k >= 2 : true));
}

function bboxOf(z) {
  if (z.bbox) return z.bbox;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const ring of z.rings) for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  z.bbox = [x0, y0, x1, y1];
  return z.bbox;
}

/** Punto (lon, lat) dentro l'insieme di anelli con regola pari-dispari (i buchi sono isole). */
function insideRings(rings, lon, lat) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Zona marittima che contiene il punto, o null. */
export function seaZoneAt(zones, lon, lat) {
  for (const z of zones) {
    const [x0, y0, x1, y1] = bboxOf(z);
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (insideRings(z.rings, lon, lat)) return z;
  }
  return null;
}

const KIND_RANK = { ocean: 0, sea: 1, gulf: 2, strait: 3, approach: 4 };
export const SEA_FONT_PX = (z) => (z.kind === 'ocean' ? 14 : 10);

// Larghezza media di un carattere (in corpo) per il corsivo: prudente, così il riquadro non sottostima il nome.
export const SEA_CHAR_W = 0.58;
export const SEA_LINE_STEP = 1.2;
const SEA_MAX_CHARS = 16; // lunghezza desiderata di una riga
const SEA_MAX_LINES = 3;
const EDGE_MARGIN = 6; // px liberi tra nome e bordo della mappa
const EDGE_SHIFT = 24; // di quanto si può spostare un nome per farlo stare (oltre, si scarta: non deve finire su terra)

/** Divide il nome in al massimo 3 righe (solo a spazio) minimizzando la riga più lunga; sceglie il minor numero di righe che sta in `maxChars`. */
export function seaLabelLines(name, maxChars = SEA_MAX_CHARS) {
  const words = name.split(/\s+/).filter(Boolean);
  if (name.length <= maxChars || words.length < 2) return [name];
  let best = [name];
  for (let n = 2; n <= Math.min(SEA_MAX_LINES, words.length); n += 1) {
    let cand = null;
    let candMax = Infinity;
    const walk = (from, left, acc) => {
      if (left === 1) {
        const line = words.slice(from).join(' ');
        const lines = [...acc, line];
        const m = Math.max(...lines.map((l) => l.length));
        if (m < candMax) { candMax = m; cand = lines; }
        return;
      }
      for (let to = from + 1; to <= words.length - (left - 1); to += 1) walk(to, left - 1, [...acc, words.slice(from, to).join(' ')]);
    };
    walk(0, n, []);
    best = cand;
    if (candMax <= maxChars) break;
  }
  return best;
}

/** Riquadro del nome in pixel: righe, corpo, larghezza e altezza. */
export function seaLabelBox(z) {
  const f = SEA_FONT_PX(z);
  const lines = seaLabelLines(z.name);
  const w = Math.max(...lines.map((l) => l.length)) * f * SEA_CHAR_W;
  const h = f * (1 + (lines.length - 1) * SEA_LINE_STEP) * 1.15;
  return { lines, f, w, h };
}

const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// Posizioni provate attorno al punto del nome (px), dalla più vicina: il nome resta in acqua invece che sulla terra.
const OFFSETS = (() => {
  const list = [[0, 0]];
  for (let r = 1; r <= 5; r += 1) {
    const d = r * 14;
    for (const [ux, uy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) list.push([ux * d, uy * d]);
  }
  return list;
})();

/** Punti campione (3 × 3) del riquadro: il nome sta «in mare» se quasi tutti cadono nella zona. */
function samplesOf(r) {
  const pts = [];
  for (const fy of [0.1, 0.5, 0.9]) for (const fx of [0.1, 0.5, 0.9]) pts.push([r[0] + (r[2] - r[0]) * fx, r[1] + (r[3] - r[1]) * fy]);
  return pts;
}

/** Il riquadro sta nell'acqua della zona? Mari e golfi: almeno 6 su 9; stretti e approdi (più stretti del nome): basta il centro. */
function inWater(z, r, fromScreen) {
  const pts = samplesOf(r);
  const need = z.kind === 'strait' || z.kind === 'approach' ? 0 : 6;
  const [cx, cy] = pts[4];
  const [clon, clat] = fromScreen(z, cx, cy);
  if (!insideRings(z.rings, clon, clat)) return false;
  let inside = 1;
  for (let i = 0; i < pts.length; i += 1) {
    if (i === 4) continue;
    const [lon, lat] = fromScreen(z, pts[i][0], pts[i][1]);
    if (insideRings(z.rings, lon, lat)) inside += 1;
  }
  return inside >= need;
}

/**
 * Nomi che restano senza sovrapporsi (precedenza: oceani, mari, golfi, stretti; a parità le zone più grandi).
 * `toScreen(z)` dà [x, y] in pixel dello schermo. `view` = { w, h, reserved?, fromScreen? }: i nomi devono stare interi nella vista
 * (si spostano di poco se serve, altrimenti si scartano) e fuori dalle zone `reserved` ([x0, y0, x1, y1], per pulsanti e legenda).
 * Con `fromScreen(z, x, y) -> [lon, lat]` il nome si sposta anche per restare sull'acqua della sua zona (non sulle isole né sulla costa).
 * Ogni voce restituita: { z, x, y, lines, f, w, h } con (x, y) il centro del riquadro.
 */
export function declutterSea(zones, toScreen, view) {
  const ordered = [...zones].sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || (b.areaKm2 ?? 0) - (a.areaKm2 ?? 0));
  const reserved = view.reserved ?? [];
  const kept = [];
  const rects = [];
  for (const z of ordered) {
    const box = seaLabelBox(z);
    const { w, h } = box;
    if (w > view.w - 2 * EDGE_MARGIN || h > view.h - 2 * EDGE_MARGIN) continue;
    const [x0, y0] = toScreen(z);
    // la zona (o il suo nome) è fuori vista: niente da cercare
    if (x0 + w / 2 + 70 < 0 || x0 - w / 2 - 70 > view.w || y0 + h / 2 + 70 < 0 || y0 - h / 2 - 70 > view.h) continue;
    const offsets = view.fromScreen ? OFFSETS : OFFSETS.slice(0, 1);
    for (const [ox, oy] of offsets) {
      let x = x0 + ox;
      let y = y0 + oy;
      if (x + w / 2 < 0 || x - w / 2 > view.w || y + h / 2 < 0 || y - h / 2 > view.h) continue;
      const dx = Math.max(EDGE_MARGIN + w / 2 - x, 0) - Math.max(x + w / 2 - (view.w - EDGE_MARGIN), 0);
      const dy = Math.max(EDGE_MARGIN + h / 2 - y, 0) - Math.max(y + h / 2 - (view.h - EDGE_MARGIN), 0);
      if (Math.abs(dx) > EDGE_SHIFT || Math.abs(dy) > EDGE_SHIFT) continue;
      x += dx;
      y += dy;
      const r = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      if (reserved.some((q) => overlaps(r, q)) || rects.some((q) => overlaps(r, q))) continue;
      if (view.fromScreen && !inWater(z, r, view.fromScreen)) continue;
      rects.push(r);
      kept.push({ z, x, y, ...box });
      break;
    }
  }
  return kept;
}
