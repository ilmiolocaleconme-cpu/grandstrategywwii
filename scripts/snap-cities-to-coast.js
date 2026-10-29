// Avvicina alla costa le zone città costiere: molte (Bari...) finivano a qualche km dal mare, con una fascia di provincia in mezzo,
// perché il disco o l'area urbana erano ritagliati sul contorno semplificato. I vertici entro SNAP_KM da un tratto di costa vera
// (non un confine con un'altra provincia) vengono portati sulla costa, e le serie di vertici agganciati seguono la costa.
// 29/10/2026: anche le città a più parti (MultiPolygon) e «mare» = fuori da ogni provincia E fuori dalla terra di base
// (data/land_base.json): prima una terra non coperta dalle province (Svizzera, Germania) era scambiata per costa. Alla fine ogni città riceve
// `distanzaCostaKm` e `costiera` (porti e cantieri navali richiedono una città di mare). Le città d'estuario (Rotterdam, Anversa...) non si spostano.
// Uso: node scripts/snap-cities-to-coast.js [--write]
import { readFile, writeFile } from 'node:fs/promises';
import { loadProvinces } from './load-provinces.js';

export const SNAP_KM = 4; // oltre questa distanza portare i vertici alla costa deforma la zona (prova a 8 km del 29/10/2026: spicchi e lati dritti falsi), quindi non si fa
export const COSTIERA_KM = 8; // entro questa distanza dalla costa vera una zona è «costiera» (può avere porto e cantiere) anche se la forma non la tocca: si segna il dato, non si deforma la zona
export const MAX_DIST_KM = 30; // oltre, distanzaCostaKm resta null (città interna)
export const MAX_AREA_CHANGE = 0.25; // se l'allineamento cambia l'area della zona di più di così la forma è falsata: la zona resta com'è (e finisce in `skipped`)
const OFF = 0.03; // spostamento verso l'esterno per decidere se un tratto di contorno è costa (~3 km)
const TOUCH_KM = 0.15; // entro questa distanza la zona tocca già la costa
const BAND_KM = 1.2; // si agganciano i vertici entro minD + BAND_KM
const KM = 111.32;
const inRing = (r, x, y) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) { const [xi, yi] = r[i]; const [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const inGeom = (g, x, y) => { for (const p of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)) { let ins = false; for (const r of p) if (inRing(r, x, y)) ins = !ins; if (ins) return true; } return false; };
const LAND = JSON.parse(await readFile(new URL('../data/land_base.json', import.meta.url), 'utf8')).polygons.map((poly) => { let a = 1e9; let b = 1e9; let c = -1e9; let d = -1e9; for (const [x, y] of poly[0]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return { poly, bb: [a, b, c, d] }; });
const onLand = (x, y) => { for (const o of LAND) { if (x < o.bb[0] || x > o.bb[2] || y < o.bb[1] || y > o.bb[3]) continue; let ins = false; for (const r of o.poly) if (inRing(r, x, y)) ins = !ins; if (ins) return true; } return false; };
const boxIn = (b, x, y, m) => x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m;
const boxOf = (g) => { let a = 1e9; let b = 1e9; let c = -1e9; let d = -1e9; for (const p of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)) for (const [x, y] of p[0]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c, d]; };

export async function snapCities({ snapKm = SNAP_KM } = {}) {
  const file = new URL('../data/citta_grandi.json', import.meta.url);
  const data = JSON.parse(await readFile(file, 'utf8'));
  const coll = await loadProvinces();
  const prov = new Map(coll.features.map((f) => [f.properties.id, f]));
  const boxes = new Map(coll.features.map((f) => [f.properties.id, boxOf(f.geometry)]));
  const isSea = (x, y, ownId) => { // punto fuori da qualsiasi provincia E fuori dalla terra di base (mare vero, non una terra non coperta dalle province)
    for (const f of coll.features) { if (f.properties.id === ownId) continue; if (boxIn(boxes.get(f.properties.id), x, y, 0) && inGeom(f.geometry, x, y)) return false; }
    return !onLand(x, y);
  };
  const report = [];
  const skipped = [];
  const areaKm2 = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i += 1) a += (r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]); return Math.abs(a / 2) * KM * KM * Math.cos((r[0][1] * Math.PI) / 180); };
  const processPart = (coords, p) => {
    const cands = coll.features.filter((q) => q.properties.id === p.parentProvince || q.properties.id.startsWith(`${p.parentProvince}_SP`)); // le province divise per sponda hanno id <madre>_SP1, _SP2...
    if (!cands.length) return null;
    const ring = coords[0].slice(0, -1);
    const lat0 = ring[0][1]; const cs = Math.cos((lat0 * Math.PI) / 180);
    const kx = KM * cs; const ky = KM;
    // anello esterno della provincia che contiene la maggior parte della zona
    let host = null; let par = null;
    for (const c of cands) { for (const poly of (c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates)) if (inRing(poly[0], ring[0][0], ring[0][1]) || ring.some(([x, y]) => inRing(poly[0], x, y))) { host = poly[0].slice(0, -1); par = c; break; } if (host) break; }
    if (!host) return null;
    // tratto di costa: il punto medio del segmento, spostato un po' all'esterno, è mare (calcolato solo se serve, una volta per segmento)
    const memo = new Map();
    const isCoast = (i) => {
      if (memo.has(i)) return memo.get(i);
      const a = host[i]; const b = host[(i + 1) % host.length];
      const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0]; const dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1;
      const off = OFF; let res = false;
      for (const sgn of [1, -1]) { const px = mx + ((sgn * dy) / len) * off; const py = my - ((sgn * dx) / len) * off; if (!inRing(host, px, py)) { res = isSea(px, py, par.properties.id); break; } }
      memo.set(i, res);
      return res;
    };
    const coastSeg = new Proxy([], { get: (_, k) => (typeof k === 'string' && /^\d+$/.test(k) ? isCoast(Number(k)) : undefined) });
    const nearest = (x, y) => { // punto più vicino sulla costa vera: { d (km), seg, t }
      let best = null;
      host.forEach((a, i) => {
        const b = host[(i + 1) % host.length];
        if (Math.min(a[0], b[0]) - 0.1 > x || Math.max(a[0], b[0]) + 0.1 < x || Math.min(a[1], b[1]) - 0.1 > y || Math.max(a[1], b[1]) + 0.1 < y) return; // lontano (> ~10 km)
        const dx = (b[0] - a[0]) * kx; const dy = (b[1] - a[1]) * ky; const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, (((x - a[0]) * kx) * dx + ((y - a[1]) * ky) * dy) / l2)) : 0;
        const qx = a[0] + t * (b[0] - a[0]); const qy = a[1] + t * (b[1] - a[1]);
        const d = Math.hypot((x - qx) * kx, (y - qy) * ky);
        if ((!best || d < best.d) && isCoast(i)) best = { d, seg: i, t, q: [qx, qy] };
      });
      return best;
    };
    const dists = ring.map(([x, y]) => nearest(x, y));
    const minD = Math.min(...dists.map((n) => n?.d ?? 1e9));
    // solo le zone che non toccano la costa ma ci arrivano vicino (fascia di provincia in mezzo): quelle già sul mare non si toccano
    if (minD <= TOUCH_KM || minD > snapKm) return null;
    const snaps = dists.map((n) => (n && n.d <= minD + BAND_KM ? n : null)); // si porta alla costa solo il lato rivolto al mare
    const nSnap = snaps.filter(Boolean).length;
    if (nSnap === 0) return null;
    // rientranze corte (≤ 6 vertici) tra due tratti agganciati, es. la darsena: si chiudono lungo la costa invece di lasciare un cuneo di terra
    for (let k = 0; k < ring.length; k += 1) {
      if (snaps[k]) continue;
      let e = k; while (e < ring.length && !snaps[e]) e += 1;
      if (k > 0 && e < ring.length && e - k <= 6 && dists[k]) for (let m = k; m < e; m += 1) snaps[m] = dists[m];
      k = e;
    }
    // costruzione: i vertici agganciati sono sostituiti dal punto sulla costa; due agganciati consecutivi si uniscono lungo la costa
    const pos = (n) => n.seg + n.t;
    const out = [];
    let i = 0;
    while (i < ring.length) {
      if (!snaps[i]) { out.push(ring[i]); i += 1; continue; }
      let j = i; while (j + 1 < ring.length && snaps[j + 1]) j += 1;
      const first = snaps[i]; const last = snaps[j];
      out.push(first.q);
      if (j > i) {
        // percorso lungo la costa da first a last (arco più corto dell'anello host, sulla costa)
        const n = host.length;
        const walk = (dir) => { const pts = []; let s = first.seg; let ok = true; if (dir > 0) { s = (first.seg + 1) % n; let guard = 0; while (guard++ < n) { if (!coastSeg[(s + n - 1) % n]) { ok = false; break; } if ((s + n - 1) % n === last.seg) break; pts.push(host[s]); s = (s + 1) % n; } } else { s = first.seg; let guard = 0; while (guard++ < n) { if (!coastSeg[s]) { ok = false; break; } if (s === last.seg) break; pts.push(host[s]); s = (s + n - 1) % n; } } return ok ? pts : null; };
        let path = null;
        if (first.seg === last.seg) path = [];
        else { const a = walk(1); const b = walk(-1); path = a && b ? (a.length <= b.length ? a : b) : (a || b); }
        if (path) out.push(...path);
        out.push(last.q);
      }
      i = j + 1;
    }
    // niente punti doppi consecutivi
    const clean = out.filter((pt, k) => k === 0 || Math.hypot((pt[0] - out[k - 1][0]) * kx, (pt[1] - out[k - 1][1]) * ky) > 0.005);
    if (clean.length < 3) return null;
    const closed = [...clean, clean[0]];
    const change = Math.abs(areaKm2(closed) - areaKm2(coords[0])) / (areaKm2(coords[0]) || 1);
    if (change > MAX_AREA_CHANGE) { skipped.push({ id: p.id, prima: Math.round(minD * 100) / 100, variazioneArea: Math.round(change * 100) / 100 }); return null; }
    report.push({ id: p.id, prima: Math.round(minD * 100) / 100, agganciati: nSnap, punti: [ring.length, clean.length] });
    return [[...clean.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]), [Math.round(clean[0][0] * 1e6) / 1e6, Math.round(clean[0][1] * 1e6) / 1e6]], ...coords.slice(1)];
  };
  for (const f of data.features) {
    const p = f.properties;
    if (p.discoSnapCosta) continue;
    const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let changed = false;
    const next = parts.map((c) => { const r = processPart(c, p); if (r) changed = true; return r ?? c; });
    if (changed) { f.geometry = f.geometry.type === 'Polygon' ? { type: 'Polygon', coordinates: next[0] } : { type: 'MultiPolygon', coordinates: next }; p.snapCosta = true; }
  }
  return { data, report, skipped, file, coll };
}

/** Costruisce la distanza dalla costa vera: segmenti di contorno delle province il cui lato esterno è mare (né province né terra di base). */
export function buildCoastIndex(coll) {
  const CELL = 0.5; const SEG = 0.25;
  const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const key = (i, j) => `${i},${j}`;
  const grid = new Map();
  const feats = coll.features.map((f) => ({ f, bb: boxOf(f.geometry) }));
  feats.forEach((o, idx) => { for (let i = Math.floor(o.bb[0] / CELL); i <= Math.floor(o.bb[2] / CELL); i += 1) for (let j = Math.floor(o.bb[1] / CELL); j <= Math.floor(o.bb[3] / CELL); j += 1) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(idx); } });
  const covered = (x, y, skip) => { for (const idx of grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? []) { if (idx === skip) continue; const o = feats[idx]; if (boxIn(o.bb, x, y, 0) && inGeom(o.f.geometry, x, y)) return true; } return false; };
  const segs = new Map();
  feats.forEach((o, idx) => {
    for (const p of polysOf(o.f.geometry)) {
      const r = p[0];
      for (let i = 0; i < r.length - 1; i += 1) {
        const a = r[i]; const b = r[i + 1]; const dx = b[0] - a[0]; const dy = b[1] - a[1]; const len = Math.hypot(dx, dy); if (len === 0) continue;
        const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2; let out = null;
        for (const sg of [1, -1]) { const px = mx + ((sg * dy) / len) * OFF; const py = my - ((sg * dx) / len) * OFF; if (!inRing(r, px, py)) { out = [px, py]; break; } }
        if (!out || covered(out[0], out[1], idx) || onLand(out[0], out[1])) continue;
        const sgm = { a, b };
        for (let ci = Math.floor(Math.min(a[0], b[0]) / SEG); ci <= Math.floor(Math.max(a[0], b[0]) / SEG); ci += 1) for (let cj = Math.floor(Math.min(a[1], b[1]) / SEG); cj <= Math.floor(Math.max(a[1], b[1]) / SEG); cj += 1) { const k = key(ci, cj); if (!segs.has(k)) segs.set(k, []); segs.get(k).push(sgm); }
      }
    }
  });
  /** Distanza (km) dal punto alla costa vera più vicina entro maxKm; Infinity se non ce n'è. */
  return (x, y, maxKm = MAX_DIST_KM) => {
    const kx = KM * Math.cos((y * Math.PI) / 180); const rad = Math.ceil(maxKm / (SEG * KM)) + 1; let best = Infinity; const seen = new Set();
    const ci0 = Math.floor(x / SEG); const cj0 = Math.floor(y / SEG);
    for (let ci = ci0 - rad; ci <= ci0 + rad; ci += 1) for (let cj = cj0 - rad; cj <= cj0 + rad; cj += 1) for (const sg of segs.get(key(ci, cj)) ?? []) {
      if (seen.has(sg)) continue; seen.add(sg);
      const dx = (sg.b[0] - sg.a[0]) * kx; const dy = (sg.b[1] - sg.a[1]) * KM; const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, (((x - sg.a[0]) * kx) * dx + ((y - sg.a[1]) * KM) * dy) / l2)) : 0;
      const d = Math.hypot((x - sg.a[0]) * kx - t * dx, (y - sg.a[1]) * KM - t * dy);
      if (d < best) best = d;
    }
    return best;
  };
}

/** Aggiunge a ogni zona `distanzaCostaKm` (distanza minima dei vertici dalla costa vera, null oltre MAX_DIST_KM) e `costiera`. */
export function addCoastFields(data, coll) {
  const dist = buildCoastIndex(coll);
  for (const f of data.features) {
    let best = Infinity;
    for (const poly of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) for (const [x, y] of poly[0]) { const d = dist(x, y); if (d < best) best = d; }
    f.properties.distanzaCostaKm = best <= MAX_DIST_KM ? Math.round(best * 100) / 100 : null;
    f.properties.costiera = best <= COSTIERA_KM;
  }
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { data, report, skipped, file, coll } = await snapCities();
  for (const r of report) console.log(r.id, 'min km', r.prima, 'agganciati', r.agganciati, 'punti', r.punti.join('->'));
  console.log(`zone avvicinate: ${report.length}`);
  for (const k of skipped) console.log('NON allineata (area cambierebbe del', `${Math.round(k.variazioneArea * 100)}%):`, k.id, 'min km', k.prima);
  addCoastFields(data, coll);
  const near = data.features.filter((f) => f.properties.costiera);
  console.log(`zone costiere (≤ ${COSTIERA_KM} km): ${near.length} su ${data.features.length}; tra 0,15 e ${SNAP_KM} km ancora non a contatto: ${data.features.filter((f) => f.properties.distanzaCostaKm > 0.15 && f.properties.distanzaCostaKm <= SNAP_KM).length}`);
  if (process.argv.includes('--write')) await writeFile(file, `${JSON.stringify(data)}\n`);
}
