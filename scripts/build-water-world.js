// Fiumi e laghi del resto del mondo (fuori dalle aree già coperte: Europa, Nord Africa, URSS).
//
// Uso: node scripts/build-water-world.js <cartella geojson di Natural Earth>
//
// Riproducibile e idempotente: i fiumi/laghi già nel catalogo non si toccano (si aggiungono solo vertici non già coperti ai fiumi
// con lo stesso Wikidata); gli id dei fiumi e dei laghi aggiunti da questo script sono marcati `source: ... world` e vengono
// ricostruiti da zero a ogni esecuzione.
//
// Metodo (come per Europa e URSS, vedi docs/FIUMI.md):
//   - fiumi: Natural Earth 10m rivers_lake_centerlines_scale_rank (+ rivers_north_america, rivers_australia), solo con nome,
//     scalerank <= RANK_MAX, niente canali; raggruppati per Wikidata (altrimenti nome|rivernum);
//   - ritaglio sul territorio delle province presenti (margine 0,04°), vertici già coperti da altri fiumi scartati;
//   - confluenze derivate dalla geometria (estremo libero entro 0,04° dalla linea di un fiume di importanza maggiore): ordine
//     stretto per (scalerank, lunghezza, id) => nessun ciclo;
//   - tratti divisi sui poligoni dei laghi (`inLake`);
//   - laghi: lakes + lakes_north_america + lakes_australia, area >= 100 km² o con nome >= 40 km² (soglia più alta che altrove: peso), centroide o i vertici sul territorio.
import { readFile, writeFile } from 'node:fs/promises';
import { loadProvinces } from './load-provinces.js';

const NE = process.argv[2];
if (!NE) {
  console.error('Uso: node scripts/build-water-world.js <cartella geojson di Natural Earth>');
  process.exit(1);
}
const RANK_MAX = 8;
const MARGIN = 0.04;
const DP = 0.004; // più grossolano del resto (0,002°) per tenere leggero il file sul telefono: il mondo conta 4× i fiumi di prima
const LAKE_MIN = 100; // km² senza nome
const LAKE_MIN_NAMED = 40; // km² con nome
const COVER = 0.015; // un vertice entro questa distanza da una linea già nel catalogo e' un doppione
const MIN_RUN_KM = 25;
const SRC_RIVERS = 'Natural Earth 10m rivers (rivers_lake_centerlines_scale_rank + rivers_north_america + rivers_australia) v5.2.0-pre (commit ca96624), world';
const SRC_LAKES = 'Natural Earth 10m lakes (+ lakes_north_america, lakes_australia) v5.2.0-pre (commit ca96624), world';
const LICENSE = 'Public Domain (Natural Earth)';
const NAVIGABLE = new Set(
  [
    'Yangtze', 'Xi', 'Pearl', 'Mekong', 'Irrawaddy', 'Ganges', 'Brahmaputra', 'Indus', 'Amazon', 'Orinoco', 'Paraná', 'Paraguay',
    'Uruguay', 'Magdalena', 'Mississippi', 'Missouri', 'Ohio', 'St. Lawrence', 'Congo', 'Niger', 'Euphrates', 'Tigris',
    'Shatt al-Arab', 'Murray', 'Darling', 'Chao Phraya', 'Red', 'Hooghly', 'Sacramento', 'Columbia', 'Hudson', 'Rio de la Plata',
    'Río de la Plata', 'Zambezi', 'Senegal', 'Gambia', 'Volta', 'Benue', 'Ubangi', 'Kasai', 'Sankuru', 'Lualaba', 'Salween',
    'Songhua', 'Heilong', 'Liao', 'Huang He', 'Yellow', 'Han', 'Gan', 'Xiang', 'Yuan', 'Jialing', 'Hai', 'Huai', 'Pilcomayo',
    'Madeira', 'Purus', 'Negro', 'Tapajós', 'Xingu', 'Tocantins', 'Araguaia', 'São Francisco',
  ].map((s) => s.toLowerCase()),
);

const rd = async (name) => JSON.parse(await readFile(`${NE}/${name}.geojson`, 'utf8'));
const readJson = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const rad = Math.PI / 180;
const kmBetween = (a, b) => {
  const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * rad);
  const dy = b[1] - a[1];
  return Math.hypot(dx, dy) * 111.195;
};
const lenKm = (line) => line.reduce((s, p, i) => (i ? s + kmBetween(line[i - 1], p) : 0), 0);
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

// ---------- geometria ----------
function pip(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function dpLine(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dm = 0;
    let im = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let t = l2 ? ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
      if (d > dm) {
        dm = d;
        im = i;
      }
    }
    if (dm > eps) {
      keep[im] = 1;
      stack.push([a, im], [im, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
function areaKm2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = ring[i];
    const [l2, p2] = ring[i + 1];
    s += (l2 - l1) * rad * (2 + Math.sin(p1 * rad) + Math.sin(p2 * rad));
  }
  return Math.abs((s * 6371.0088 * 6371.0088) / 2);
}

class RingIndex {
  constructor(cell = 1) {
    this.cell = cell;
    this.map = new Map();
  }
  add(ring, payload) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of ring) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const item = { ring, bbox: [x0, y0, x1, y1], payload };
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
      for (let cy = Math.floor(y0 / this.cell); cy <= Math.floor(y1 / this.cell); cy++) {
        const k = cx * 100000 + cy;
        (this.map.get(k) ?? this.map.set(k, []).get(k)).push(item);
      }
    }
    return item;
  }
  find(x, y) {
    const list = this.map.get(Math.floor(x / this.cell) * 100000 + Math.floor(y / this.cell));
    if (!list) return null;
    for (const it of list) {
      const b = it.bbox;
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && pip(x, y, it.ring)) return it;
    }
    return null;
  }
}

// ---------- caricamento ----------
console.log('carico province...');
const provinces = await loadProvinces();
const land = new RingIndex(1);
for (const f of provinces.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) land.add(p[0], null);
}
const OFF = [[0, 0], [MARGIN, 0], [-MARGIN, 0], [0, MARGIN], [0, -MARGIN]];
const nearLand = (x, y) => OFF.some(([dx, dy]) => land.find(x + dx, y + dy));

const riversOld = await readJson('../data/rivers.json');
const geoOld = await readJson('../data/rivers_geo.json');
const lakesOld = await readJson('../data/lakes.json');
// Idempotenza: togli quanto aggiunto da una esecuzione precedente.
const isWorldR = (r) => typeof r.source === 'string' && r.source.endsWith(', world');
const rivers = riversOld.filter((r) => !isWorldR(r));
const worldIds = new Set(riversOld.filter(isWorldR).map((r) => r.id));
const geoFeatures = geoOld.features.filter((f) => !worldIds.has(f.properties.riverId));
const extendedBefore = new Map(); // id esistente -> segmenti world rimossi (solo per il conteggio)
const lakeFeatures = lakesOld.features.filter((f) => !String(f.properties.source).endsWith(', world'));
// Segmenti world di fiumi esistenti: marcati con `world: true` nel tratto.
const baseGeo = geoFeatures.filter((f) => !f.properties.world);

// copertura esistente: griglia di vertici
const CELL = 0.03;
const coverGrid = new Map();
const ck = (x, y) => Math.floor(x / CELL) * 100000 + Math.floor(y / CELL);
function addCover(line, riverId) {
  for (let i = 0; i < line.length; i++) {
    const [x, y] = line[i];
    const pts = [[x, y]];
    if (i) {
      const [px, py] = line[i - 1];
      const n = Math.ceil(Math.hypot(x - px, y - py) / (COVER * 0.8));
      for (let s = 1; s < n; s++) pts.push([px + ((x - px) * s) / n, py + ((y - py) * s) / n]);
    }
    for (const [qx, qy] of pts) {
      const k = ck(qx, qy);
      (coverGrid.get(k) ?? coverGrid.set(k, []).get(k)).push([qx, qy, riverId]);
    }
  }
}
function covered(x, y, maxD = COVER) {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const l = coverGrid.get((cx + i) * 100000 + (cy + j));
    if (l) for (const [qx, qy] of l) if (Math.hypot(qx - x, qy - y) <= maxD) return true;
  }
  return false;
}
function nearestRivers(x, y, maxD) {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const reach = Math.ceil(maxD / CELL);
  const best = new Map();
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    const l = coverGrid.get((cx + i) * 100000 + (cy + j));
    if (l) for (const [qx, qy, id] of l) {
      const d = Math.hypot(qx - x, qy - y);
      if (d <= maxD && (!best.has(id) || d < best.get(id))) best.set(id, d);
    }
  }
  return best;
}
for (const f of baseGeo) addCover(f.geometry.coordinates, f.properties.riverId);

// laghi esistenti (per dedupe e per dividere i tratti)
const lakeIdx = new RingIndex(1);
const lakeWikidata = new Set();
for (const f of lakeFeatures) {
  if (f.properties.wikidata) lakeWikidata.add(f.properties.wikidata);
  for (const poly of f.geometry.coordinates) lakeIdx.add(poly[0], f.properties.id);
}

// ---------- laghi ----------
console.log('laghi...');
const lakeSrc = [];
for (const n of ['ne_10m_lakes', 'ne_10m_lakes_north_america', 'ne_10m_lakes_australia']) {
  const g = await rd(n);
  for (const f of g.features) lakeSrc.push(f);
}
const lakeSeen = new Set();
const newLakes = [];
let noname = Math.max(0, ...lakeFeatures.map((f) => Number(/^L_NONAME_(\d+)$/.exec(f.properties.id)?.[1] ?? 0)));
const usedLakeIds = new Set(lakeFeatures.map((f) => f.properties.id));
const EXCL_LAKE = /caspian/i;
for (const f of lakeSrc) {
  const p = f.properties;
  if (!f.geometry) continue;
  const fc = p.featurecla ?? '';
  if (/playa|centerline|dry/i.test(fc)) continue;
  const name = p.name_en || p.name || null;
  if (name && EXCL_LAKE.test(name)) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  if (!polys.length) continue;
  let area = 0;
  for (const poly of polys) area += areaKm2(poly[0]) - poly.slice(1).reduce((s, h) => s + areaKm2(h), 0);
  if (!(area >= LAKE_MIN || (name && area >= LAKE_MIN_NAMED))) continue;
  const wd = p.wikidataid || null;
  if (wd && lakeWikidata.has(wd)) continue;
  const key = wd || `${name}|${polys[0][0][0].join(',')}`;
  if (lakeSeen.has(key)) continue;
  // dentro il territorio: centroide (media dei vertici dell'anello maggiore) oppure almeno un quinto dei vertici
  const ring0 = polys.reduce((a, b) => (b[0].length > a[0].length ? b : a))[0];
  const cx = ring0.reduce((s, q) => s + q[0], 0) / ring0.length;
  const cy = ring0.reduce((s, q) => s + q[1], 0) / ring0.length;
  const step = Math.max(1, Math.floor(ring0.length / 40));
  let tot = 0, hit = 0;
  for (let i = 0; i < ring0.length; i += step) {
    tot++;
    if (nearLand(ring0[i][0], ring0[i][1])) hit++;
  }
  if (!(nearLand(cx, cy) || hit / tot >= 0.2)) continue;
  // doppione di un lago già nel catalogo (stesso punto nel poligono di uno esistente)
  if (lakeIdx.find(ring0[0][0], ring0[0][1]) || lakeIdx.find(cx, cy)) continue;
  lakeSeen.add(key);
  const rings = [];
  for (const poly of polys) {
    const outer = dpLine(poly[0], DP).map(([x, y]) => [r4(x), r4(y)]);
    if (outer.length < 4) continue;
    const out = [outer];
    for (const h of poly.slice(1)) if (areaKm2(h) >= 10) {
      const hh = dpLine(h, DP).map(([x, y]) => [r4(x), r4(y)]);
      if (hh.length >= 4) out.push(hh);
    }
    rings.push(out);
  }
  if (!rings.length) continue;
  let id;
  if (name) {
    id = `L_${slug(name)}`;
    if (!/^L_[A-Z0-9_]+$/.test(id) || id === 'L_') id = `L_NONAME_${++noname}`;
    else if (usedLakeIds.has(id)) id = `${id}_${wd ?? ++noname}`;
  } else id = `L_NONAME_${++noname}`;
  usedLakeIds.add(id);
  const props = {
    id,
    name: name ?? null,
    nameLocal: p.name || name || null,
    wikidata: wd,
    areaKm2: Math.round(area),
    scalerank: p.scalerank ?? null,
    approximate: true,
    source: SRC_LAKES,
    license: LICENSE,
  };
  if (name === null) { props.name = null; }
  const issues = [];
  if (/reservoir/i.test(fc) || p.dam_name) issues.push('reservoir_may_postdate_1936');
  if (issues.length) props.knownIssues = issues;
  newLakes.push({ type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: rings } });
}
for (const f of newLakes) for (const poly of f.geometry.coordinates) lakeIdx.add(poly[0], f.properties.id);
const allLakes = [...lakeFeatures, ...newLakes];

// ---------- fiumi ----------
console.log('fiumi...');
const srcLines = [];
for (const n of ['ne_10m_rivers_lake_centerlines_scale_rank', 'ne_10m_rivers_north_america', 'ne_10m_rivers_australia']) {
  const g = await rd(n);
  for (const f of g.features) {
    const p = f.properties;
    const name = p.name_en || p.name;
    if (!name || !f.geometry) continue;
    if (/canal|kanal|channel|aqueduct|ditch/i.test(`${p.featurecla ?? ''} ${name}`)) continue;
    if (/lake centerline/i.test(p.featurecla ?? '')) continue;
    if (!(p.scalerank <= RANK_MAX)) continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    for (const line of lines) srcLines.push({ name, local: p.name || name, wd: p.wikidataid || null, num: p.rivernum ?? null, rank: p.scalerank, line, set: n });
  }
}
// ordine: prima il file mondiale (più accurato), poi i file regionali; per rango crescente
const setOrder = { ne_10m_rivers_lake_centerlines_scale_rank: 0, ne_10m_rivers_north_america: 1, ne_10m_rivers_australia: 2 };
srcLines.sort((a, b) => setOrder[a.set] - setOrder[b.set] || a.rank - b.rank);

const oldByWd = new Map(rivers.filter((r) => r.wikidata).map((r) => [r.wikidata, r.id]));
const usedIds = new Set(rivers.map((r) => r.id));
const groups = new Map(); // key -> { id, existing, name, local, wd, rank, runs: [] }
const nextSegment = new Map();
for (const f of baseGeo) nextSegment.set(f.properties.riverId, Math.max(nextSegment.get(f.properties.riverId) ?? -1, f.properties.segment));

function clipRuns(line) {
  // restituisce le sequenze di vertici sul territorio (con bisezione ai bordi) e non già coperti
  const inside = (p) => nearLand(p[0], p[1]);
  const pts = [];
  for (let i = 0; i < line.length; i++) {
    const b = line[i];
    if (i) {
      const a = line[i - 1];
      const ia = inside(a);
      const ib = inside(b);
      if (ia !== ib) {
        let lo = ia ? a : b;
        let hi = ia ? b : a;
        for (let k = 0; k < 10; k++) {
          const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
          if (inside(m)) lo = m; else hi = m;
        }
        pts.push({ p: lo, ok: true, edge: true });
        pts.push({ p: lo, ok: false, cut: true });
      }
    }
    pts.push({ p: b, ok: inside(b) });
  }
  const runs = [];
  let cur = [];
  const flush = () => { if (cur.length >= 2) runs.push(cur); cur = []; };
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    if (q.cut) { flush(); continue; }
    if (!q.ok) { flush(); continue; }
    if (covered(q.p[0], q.p[1])) {
      // il vertice coperto chiude il tratto, ma resta come ancora di collegamento
      if (cur.length) { cur.push(q.p); flush(); }
      else cur = [q.p];
      continue;
    }
    cur.push(q.p);
  }
  flush();
  // una sequenza fatta solo di ancore coperte non serve
  return runs.filter((r) => r.some((p) => !covered(p[0], p[1])) && lenKm(r) >= MIN_RUN_KM);
}

for (const s of srcLines) {
  const key = s.wd ?? `${s.name}|${s.num ?? s.set}`;
  const runs = clipRuns(s.line);
  if (!runs.length) continue;
  let g = groups.get(key);
  if (!g) {
    const existing = s.wd ? oldByWd.get(s.wd) : null;
    g = { key, existing: existing ?? null, name: s.name, local: s.local, wd: s.wd, rank: s.rank, runs: [], set: s.set };
    groups.set(key, g);
  }
  for (const r of runs) {
    g.runs.push(r);
    addCover(r, key); // evita doppioni tra i file regionali
  }
}

// id e ripulitura
const newRivers = [];
const byKey = new Map();
let collisions = 0;
for (const g of groups.values()) {
  g.runs = g.runs.filter((r) => lenKm(r) >= MIN_RUN_KM || g.existing);
  if (!g.runs.length) continue;
  const total = g.runs.reduce((s, r) => s + lenKm(r), 0);
  if (!g.existing && total < MIN_RUN_KM) continue;
  g.len = total;
  if (g.existing) { g.id = g.existing; continue; }
  let id = `R_${slug(g.name)}`;
  if (id === 'R_') id = `R_RIVER_${g.wd ?? groups.size}`;
  if (usedIds.has(id)) { collisions++; id = `${id}_${g.wd ?? Math.abs(Math.round(g.runs[0][0][0] * 100))}`; }
  usedIds.add(id);
  g.id = id;
  byKey.set(g.key, g);
}
// copertura per id definitivo (le chiavi di gruppo hanno servito per i doppioni)
coverGrid.clear();
for (const f of baseGeo) addCover(f.geometry.coordinates, f.properties.riverId);
const finalGroups = [...groups.values()].filter((g) => g.id);
for (const g of finalGroups) for (const r of g.runs) addCover(r, g.id);

// ---------- confluenze ----------
const meta = new Map(rivers.map((r) => [r.id, { rank: r.scalerank ?? 99, len: r.lengthKm ?? 0, id: r.id }]));
for (const g of finalGroups) if (!g.existing) meta.set(g.id, { rank: g.rank, len: g.len, id: g.id });
const cmp = (a, b) => a.rank - b.rank || b.len - a.len || (a.id < b.id ? -1 : 1);
const flows = new Map();
for (const g of finalGroups) {
  if (g.existing) continue;
  const ends = [];
  for (const r of g.runs) ends.push(r[0], r[r.length - 1]);
  // estremi liberi: non coincidenti con un estremo di un altro tratto dello stesso fiume
  const free = ends.filter((e, i) => !ends.some((o, j) => j !== i && Math.hypot(o[0] - e[0], o[1] - e[1]) < 0.03));
  const me = meta.get(g.id);
  let best = null;
  for (const e of free) {
    for (const [id, d] of nearestRivers(e[0], e[1], MARGIN)) {
      if (id === g.id) continue;
      const m = meta.get(id);
      if (!m || cmp(m, me) >= 0) continue; // solo verso fiumi strettamente più importanti
      if (!best || cmp(m, meta.get(best.id)) < 0 || (cmp(m, meta.get(best.id)) === 0 && d < best.d)) best = { id, d };
    }
  }
  if (best) flows.set(g.id, best.id);
}

// ---------- tratti, divisi sui laghi ----------
const inLakeAt = (x, y) => lakeIdx.find(x, y);
function splitByLakes(line) {
  const out = [];
  let cur = [line[0]];
  let curIn = !!inLakeAt(line[0][0], line[0][1]);
  for (let i = 1; i < line.length; i++) {
    const b = line[i];
    const a = line[i - 1];
    const ib = !!inLakeAt(b[0], b[1]);
    if (ib !== curIn) {
      let lo = a;
      let hi = b;
      const loIn = curIn;
      for (let k = 0; k < 10; k++) {
        const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
        if (!!inLakeAt(m[0], m[1]) === loIn) lo = m; else hi = m;
      }
      cur.push(lo);
      out.push({ inLake: curIn, line: cur });
      cur = [lo, b];
      curIn = ib;
    } else cur.push(b);
  }
  out.push({ inLake: curIn, line: cur });
  return out.filter((s) => s.line.length >= 2);
}

const newGeo = [];
for (const g of finalGroups) {
  let seg = g.existing ? (nextSegment.get(g.id) ?? -1) + 1 : 0;
  for (const run of g.runs) {
    const simp = dpLine(run, DP).map(([x, y]) => [r4(x), r4(y)]);
    if (simp.length < 2) continue;
    for (const piece of splitByLakes(simp)) {
      newGeo.push({
        type: 'Feature',
        properties: { riverId: g.id, segment: seg++, inLake: piece.inLake, ...(g.existing ? { world: true } : {}) },
        geometry: { type: 'LineString', coordinates: piece.line },
      });
    }
  }
}

// ---------- scheda dei fiumi ----------
const widthOf = (rank) => (rank <= 5 ? 'large' : rank <= 8 ? 'medium' : 'small');
const classOf = (id) => {
  const f = flows.get(id);
  if (!f) return 'main';
  const t = rivers.find((r) => r.id === f);
  const tf = flows.get(f) ?? t?.flowsInto ?? null;
  return tf ? 'tributary' : 'secondary';
};
const wdSeen = new Set();
for (const g of finalGroups) {
  if (g.existing) continue;
  const issues = ['modern_course_not_1936', 'line_generalised_10m', 'clipped_to_territory'];
  const nav = NAVIGABLE.has(g.name.toLowerCase());
  newRivers.push({
    id: g.id,
    name: g.name,
    nameLocal: g.local,
    class: classOf(g.id),
    flowsInto: flows.get(g.id) ?? null,
    navigable: nav,
    navigableBasis: nav ? 'curated_unverified' : 'unknown_assumed_false',
    widthClass: widthOf(g.rank),
    widthBasis: 'proxy_from_natural_earth_scalerank',
    scalerank: g.rank,
    lengthKm: Math.round(g.len),
    approximate: true,
    wikidata: g.wd && !wdSeen.has(g.wd) ? (wdSeen.add(g.wd), g.wd) : null,
    source: SRC_RIVERS,
    license: LICENSE,
    flowsIntoBasis: flows.has(g.id) ? 'derived_from_geometry' : 'none_in_area',
    knownIssues: issues,
  });
}
// Fiumi esistenti estesi: la lunghezza cresce dei vertici aggiunti
const extendedLen = new Map();
for (const g of finalGroups) if (g.existing) extendedLen.set(g.id, (extendedLen.get(g.id) ?? 0) + g.len);
for (const r of rivers) if (extendedLen.has(r.id)) r.lengthKm = Math.round(r.lengthKm + extendedLen.get(r.id));

newRivers.sort((a, b) => (a.id < b.id ? -1 : 1));
const outRivers = [...rivers, ...newRivers];
const outGeo = { ...geoOld, features: [...baseGeo, ...newGeo] };
const outLakes = { ...lakesOld, features: allLakes };
await writeFile(new URL('../data/rivers.json', import.meta.url), JSON.stringify(outRivers));
await writeFile(new URL('../data/rivers_geo.json', import.meta.url), JSON.stringify(outGeo));
await writeFile(new URL('../data/lakes.json', import.meta.url), JSON.stringify(outLakes));
const by = (k) => newRivers.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
console.log(JSON.stringify({
  rivers: outRivers.length, newRivers: newRivers.length, extended: extendedLen.size, segments: outGeo.features.length, newSegments: newGeo.length,
  lakes: allLakes.length, newLakes: newLakes.length, classes: by('class'), navigable: newRivers.filter((r) => r.navigable).length, collisions,
}));
