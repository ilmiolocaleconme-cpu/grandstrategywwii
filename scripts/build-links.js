// Rigenera data/links.json: il grafo dei collegamenti per il gioco (src/data/links.js).
// Ingressi: data/transport.json (rete), data/adjacency.json (coppie di province), data/rivers*.json, le province e le
// città di Natural Earth (pubblico dominio): serve il file ne_10m_populated_places_simple.geojson, non nel repository:
//   git -C ne sparse-checkout add /geojson/ne_10m_populated_places_simple.geojson
//   node scripts/build-links.js <cartella ne/geojson>      (oppure NE_DIR=<cartella>)   `npm run build:links -- <cartella>`
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadProvinces } from './load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { CELL, buildRiverSegmentGrid, segmentIntersection } from '../src/data/transport.js';
import { BRIDGE_HALF_KM, LINKS_SCHEMA, MODES, buildChains, buildNetwork, crossingsAlong, cumulativeKm, heading, kmBetween, shortestPath, sliceByDistance } from '../src/data/links.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), 'utf8'));
const r4 = (x) => Math.round(x * 1e4) / 1e4;

export const PARAMS = { snapDeg: 0.004, seatSnapKm: 40, detourFactor: 2.5, detourExtraKm: 25, bridgeThinKm: 4, minPieceKm: 0.05 };

export async function buildLinksFile(neDir, params = PARAMS) {
  const provinces = await loadProvinces();
  const ids = provinces.features.map((f) => f.properties.id);
  const idxOf = new Map(ids.map((id, i) => [id, i]));
  const index = buildProvinceIndex(provinces);
  const provAt = (lon, lat) => { const h = index.provincesAt(lon, lat); return h.length === 0 ? -1 : idxOf.get(h[0].properties.id); };
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

  const result = { segments: [], bridges: [], links: [] };
  const stats = {};
  for (const mode of MODES) {
    const net = buildNetwork(transport.lines, mode, params.snapDeg);
    const nodeProv = new Int32Array(net.size).fill(-2);
    const provOf = (u) => { if (nodeProv[u] === -2) nodeProv[u] = provAt(net.lon[u], net.lat[u]); return nodeProv[u]; };
    const cellOf = new Map(); // griglia 0,1° dei nodi, per agganciare le sedi
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

    const paths = []; // { a, b, path }
    for (const [i, j] of adjacency.edges) {
      const u = seatNode.get(i); const v = seatNode.get(j);
      if (u === undefined || v === undefined) continue;
      const si = seatOf.get(i); const sj = seatOf.get(j);
      const straight = kmBetween(si.lon, si.lat, sj.lon, sj.lat);
      const sp = shortestPath(net, u, v, (w) => { const p = provOf(w); return p === i || p === j || p === -1; });
      if (!sp || sp.km > params.detourFactor * straight + params.detourExtraKm) continue;
      paths.push({ a: i, b: j, sp });
    }
    const usedEdges = new Set(paths.flatMap((x) => x.sp.edges));
    const { chains, edgeChain } = buildChains(net, usedEdges, new Set(seatNode.values()));

    // pezzi: ogni catena si taglia nei tratti-ponte (dove incrocia un fiume) e nei tratti normali
    const pieceIds = chains.map(() => []);
    chains.forEach((ch, ci) => {
      const coords = ch.nodes.map((u) => [net.lon[u], net.lat[u]]);
      const cum = cumulativeKm(coords);
      const total = cum[cum.length - 1];
      const crossings = crossingsAlong(coords, cum, grid, segmentIntersection, CELL, params.bridgeThinKm);
      const windows = [];
      let prevEnd = 0;
      for (const c of crossings) {
        const h = BRIDGE_HALF_KM[widthOf.get(c.riverId)] ?? BRIDGE_HALF_KM.small;
        const s0 = Math.max(c.s - h, prevEnd); const s1 = Math.min(c.s + h, total);
        if (s1 - s0 < params.minPieceKm) continue;
        windows.push({ s0, s1, c });
        prevEnd = s1;
      }
      const base = { k: mode, level: ch.level, rank: ch.rank, ...(ch.n ? { n: ch.n, y: ch.y } : {}) };
      const push = (s0, s1, bridge) => {
        if (s1 - s0 < params.minPieceKm) return;
        const pc = sliceByDistance(coords, cum, s0, s1);
        const id = `LS_${String(result.segments.length + 1).padStart(5, '0')}`;
        result.segments.push({ id, ...base, ...(bridge ? { br: { r: bridge.c.riverId } } : {}), c: pc.flatMap(([x, y]) => [r4(x), r4(y)]) });
        pieceIds[ci].push(id);
        if (bridge) {
          const n = result.bridges.filter((b) => b.riverId === bridge.c.riverId).length + 1;
          result.bridges.push({ id: `LB_${bridge.c.riverId.replace(/^R_/, '')}_${String(n).padStart(3, '0')}`, riverId: bridge.c.riverId, seg: id, mode, lon: r4(bridge.c.lon), lat: r4(bridge.c.lat), level: ch.level, road: mode === 'road' ? ch.level : 0, rail: mode === 'rail' ? ch.level : 0, ang: heading(pc[0], pc.at(-1)), km: Math.round((s1 - s0) * 100) / 100 });
        }
      };
      let cur = 0;
      for (const w of windows) { push(cur, w.s0, null); push(w.s0, w.s1, w); cur = w.s1; }
      push(cur, total, null);
    });

    for (const { a, b, sp } of paths) {
      const at = new Map(sp.nodes.map((u, k) => [u, k]));
      const order = [];
      for (const ei of sp.edges) { const ci = edgeChain.get(ei); if (order[order.length - 1] !== ci) order.push(ci); }
      const segs = [];
      for (const ci of order) {
        const ns = chains[ci].nodes;
        const rev = (at.get(ns[0]) ?? 0) > (at.get(ns.at(-1)) ?? 0);
        segs.push(...(rev ? [...pieceIds[ci]].reverse() : pieceIds[ci]));
      }
      const level = Math.min(...sp.edges.map((ei) => net.edges[ei].level));
      result.links.push({ id: `LK_${a}_${b}_${mode}`, a, b, mode, level, km: Math.round(sp.km), segs, _bridgeSegs: segs });
    }
    stats[mode] = { nodes: net.size, links: paths.length, chains: chains.length };
  }
  const bridgeBySeg = new Map(result.bridges.map((b) => [b.seg, b.id]));
  for (const l of result.links) { l.bridges = l._bridgeSegs.filter((s) => bridgeBySeg.has(s)).map((s) => bridgeBySeg.get(s)); delete l._bridgeSegs; }
  result.links.sort((p, q) => p.a - q.a || p.b - q.b || (p.mode < q.mode ? -1 : 1));

  const nodes = [...seatOf.values()].sort((p, q) => p.p - q.p);
  return {
    stats,
    file: {
      schema: LINKS_SCHEMA,
      quality: 'hypothesis',
      method: 'per ogni coppia di province confinanti: percorso di costo minimo (km × costo per livello) tra le sedi sulla rete di transport.json, solo dentro le due province; tratti usati unici (nessuna sovrapposizione); ponti = tratti del segmento che incrociano un fiume',
      source: 'Natural Earth 10m roads/railroads/populated places (pubblico dominio), rete moderna: non è quella del 1936',
      params,
      checksum: idsChecksum(ids),
      provinceRefs: "indici nell'elenco ordinato delle province (come adjacency.json)",
      counts: { nodes: nodes.length, links: result.links.length, segments: result.segments.length, bridges: result.bridges.length },
      nodes,
      links: result.links,
      segments: result.segments,
      bridges: result.bridges,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2] ?? process.env.NE_DIR;
  if (!src) { console.error('uso: node scripts/build-links.js <cartella con ne_10m_populated_places_simple.geojson>'); process.exit(2); }
  const t0 = Date.now();
  const { file, stats } = await buildLinksFile(src);
  const text = JSON.stringify(file);
  await writeFile(dataUrl('links.json'), `${text}\n`);
  console.log(JSON.stringify(stats));
  console.log(`data/links.json: ${JSON.stringify(file.counts)}, ${(text.length / 1e3).toFixed(0)} kB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
