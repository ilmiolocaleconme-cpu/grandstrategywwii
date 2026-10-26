// Chiude i buchi di terra: aree di terra emersa (Natural Earth 50m) che nessuna provincia copre (fiordi, coste frastagliate, isole minori,
// aree senza provincia). Ogni pezzo si aggiunge alla provincia che lo tocca di più (o alla più vicina entro 3°) come parte
// in più della sua geometria. Pezzi lontani da ogni provincia (Kerguelen, Georgia del Sud...) restano fuori e vengono elencati.
//
//   node scripts/fill-land-gaps.js            # applica (idempotente: dopo l'esecuzione non restano buchi da riempire)
//   node scripts/fill-land-gaps.js --dry      # solo rapporto
//
// Metodo: griglia grossa (0,05°) per trovare le componenti scoperte >= MIN_COMP_KM2; per ciascuna, griglia fine (0,02°) in una finestra
// attorno; i pezzi (terra e nessuna provincia) con almeno MIN_CELLS celle si tracciano come poligoni (bordo delle celle), si dilatano di
// una cella dentro la provincia ricevente (nessuna fessura) e si semplificano. Dopo: build:adjacency, build:sea, build:labels.
// I confini di questi pezzi sono APPROSSIMATI (`borderQuality` della provincia non cambia; la proprietà `landGapFill` registra l'aggiunta).
import { readFile } from 'node:fs/promises';
import { readProvinceDocs, writeProvinceDocs } from './province-io.js';
import { makeGrid, fillPolygon } from './sea-raster.js';
import { simplify } from '../src/data/transport.js';

const DRY = process.argv.includes('--dry');
const COARSE = 0.05;
const FINE = 0.02;
const MIN_COMP_KM2 = 250;
const MIN_CELLS = 8; // ~40 km2 a 0,02°
const MAX_REACH_CELLS = 150; // 3°: oltre, il pezzo resta senza provincia
const WIN_MARGIN = 3.2;
const DP_TOL = 0.012;
const KM = 111.32;
const BORDER_CELLS = 3; // niente pezzi a meno di 3 celle (0,06°) da province di un'altra nazione: i confini tra nazioni restano quelli verificati
const DILATE_CLEAR_CELLS = 2;
// acqua nel 1936 che la terra moderna di Natural Earth copre (bonifiche): il Zuiderzee/IJsselmeer (Flevoland, Noordoostpolder) non è terra nel 1936
const WATER_1936 = [[5.05, 52.25, 6.0, 52.85]];
const inWater1936 = (lon, lat) => WATER_1936.some(([x0, y0, x1, y1]) => lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1);
// Europa occidentale e centrale, Mediterraneo: i confini sono stati rifiniti a mano e hanno test rigorosi (nessuna fessura, vertici condivisi,
// sovrapposizioni entro tolleranze): lì non si aggiunge nulla. Stesso discorso per le nazioni con test topologici propri.
const PROTECTED_BOX = [-12, 34, 30, 56.5];
const PROTECTED_OWNERS = new Set(['ESP', 'FRA', 'NLD', 'BEL', 'DEU', 'POL', 'DANZIG', 'CHE', 'AUT', 'CZE', 'LTU', 'LVA', 'EST']);
const inProtected = (lon, lat) => lon >= PROTECTED_BOX[0] && lon <= PROTECTED_BOX[2] && lat >= PROTECTED_BOX[1] && lat <= PROTECTED_BOX[3];

const docs = await readProvinceDocs();
const feats = [];
for (const d of docs) for (const f of d.data.features) feats.push({ f, doc: d });
if (feats.length >= 65535) throw new Error('troppe province per la griglia Uint16');

const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const bboxOf = (rings) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of rings[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
const provPolys = []; // {idx, rings, bb}
feats.forEach((e, idx) => { for (const rings of polysOf(e.f.geometry)) provPolys.push({ idx, rings, bb: bboxOf(rings) }); });
const land = JSON.parse(await readFile(new URL('../data/sources/ne_land_50m_world.json', import.meta.url), 'utf8')).polygons.map((rings) => ({ rings, bb: bboxOf(rings) }));
const hit = (bb, w) => !(bb[0] > w[2] || bb[2] < w[0] || bb[1] > w[3] || bb[3] < w[1]);

// --- componenti scoperte a griglia grossa -----------------------------------------------------------------------------------
const gc = makeGrid({ lon0: -180, lat0: -60, lon1: 180, lat1: 85, step: COARSE });
const cProv = new Uint16Array(gc.nx * gc.ny);
for (const p of provPolys) fillPolygon(gc, p.rings, cProv, p.idx + 1);
const cLand = new Uint8Array(gc.nx * gc.ny);
for (const l of land) fillPolygon(gc, l.rings, cLand, 1);
const un = new Uint8Array(gc.nx * gc.ny);
for (let i = 0; i < un.length; i += 1) if (cLand[i] && !cProv[i]) un[i] = 1;
const seen = new Uint8Array(un.length);
const comps = [];
for (let s = 0; s < un.length; s += 1) {
  if (!un[s] || seen[s]) continue;
  const q = [s]; seen[s] = 1;
  let area = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let qi = 0; qi < q.length; qi += 1) {
    const c = q[qi]; const ix = c % gc.nx; const iy = (c - ix) / gc.nx;
    const lon = -180 + (ix + 0.5) * COARSE; const lat = -60 + (iy + 0.5) * COARSE;
    area += COARSE * COARSE * KM * KM * Math.cos((lat * Math.PI) / 180);
    if (lon < x0) x0 = lon; if (lon > x1) x1 = lon; if (lat < y0) y0 = lat; if (lat > y1) y1 = lat;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = (ix + dx + gc.nx) % gc.nx; const jy = iy + dy;
      if (jy < 0 || jy >= gc.ny) continue;
      const n = jy * gc.nx + jx;
      if (un[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  if (area >= MIN_COMP_KM2) comps.push({ area, bb: [x0, y0, x1, y1] });
}
comps.sort((a, b) => b.area - a.area);

// --- finestra fine per ogni componente ---------------------------------------------------------------------------------------
const added = []; // {idx, rings}: pezzi già assegnati (contano come province nelle finestre successive)
const report = { assigned: [], unassigned: [] };

function traceLoops(mask, nx, ny) {
  // bordi orientati con l'interno a sinistra; vertici (x, y) interi della griglia
  const out = new Map();
  const add = (ax, ay, bx, by) => { const k = ay * (nx + 1) + ax; if (!out.has(k)) out.set(k, []); out.get(k).push([bx, by, false]); };
  for (let iy = 0; iy < ny; iy += 1) for (let ix = 0; ix < nx; ix += 1) {
    if (!mask[iy * nx + ix]) continue;
    const has = (x, y) => x >= 0 && y >= 0 && x < nx && y < ny && mask[y * nx + x];
    if (!has(ix, iy - 1)) add(ix, iy, ix + 1, iy);
    if (!has(ix + 1, iy)) add(ix + 1, iy, ix + 1, iy + 1);
    if (!has(ix, iy + 1)) add(ix + 1, iy + 1, ix, iy + 1);
    if (!has(ix - 1, iy)) add(ix, iy + 1, ix, iy);
  }
  const loops = [];
  for (const [k0, list0] of out) {
    for (const e0 of list0) {
      if (e0[2]) continue;
      const ax = k0 % (nx + 1); const ay = (k0 - ax) / (nx + 1);
      const ring = [[ax, ay]];
      let e = e0; let cx = ax; let cy = ay;
      for (;;) {
        e[2] = true;
        cx = e[0]; cy = e[1];
        if (cx === ax && cy === ay) break;
        ring.push([cx, cy]);
        const nxt = out.get(cy * (nx + 1) + cx)?.find((c) => !c[2]);
        if (!nxt) break;
        e = nxt;
      }
      if (ring.length >= 4) loops.push(ring);
    }
  }
  return loops;
}
const signedArea = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;
const inRing = (pt, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]; const [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };

for (const comp of comps) {
  const wb = [comp.bb[0] - WIN_MARGIN, comp.bb[1] - WIN_MARGIN, comp.bb[2] + WIN_MARGIN, comp.bb[3] + WIN_MARGIN];
  const lon0 = Math.max(-180, Math.floor(wb[0] / FINE) * FINE); const lat0 = Math.max(-60, Math.floor(wb[1] / FINE) * FINE);
  const lon1 = Math.min(180, Math.ceil(wb[2] / FINE) * FINE); const lat1 = Math.min(85, Math.ceil(wb[3] / FINE) * FINE);
  const g = makeGrid({ lon0, lat0, lon1, lat1, step: FINE });
  const { nx, ny } = g;
  if (nx * ny > 4e6) { report.unassigned.push({ at: comp.bb, km2: Math.round(comp.area), why: 'finestra troppo grande' }); continue; }
  const w = [lon0, lat0, lon1, lat1];
  const lm = new Uint16Array(nx * ny); for (const l of land) if (hit(l.bb, w)) fillPolygon(g, l.rings, lm, 1);
  const pm = new Uint16Array(nx * ny);
  for (const p of provPolys) if (hit(p.bb, w)) fillPolygon(g, p.rings, pm, p.idx + 1);
  for (const a of added) for (const rings of a.parts) if (hit(bboxOf(rings), w)) fillPolygon(g, rings, pm, a.idx + 1);
  const gap = new Uint8Array(nx * ny);
  for (let i = 0; i < gap.length; i += 1) if (lm[i] && !pm[i]) gap[i] = 1;
  const sn = new Uint8Array(nx * ny);
  for (let s = 0; s < gap.length; s += 1) {
    if (!gap[s] || sn[s]) continue;
    const q = [s]; sn[s] = 1;
    for (let qi = 0; qi < q.length; qi += 1) {
      const c = q[qi]; const ix = c % nx; const iy = (c - ix) / nx;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx; const jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const n = jy * nx + jx;
        if (gap[n] && !sn[n]) { sn[n] = 1; q.push(n); }
      }
    }
    if (q.length < MIN_CELLS) continue;
    // provincia ricevente: la più presente nel primo anello (raggio crescente) attorno al pezzo
    const inPiece = new Uint8Array(nx * ny); for (const c of q) inPiece[c] = 1;
    let target = 0;
    for (let r = 1; r <= MAX_REACH_CELLS && !target; r += 1) {
      const cnt = new Map();
      for (const c of q) {
        const ix = c % nx; const iy = (c - ix) / nx;
        for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const jx = ix + dx; const jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const v = pm[jy * nx + jx];
          if (v) cnt.set(v, (cnt.get(v) ?? 0) + 1);
        }
      }
      if (cnt.size) target = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    let cx = 0, cy = 0; for (const c of q) { const ix = c % nx; cx += lon0 + (ix + 0.5) * FINE; cy += lat0 + ((c - (c % nx)) / nx + 0.5) * FINE; }
    const where = [Math.round((cx / q.length) * 100) / 100, Math.round((cy / q.length) * 100) / 100];
    const km2 = Math.round(q.length * FINE * FINE * KM * KM * Math.cos((where[1] * Math.PI) / 180));
    if (!target) { report.unassigned.push({ at: where, km2, why: 'nessuna provincia entro 3°' }); continue; }
    const idx = target - 1;
    // si tolgono le celle vicine a un'altra nazione e quelle che nel 1936 erano acqua
    const tOwner = feats[idx].f.properties.owner;
    if (PROTECTED_OWNERS.has(tOwner) || inProtected(where[0], where[1])) { report.protected = (report.protected ?? 0) + 1; continue; }
    const nearOther = (ix, iy, r) => {
      for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
        const jx = ix + dx; const jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const v = pm[jy * nx + jx];
        if (v && feats[v - 1].f.properties.owner !== tOwner) return true;
      }
      return false;
    };
    const keep = q.filter((c) => { const ix = c % nx; const iy = (c - ix) / nx; return !inWater1936(lon0 + (ix + 0.5) * FINE, lat0 + (iy + 0.5) * FINE) && !nearOther(ix, iy, BORDER_CELLS); });
    if (keep.length < MIN_CELLS) { report.skipped = (report.skipped ?? 0) + 1; continue; }
    // dilatazione di una cella dentro la provincia ricevente: niente fessure lungo il bordo
    const mask = new Uint8Array(nx * ny);
    for (const c of keep) mask[c] = 1;
    for (const c of keep) {
      const ix = c % nx; const iy = (c - ix) / nx;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const jx = ix + dx; const jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        if (pm[jy * nx + jx] === target && !nearOther(jx, jy, DILATE_CLEAR_CELLS)) mask[jy * nx + jx] = 1;
      }
    }
    const toLL = ([x, y]) => [Math.round((lon0 + x * FINE) * 1e4) / 1e4, Math.round((lat0 + y * FINE) * 1e4) / 1e4];
    const loops = traceLoops(mask, nx, ny).map((r) => ({ ring: r, a: signedArea(r) }));
    const outers = loops.filter((l) => l.a > 0).map((l) => ({ ...l, holes: [] }));
    for (const h of loops.filter((l) => l.a < 0)) {
      const host = outers.filter((o) => inRing(h.ring[0], o.ring)).sort((a, b) => a.a - b.a)[0];
      if (host) host.holes.push(h.ring);
    }
    const parts = [];
    for (const o of outers) {
      const close = (r) => { const s = simplify([...r, r[0]], DP_TOL / FINE).slice(0, -1); return s.length >= 3 ? [...s, s[0]].map(toLL) : null; };
      const outer = close(o.ring);
      if (!outer) continue;
      parts.push([outer, ...o.holes.map(close).filter(Boolean)]);
    }
    if (!parts.length) continue;
    added.push({ idx, parts });
    report.assigned.push({ id: feats[idx].f.id, owner: feats[idx].f.properties.owner, at: where, km2: Math.round(keep.length * FINE * FINE * KM * KM * Math.cos((where[1] * Math.PI) / 180)) });
  }
}

// --- applicazione ----------------------------------------------------------------------------------------------------------
const byFeat = new Map();
for (const a of added) { if (!byFeat.has(a.idx)) byFeat.set(a.idx, []); byFeat.get(a.idx).push(...a.parts); }
for (const [idx, parts] of byFeat) {
  const { f, doc } = feats[idx];
  const polys = polysOf(f.geometry).concat(parts);
  f.geometry = { type: 'MultiPolygon', coordinates: polys };
  const km2 = report.assigned.filter((r) => r.id === f.id).reduce((s, r) => s + r.km2, 0);
  f.properties.landGapFill = { parts: parts.length, areaKm2: km2, note: 'terra senza provincia (Natural Earth 50m) aggiunta dal più vicino; contorno approssimato (griglia 0,02°)' };
  doc.touched = true;
}
const total = report.assigned.reduce((s, r) => s + r.km2, 0);
console.log(JSON.stringify({ componenti: comps.length, pezziAssegnati: report.assigned.length, province: byFeat.size, km2Assegnati: total, nonAssegnati: report.unassigned.length, scartatiPerConfineOAcqua1936: report.skipped ?? 0, inZonaProtetta: report.protected ?? 0, km2NonAssegnati: report.unassigned.reduce((s, r) => s + r.km2, 0) }));
const uniq = new Map(); for (const u of report.unassigned) { const k = JSON.stringify(u.at); if (!uniq.has(k) || uniq.get(k).km2 < u.km2) uniq.set(k, u); }
report.unassigned = [...uniq.values()];
for (const u of report.unassigned.sort((a, b) => b.km2 - a.km2).slice(0, 40)) console.log('non assegnato', JSON.stringify(u));
const perOwner = {}; for (const r of report.assigned) perOwner[r.owner] = (perOwner[r.owner] ?? 0) + r.km2;
console.log('per nazione (km2)', JSON.stringify(Object.entries(perOwner).sort((a, b) => b[1] - a[1]).slice(0, 20)));
if (!DRY) console.log('scritti', (await writeProvinceDocs(docs)).join(' '));
