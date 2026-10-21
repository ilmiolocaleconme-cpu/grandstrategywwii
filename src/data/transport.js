// Strade e ferrovie come dati di gioco: classificazione in livelli, semplificazione e ponti dagli incroci con i fiumi.
// Funzioni PURE, senza I/O (la lettura di Natural Earth sta in scripts/build-transport.js).
//
// COSA SONO I DATI: la rete MODERNA di Natural Earth 10m (strade e ferrovie), non quella del 1936. Molte strade
// principali di oggi (autostrade) nel 1936 non c'erano; la rete ferroviaria invece in gran parte sì, ma con linee
// poi chiuse e altre aperte dopo. Per questo ogni tratto è `quality: 'hypothesis'` e il LIVELLO è provvisorio.
// Le autostrade moderne restano a livello 2 (strada principale), salvo quelle curate in data/autostrade_1936.json
// (le prime autostrade aperte entro il 1936, a livello 3): per il resto il livello 3 stradale è quello a cui il
// giocatore potrà migliorare la strada in partita (modello a livelli concordato); idem l'elettrificazione.

export const TRANSPORT_SCHEMA = 'transport-v1';
export const AUTOSTRADE_SCHEMA = 'autostrade-v1';
export const MOTORWAY_RANK = 4; // scalerank forzato ai tratti di autostrada 1936: si vedono già a vista d'insieme

/** Livelli delle strade (0 = assente) e delle ferrovie, come nel modello delle infrastrutture migliorabili. */
export const ROAD_LEVELS = Object.freeze([
  { level: 1, id: 'track', label: 'Strada secondaria' },
  { level: 2, id: 'main', label: 'Strada principale' },
  { level: 3, id: 'motorway', label: 'Autostrada (prime, 1936)' },
]);
export const RAIL_LEVELS = Object.freeze([
  { level: 2, id: 'single', label: 'Ferrovia a binario unico' },
  { level: 3, id: 'main', label: 'Ferrovia principale' },
]);

/** Livello provvisorio di una strada Natural Earth (`type`, `expressway`). Ferry e traghetti non sono strade (null). */
export function roadLevel({ type, featurecla, expressway }) {
  if (featurecla === 'Ferry' || /^Ferry/.test(type ?? '')) return null;
  if (type === 'Major Highway' || type === 'Secondary Highway' || expressway === 1) return 2;
  return 1;
}

/** Livello provvisorio di una ferrovia Natural Earth: le linee principali (scalerank ≤ 6) a 3, le altre a 2. Ferry ferroviari esclusi. */
export function railLevel({ scalerank, featurecla }) {
  if (featurecla === 'Railroad ferry') return null;
  return (scalerank ?? 10) <= 6 ? 3 : 2;
}

/** Livello di un ponte: il più alto tra quello della strada (1-2) e quello della ferrovia (2 binario unico, 3 linea principale). */
export function bridgeLevel({ roadLevel: rl = 0, railLevel: tl = 0 }) {
  return Math.max(rl, tl);
}

/** Douglas-Peucker su coordinate [lon, lat] (gradi, piano): tiene gli estremi. */
export function simplify(coords, tol) {
  const n = coords.length;
  if (n <= 2 || tol <= 0) return coords.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = coords[a];
    const dx = coords[b][0] - ax;
    const dy = coords[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = tol2;
    for (let i = a + 1; i < b; i += 1) {
      const px = coords[i][0] - ax;
      const py = coords[i][1] - ay;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const ex = px - t * dx;
      const ey = py - t * dy;
      const d = ex * ex + ey * ey;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return coords.filter((_, i) => keep[i]);
}

/** Intersezione tra due segmenti (coordinate piane): { x, y } oppure null (paralleli o disgiunti). */
export function segmentIntersection(a1, a2, b1, b2) {
  const rx = a2[0] - a1[0];
  const ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0];
  const sy = b2[1] - b1[1];
  const den = rx * sy - ry * sx;
  if (den === 0) return null;
  const qx = b1[0] - a1[0];
  const qy = b1[1] - a1[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1[0] + t * rx, y: a1[1] + t * ry };
}

export const CELL = 0.25; // gradi: lato delle celle dell'indice spaziale dei segmenti di fiume

/** Indice spaziale dei segmenti dei fiumi (tratti fuori dai laghi): celle da 0,25°. */
export function buildRiverSegmentGrid(riverGeo) {
  const cells = new Map();
  for (const f of riverGeo.features) {
    if (f.properties.inLake) continue;
    const c = f.geometry.coordinates;
    for (let i = 0; i < c.length - 1; i += 1) {
      const seg = { riverId: f.properties.riverId, a: c[i], b: c[i + 1] };
      const x0 = Math.floor(Math.min(seg.a[0], seg.b[0]) / CELL);
      const x1 = Math.floor(Math.max(seg.a[0], seg.b[0]) / CELL);
      const y0 = Math.floor(Math.min(seg.a[1], seg.b[1]) / CELL);
      const y1 = Math.floor(Math.max(seg.a[1], seg.b[1]) / CELL);
      for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) {
        const key = `${x}|${y}`;
        const list = cells.get(key);
        if (list) list.push(seg); else cells.set(key, [seg]);
      }
    }
  }
  return cells;
}

/** Direzione non orientata (0..179°) di un segmento nello spazio lon/lat: atan2(Δlat, Δlon). Sulla mappa si ruota il vettore (Δlon·cos0, −Δlat). */
export function headingDeg(a, b) {
  const d = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return Math.round(((d % 180) + 180) % 180) % 180;
}

/**
 * Incroci di una polilinea (strada o ferrovia) con i fiumi: [{ riverId, lon, lat, ang }]. Un incrocio per segmento
 * di strada e fiume; i duplicati (stesso fiume entro `dedupeDeg`) sono uniti. `ang` = direzione della strada (headingDeg).
 */
export function lineRiverIntersections(coords, grid, dedupeDeg = 0.02) {
  const out = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a1 = coords[i];
    const a2 = coords[i + 1];
    const x0 = Math.floor(Math.min(a1[0], a2[0]) / CELL);
    const x1 = Math.floor(Math.max(a1[0], a2[0]) / CELL);
    const y0 = Math.floor(Math.min(a1[1], a2[1]) / CELL);
    const y1 = Math.floor(Math.max(a1[1], a2[1]) / CELL);
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) {
      for (const seg of grid.get(`${x}|${y}`) ?? []) {
        const p = segmentIntersection(a1, a2, seg.a, seg.b);
        if (!p) continue;
        if (out.some((q) => q.riverId === seg.riverId && Math.abs(q.lon - p.x) < dedupeDeg && Math.abs(q.lat - p.y) < dedupeDeg)) continue;
        out.push({ riverId: seg.riverId, lon: p.x, lat: p.y, ang: headingDeg(a1, a2) });
      }
    }
  }
  return out;
}

function pointToSegmentKm(lon, lat, a, b) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ax = (a[0] - lon) * kx; const ay = (a[1] - lat) * 110.57;
  const bx = (b[0] - lon) * kx; const by = (b[1] - lat) * 110.57;
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Distanza in km di un punto da una spezzata di città di passaggio `via` ([lon, lat, ...]). */
export function distanceToViaKm(lon, lat, via) {
  let best = Infinity;
  for (let i = 0; i < via.length - 1; i += 1) best = Math.min(best, pointToSegmentKm(lon, lat, via[i], via[i + 1]));
  return best;
}

/**
 * Divide una strada (coordinate [lon, lat]) in pezzi: quelli che corrono entro `snapKm` da una delle autostrade curate
 * (`autostrade`: [{ id, via, ... }]) portano `auto` = id, gli altri `auto` = null. Un segmento è "autostrada" se entrambi
 * gli estremi lo sono, per la stessa. Ritorna [{ auto, coords }] con i pezzi contigui (condividono il vertice di giunzione).
 */
export function splitByAutostrade(coords, autostrade, snapKm) {
  const label = coords.map(([lon, lat]) => {
    for (const a of autostrade) if (distanceToViaKm(lon, lat, a.via) <= snapKm) return a.id;
    return null;
  });
  const pieces = [];
  let cur = null;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const seg = label[i] !== null && label[i] === label[i + 1] ? label[i] : null;
    if (cur && cur.auto === seg) cur.coords.push(coords[i + 1]);
    else { cur = { auto: seg, coords: [coords[i], coords[i + 1]] }; pieces.push(cur); }
  }
  return pieces;
}

/** Controlli su data/autostrade_1936.json: schema, id unici, almeno due città di passaggio, anno ≤ 1936. */
export function validateAutostrade(file) {
  const errors = [];
  if (file?.schema !== AUTOSTRADE_SCHEMA) errors.push(`schema atteso ${AUTOSTRADE_SCHEMA}`);
  if (file?.quality !== 'hypothesis') errors.push('intestazione: qualità attesa "hypothesis"');
  if (!(file?.snapKm > 0)) errors.push('snapKm non valido');
  const seen = new Set();
  for (const a of file?.autostrade ?? []) {
    if (seen.has(a.id)) errors.push(`${a.id}: id duplicato`);
    seen.add(a.id);
    if (!Array.isArray(a.via) || a.via.length < 2 || a.via.some((p) => !Array.isArray(p) || p.length !== 2 || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) errors.push(`${a.id}: percorso non valido`);
    if (!Number.isInteger(a.fromYear) || a.fromYear > 1936 || a.fromYear < 1920) errors.push(`${a.id}: anno non valido`);
    if (typeof a.name !== 'string' || a.name === '') errors.push(`${a.id}: nome mancante`);
  }
  return errors;
}

/** Controlli su data/transport.json: schema, id unici, tipo, livello, coordinate. Ritorna la lista degli errori. */
export function validateTransport(file) {
  const errors = [];
  if (file?.schema !== TRANSPORT_SCHEMA) errors.push(`schema atteso ${TRANSPORT_SCHEMA}`);
  if (file?.quality !== 'hypothesis') errors.push('intestazione: qualità attesa "hypothesis"');
  if (file?.count !== file?.lines?.length) errors.push('intestazione: count diverso dal numero di tratti');
  const seen = new Set();
  for (const l of file?.lines ?? []) {
    if (seen.has(l.id)) errors.push(`${l.id}: id duplicato`);
    seen.add(l.id);
    if (l.k !== 'road' && l.k !== 'rail') errors.push(`${l.id}: tipo non valido "${l.k}"`);
    const allowed = (l.k === 'road' ? ROAD_LEVELS : RAIL_LEVELS).map((x) => x.level);
    if (!allowed.includes(l.level)) errors.push(`${l.id}: livello ${l.level} non valido per ${l.k}`);
    if (!Array.isArray(l.c) || l.c.length < 4 || l.c.length % 2 !== 0 || l.c.some((v) => !Number.isFinite(v))) errors.push(`${l.id}: coordinate non valide`);
    else for (let i = 0; i < l.c.length; i += 2) if (Math.abs(l.c[i]) > 180 || Math.abs(l.c[i + 1]) > 90) { errors.push(`${l.id}: coordinate fuori dal globo`); break; }
  }
  return errors;
}
