// Rigenera data/links.json: il grafo dei collegamenti per il gioco (src/data/links.js).
// Ingressi: data/transport.json (rete, da build-transport.js), data/adjacency.json (coppie di province), data/rivers*.json, le province e le
// città di Natural Earth (pubblico dominio): serve il file ne_10m_populated_places_simple.geojson, non nel repository:
//   git -C ne sparse-checkout add /geojson/ne_10m_populated_places_simple.geojson
//   node scripts/build-links.js <cartella ne/geojson>      (oppure NE_DIR=<cartella>)   `npm run build:links -- <cartella>`
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadProvinces } from './load-provinces.js';
import { buildProvinceIndex, bboxOf, polygonsOf } from '../src/data/geometry.js';
import { polylineKm, routeLink } from '../src/data/linkroute.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { CELL, buildRiverSegmentGrid, segmentIntersection } from '../src/data/transport.js';
import { applyRailOverrides } from '../src/data/railOverrides.js';
import { BRIDGE_HALF_KM, LADDER, LINKS_SCHEMA, MODES, pathStep, buildNetwork, crossingsAlong, cumulativeKm, heading, kmBetween, markerLevelOfStep, shortestPath, sliceByDistance } from '../src/data/links.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), 'utf8'));
const r4 = (x) => Math.round(x * 1e4) / 1e4;

export const PARAMS = { snapDeg: 0.004, seatSnapKm: 40, detourFactor: 2.5, detourExtraKm: 25, bridgeClasses: ['medium', 'large'], minPieceKm: 0.05, seaMaxKm: 120 };

export async function buildLinksFile(neDir, params = PARAMS) {
  const T0 = Date.now();
  // cache facoltativa dei tracciati (solo per rigenerare in fretta durante lo sviluppo): LINK_ROUTE_CACHE=<file.json>
  const cachePath = process.env.LINK_ROUTE_CACHE;
  const cache = cachePath ? JSON.parse(await readFile(cachePath, 'utf8').catch(() => '{}')) : {};
  const provinces = await loadProvinces();
  const ids = provinces.features.map((f) => f.properties.id);
  const idxOf = new Map(ids.map((id, i) => [id, i]));
  const index = buildProvinceIndex(provinces);
  const provAt = (lon, lat) => { const h = index.provincesAt(lon, lat); return h.length === 0 ? -1 : idxOf.get(h[0].properties.id); };
  // vertici del confine condiviso tra due province (entro la tolleranza dell'adiacenza): punti di passaggio per le curve
  const BORDER_TOL = 0.02; const HCELL = 0.05;
  const hashes = new Map();
  const hashOf = (p) => {
    let h = hashes.get(p);
    if (!h) {
      h = new Map();
      for (const poly of polygonsOf(provinces.features[p].geometry)) for (const ring of poly) for (const [x, y] of ring) { const k = `${Math.floor(x / HCELL)}|${Math.floor(y / HCELL)}`; (h.get(k) ?? h.set(k, []).get(k)).push([x, y]); }
      hashes.set(p, h);
    }
    return h;
  };
  const sharedBorder = (i, j) => {
    const hj = hashOf(j); const out = []; const seen = new Set();
    for (const poly of polygonsOf(provinces.features[i].geometry)) for (const ring of poly) for (const [x, y] of ring) {
      const cx = Math.floor(x / HCELL); const cy = Math.floor(y / HCELL);
      let near = false;
      for (let dx = -1; dx <= 1 && !near; dx += 1) for (let dy = -1; dy <= 1 && !near; dy += 1) for (const q of hj.get(`${cx + dx}|${cy + dy}`) ?? []) if (Math.abs(q[0] - x) < BORDER_TOL && Math.abs(q[1] - y) < BORDER_TOL) { near = true; break; }
      if (!near) continue;
      const k = `${Math.round(x / 0.02)}|${Math.round(y / 0.02)}`;
      if (!seen.has(k)) { seen.add(k); out.push([x, y]); }
    }
    return out;
  };
  const unionBox = (i, j) => { const a = bboxOf(provinces.features[i].geometry); const b = bboxOf(provinces.features[j].geometry); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; };
  const adjacency = await readJson('adjacency.json');
  const transport = await readJson('transport.json');
  const rivers = await readJson('rivers.json');
  const widthOf = new Map(rivers.map((r) => [r.id, r.widthClass]));
  const grid = buildRiverSegmentGrid(await readJson('rivers_geo.json'));

  // sedi: la città più popolosa di ogni provincia (Natural Earth populated places)
  const places = JSON.parse(await readFile(path.join(neDir, 'ne_10m_populated_places_simple.geojson'), 'utf8')).features;
  const seatOf = new Map();
  for (const f of places) {
    const [lon, lat] = f.geometry.coordinates;
    const p = provAt(lon, lat);
    if (p < 0) continue;
    const pop = f.properties.pop_max ?? 0;
    const cur = seatOf.get(p);
    if (!cur || pop > cur.pop) seatOf.set(p, { p, name: f.properties.name, lon: r4(lon), lat: r4(lat), pop, basis: 'populated_place' });
  }
  provinces.features.forEach((f, p) => { // province senza città: un punto dentro la provincia
    if (seatOf.has(p)) return;
    const geom = f.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const ring = polys.map((pl) => pl[0]).sort((a, b) => b.length - a.length)[0];
    const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length;
    const cy = ring.reduce((s, q) => s + q[1], 0) / ring.length;
    const inside = provAt(cx, cy) === p;
    seatOf.set(p, { p, name: f.properties.name, lon: r4(inside ? cx : ring[0][0]), lat: r4(inside ? cy : ring[0][1]), pop: 0, basis: inside ? 'centroid' : 'border_vertex' });
  });

  // gradino di ogni coppia dalla rete reale: strozzatura del percorso migliore, per strada e per ferrovia
  const stepOf = new Map(); // "i|j" -> { t, via }
  const stats = {};
  for (const mode of MODES) {
    const net = buildNetwork(transport.lines, mode, params.snapDeg);
    const nodeProv = new Int32Array(net.size).fill(-2);
    const provOf = (u) => { if (nodeProv[u] === -2) nodeProv[u] = provAt(net.lon[u], net.lat[u]); return nodeProv[u]; };
    const cellOf = new Map();
    for (let u = 0; u < net.size; u += 1) { if (net.adj[u].length === 0) continue; const k = `${Math.floor(net.lon[u] / 0.1)}|${Math.floor(net.lat[u] / 0.1)}`; (cellOf.get(k) ?? cellOf.set(k, []).get(k)).push(u); }
    const snap = (seat) => {
      let best = null; let bd = params.seatSnapKm;
      const cx = Math.floor(seat.lon / 0.1); const cy = Math.floor(seat.lat / 0.1);
      for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) for (const u of cellOf.get(`${cx + dx}|${cy + dy}`) ?? []) {
        const d = kmBetween(seat.lon, seat.lat, net.lon[u], net.lat[u]);
        if (d < bd && provOf(u) === seat.p) { bd = d; best = u; }
      }
      return best;
    };
    const seatNode = new Map();
    for (const [p, seat] of seatOf) { const u = snap(seat); if (u !== null) seatNode.set(p, u); }
    let found = 0;
    for (const [i, j] of adjacency.edges) {
      const u = seatNode.get(i); const v = seatNode.get(j);
      if (u === undefined || v === undefined) continue;
      const si = seatOf.get(i); const sj = seatOf.get(j);
      const straight = kmBetween(si.lon, si.lat, sj.lon, sj.lat);
      const sp = shortestPath(net, u, v, (w) => { const p = provOf(w); return p === i || p === j || p === -1; });
      if (!sp || sp.km > params.detourFactor * straight + params.detourExtraKm) continue;
      found += 1;
      const t = pathStep(net, sp.edges);
      const key = `${i}|${j}`;
      if (t > (stepOf.get(key)?.t ?? 0)) stepOf.set(key, { t, via: mode });
    }
    stats[mode] = { nodes: net.size, pairsWithPath: found };
  }

  // collegamenti: una linea retta tra le sedi, con i ponti dove incrocia un fiume importante
  const links = []; const segments = []; const bridges = []; const routeStats = {};
  const nodeT = new Map();
  const perRiver = new Map();
  for (const [i, j, ] of adjacency.edges) {
    const si = seatOf.get(i); const sj = seatOf.get(j);
    if (!si || !sj) continue;
    let st = stepOf.get(`${i}|${j}`) ?? { t: 1, via: 'none' };
    const ckey = `${i}|${j}|${si.lon}|${si.lat}|${sj.lon}|${sj.lat}`;
    const route = cache[ckey] ?? (cache[ckey] = routeLink({ a: [si.lon, si.lat], b: [sj.lon, sj.lat], pa: i, pb: j, provAt, border: () => sharedBorder(i, j), bbox: unionBox(i, j) }));
    routeStats[route.how] = (routeStats[route.how] ?? 0) + 1;
    if (process.env.PROGRESS && links.length % 250 === 0) console.error(links.length, JSON.stringify(routeStats), Math.round((Date.now() - T0) / 1000), 's');
    const sea = route.how === 'sea';
    if (sea && polylineKm(route.coords) > params.seaMaxKm) { routeStats.droppedSea = (routeStats.droppedSea ?? 0) + 1; continue; } // tratta marittima lunga: non serve al gioco
    if (sea) st = { t: 1, via: 'sea' }; // nessun percorso via terra: tratta marittima, niente strada né ponti
    const coords = route.coords.map(([x, y]) => [r4(x), r4(y)]);
    const link = { id: `LK_${i}_${j}`, a: i, b: j, t: st.t, km: Math.max(1, Math.round(polylineKm(coords))), via: st.via, ...(route.how !== 'straight' ? { how: route.how } : {}), ...(sea ? { sea: true } : {}) };
    links.push(link);
    nodeT.set(i, Math.max(nodeT.get(i) ?? 1, st.t)); nodeT.set(j, Math.max(nodeT.get(j) ?? 1, st.t));
    const lad = sea ? { k: 'sea', level: 0, rank: 6, id: 'sea' } : LADDER[st.t - 1];
    const cum = cumulativeKm(coords);
    const total = cum.at(-1);
    const windows = [];
    let prevEnd = 0;
    for (const c of sea ? [] : crossingsAlong(coords, cum, grid, segmentIntersection, CELL, Infinity)) {
      if (!params.bridgeClasses.includes(widthOf.get(c.riverId))) continue;
      const h = BRIDGE_HALF_KM[widthOf.get(c.riverId)] ?? BRIDGE_HALF_KM.small;
      const s0 = Math.max(c.s - h, prevEnd); const s1 = Math.min(c.s + h, total);
      if (s1 - s0 < params.minPieceKm) continue;
      windows.push({ s0, s1, c });
      prevEnd = s1;
    }
    const push = (s0, s1, bridge) => {
      if (s1 - s0 < params.minPieceKm) return;
      const pc = sliceByDistance(coords, cum, s0, s1);
      const id = `LS_${String(segments.length + 1).padStart(5, '0')}`;
      segments.push({ id, link: link.id, t: st.t, k: lad.k, level: lad.level, rank: lad.rank, ...(sea ? { sea: 1 } : {}), ...(bridge ? { br: { r: bridge.c.riverId } } : {}), c: pc.flatMap(([x, y]) => [r4(x), r4(y)]) });
      if (bridge) {
        const n = (perRiver.get(bridge.c.riverId) ?? 0) + 1;
        perRiver.set(bridge.c.riverId, n);
        const ml = markerLevelOfStep(st.t);
        bridges.push({ id: `LB_${bridge.c.riverId.replace(/^R_/, '')}_${String(n).padStart(3, '0')}`, riverId: bridge.c.riverId, seg: id, link: link.id, t: st.t, mode: lad.k, lon: r4(bridge.c.lon), lat: r4(bridge.c.lat), level: ml, road: lad.k === 'road' ? ml : 0, rail: lad.k === 'rail' ? ml : 0, ang: heading(pc[0], pc.at(-1)), km: Math.round((s1 - s0) * 100) / 100 });
      }
    };
    let cur = 0;
    for (const w of windows) { push(cur, w.s0, null); push(w.s0, w.s1, w); cur = w.s1; }
    push(cur, total, null);
  }
  const nodes = [...seatOf.values()].filter((n) => nodeT.has(n.p)).map((n) => ({ ...n, t: nodeT.get(n.p) })).sort((p, q) => p.p - q.p);
  stats.route = routeStats;
  if (cachePath) await writeFile(cachePath, JSON.stringify(cache));
  stats.steps = Object.fromEntries(LADDER.map((l) => [l.id, links.filter((x) => x.t === l.t).length]));
  return {
    stats,
    file: {
      schema: LINKS_SCHEMA,
      quality: 'hypothesis',
      method: 'un collegamento per coppia di province confinanti (tracciato tra le sedi che resta dentro le due province: retta, un punto sul confine condiviso o percorso a griglia; senza percorso via terra, tratta marittima); gradino (strada sterrata, strada, strada principale, ferrovia; mai due corsie) = quello raggiunto da almeno metà del percorso migliore sulla rete di transport.json (rotaia sopra strada, autostrada = strada principale), strada sterrata senza dati; ponti dove la linea incrocia un fiume medio/grande, uno per fiume',
      source: 'Natural Earth 10m roads/railroads/populated places (pubblico dominio), rete moderna: non è quella del 1936',
      ladder: LADDER,
      params,
      checksum: idsChecksum(ids),
      provinceRefs: "indici nell'elenco ordinato delle province (come adjacency.json)",
      routes: routeStats,
      counts: { nodes: nodes.length, links: links.length, segments: segments.length, bridges: bridges.length },
      nodes,
      links,
      segments,
      bridges,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2] ?? process.env.NE_DIR;
  if (!src) { console.error('uso: node scripts/build-links.js <cartella con ne_10m_populated_places_simple.geojson>'); process.exit(2); }
  const t0 = Date.now();
  const built = await buildLinksFile(src);
  const { stats } = built;
  // declassamento delle ferrovie posteriori al 1936 (data/rail_overrides_1936.json): va riapplicato a ogni rigenerazione
  const { file, applied } = applyRailOverrides(built.file, JSON.parse(await readFile(dataUrl('rail_overrides_1936.json'), 'utf8')));
  console.log(`ferrovie posteriori al 1936 declassate: ${applied.length}`);
  const text = JSON.stringify(file);
  await writeFile(dataUrl('links.json'), `${text}\n`);
  console.log(JSON.stringify(stats));
  console.log(`data/links.json: ${JSON.stringify(file.counts)}, ${(text.length / 1e3).toFixed(0)} kB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
