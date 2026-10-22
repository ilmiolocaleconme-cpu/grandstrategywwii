// Grafo delle zone urbane (data/city_links.json): ogni zona di data/citta_grandi.json è un NODO di movimento come una provincia
// (ci stanno truppe, aerei, antiaerea). Collegamenti, funzioni PURE senza I/O:
//  - "access": zona → tassello di provincia che la contiene; da lì si usa la rete di province (data/links.json). I collegamenti fra
//    città diverse non sono disegnati né duplicati: città → provincia → province vicine → città.
//  - "part": fra le parti della stessa città (Budapest ovest/sud/nord-est...). Se la retta fra le due parti incrocia un fiume
//    importante il collegamento passa da un ponte (stato `intact`, distruggibile e riparabile dalle regole future); sui fiumi
//    piccoli è un guado. Le parti si connettono sempre fra loro (albero di collegamento minimo + coppie vicine).
// Tutto è `quality: hypothesis`: punto rappresentativo = baricentro della parte maggiore, rete e ponti moderni, non del 1936.

import { lineRiverIntersections } from './transport.js';
import { pointInPolygon, polygonsOf } from './geometry.js';
import { kmBetween } from './links.js';

export const CITY_LINKS_SCHEMA = 'city-links-v1';
export const NEAR_PART_KM = 1; // coppie di parti più vicine di così si collegano anche fuori dall'albero minimo
const WIDTH_RANK = { small: 1, medium: 2, large: 3 };

const r4 = (x) => Math.round(x * 1e4) / 1e4;

/** Punto rappresentativo di una zona: baricentro dell'anello maggiore se cade dentro, altrimenti il punto interno di una griglia 9×9. */
export function representativePoint(geometry) {
  const polys = polygonsOf(geometry);
  const big = polys.slice().sort((a, b) => b[0].length - a[0].length)[0];
  const ring = big[0];
  const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length;
  const cy = ring.reduce((s, q) => s + q[1], 0) / ring.length;
  if (pointInPolygon(big, cx, cy)) return [cx, cy];
  const xs = ring.map((q) => q[0]); const ys = ring.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null; let bd = Infinity;
  for (let i = 1; i < 10; i += 1) for (let j = 1; j < 10; j += 1) {
    const x = x0 + ((x1 - x0) * i) / 10; const y = y0 + ((y1 - y0) * j) / 10;
    if (!pointInPolygon(big, x, y)) continue;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best ?? ring[0];
}

/** Distanza minima in km fra i vertici di due geometrie (campionata sui vertici: basta per decidere "vicine"). */
function minVertexKm(g1, g2) {
  const pts = (g) => polygonsOf(g).flatMap((p) => p[0]);
  const a = pts(g1); const b = pts(g2);
  let best = Infinity;
  const stepA = Math.max(1, Math.floor(a.length / 80)); const stepB = Math.max(1, Math.floor(b.length / 80));
  for (let i = 0; i < a.length; i += stepA) for (let j = 0; j < b.length; j += stepB) {
    const d = kmBetween(a[i][0], a[i][1], b[j][0], b[j][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Attraversamento di una retta fra due punti: il fiume più largo che incrocia, o null. */
export function crossingOf(a, b, grid, widthOf) {
  const hits = lineRiverIntersections([a, b], grid);
  let best = null;
  for (const h of hits) {
    const w = widthOf.get(h.riverId) ?? 'small';
    if (!best || (WIDTH_RANK[w] ?? 1) > (WIDTH_RANK[best.widthClass] ?? 1)) best = { riverId: h.riverId, widthClass: w, lon: r4(h.lon), lat: r4(h.lat) };
  }
  if (!best) return null;
  return { ...best, kind: best.widthClass === 'small' ? 'ford' : 'bridge', state: 'intact', hypothesis: true };
}

/**
 * Costruisce il grafo. zones: feature di citta_grandi.json; tiles: feature delle province (con `provincesAt` via `index`);
 * grid: indice dei segmenti di fiume; widthOf: Map riverId → widthClass.
 */
export function buildCityGraph({ zones, tiles, index, grid, widthOf }) {
  const nodes = zones.map((z) => {
    const [lon, lat] = representativePoint(z.geometry);
    const mother = z.properties.parentProvince;
    const hit = index.provincesAt(lon, lat);
    let tile = hit.find((t) => (t.properties.parentProvince ?? t.properties.id) === mother) ?? hit[0];
    let how = 'inside';
    if (!tile) {
      let bd = Infinity;
      for (const t of tiles.filter((x) => (x.properties.parentProvince ?? x.properties.id) === mother)) {
        const d = minVertexKm(z.geometry, t.geometry);
        if (d < bd) { bd = d; tile = t; }
      }
      how = 'nearest';
    }
    return { id: z.properties.id, cittaId: z.properties.cittaId, name: z.properties.name, lon: r4(lon), lat: r4(lat), tile: tile?.properties.id ?? null, tileHow: tile ? how : 'none' };
  });
  const byCity = new Map();
  zones.forEach((z, i) => { (byCity.get(z.properties.cittaId) ?? byCity.set(z.properties.cittaId, []).get(z.properties.cittaId)).push(i); });
  const links = nodes.filter((n) => n.tile).map((n) => ({ id: `CA_${n.id}`, type: 'access', a: n.id, b: n.tile, km: 0 }));
  for (const [, idx] of byCity) {
    if (idx.length < 2) continue;
    const pairs = [];
    for (let x = 0; x < idx.length; x += 1) for (let y = x + 1; y < idx.length; y += 1) pairs.push({ i: idx[x], j: idx[y], d: minVertexKm(zones[idx[x]].geometry, zones[idx[y]].geometry) });
    pairs.sort((p, q) => p.d - q.d);
    const comp = new Map(idx.map((i) => [i, i]));
    const root = (i) => { while (comp.get(i) !== i) i = comp.get(i); return i; };
    for (const p of pairs) {
      const ri = root(p.i); const rj = root(p.j);
      const tree = ri !== rj;
      if (!tree && p.d > NEAR_PART_KM) continue;
      if (tree) comp.set(ri, rj);
      const A = nodes[p.i]; const B = nodes[p.j];
      const crossing = crossingOf([A.lon, A.lat], [B.lon, B.lat], grid, widthOf);
      links.push({ id: `CP_${A.id}__${B.id}`, type: 'part', a: A.id, b: B.id, km: Math.max(1, Math.round(kmBetween(A.lon, A.lat, B.lon, B.lat))), gapKm: Math.round(p.d * 10) / 10, ...(crossing ? { crossing } : {}) });
    }
  }
  return { nodes, links };
}

/** Controlli del file: id unici, riferimenti esistenti, ogni zona con accesso, parti della stessa città connesse. */
export function validateCityLinks(file, { zoneIds, tileIds, riverIds } = {}) {
  const errors = [];
  if (file?.schema !== CITY_LINKS_SCHEMA) return [`city_links: schema ${file?.schema}, atteso ${CITY_LINKS_SCHEMA}`];
  const ids = new Set(file.nodes.map((n) => n.id));
  if (ids.size !== file.nodes.length) errors.push('city_links: id di nodo duplicati');
  if (zoneIds && (zoneIds.size !== ids.size || [...zoneIds].some((z) => !ids.has(z)))) errors.push('city_links: i nodi non coincidono con le zone di citta_grandi.json, rigenerare con npm run build:city-links');
  const access = new Set(file.links.filter((l) => l.type === 'access').map((l) => l.a));
  const noAccess = file.nodes.filter((n) => !access.has(n.id)).map((n) => n.id);
  if (noAccess.length) errors.push(`city_links: ${noAccess.length} zone senza accesso a una provincia (${noAccess.slice(0, 5).join(', ')})`);
  for (const l of file.links) {
    if (!ids.has(l.a)) errors.push(`city_links: ${l.id} parte da un nodo inesistente`);
    if (l.type === 'part' && !ids.has(l.b)) errors.push(`city_links: ${l.id} arriva a un nodo inesistente`);
    if (l.type === 'access' && tileIds && !tileIds.has(l.b)) errors.push(`city_links: ${l.id} punta a una provincia inesistente`);
    if (l.crossing && riverIds && !riverIds.has(l.crossing.riverId)) errors.push(`city_links: ${l.id} attraversa un fiume inesistente`);
  }
  const byCity = new Map();
  for (const n of file.nodes) (byCity.get(n.cittaId) ?? byCity.set(n.cittaId, []).get(n.cittaId)).push(n.id);
  const adj = new Map(file.nodes.map((n) => [n.id, []]));
  for (const l of file.links) if (l.type === 'part') { adj.get(l.a)?.push(l.b); adj.get(l.b)?.push(l.a); }
  for (const [city, members] of byCity) {
    const seen = new Set([members[0]]); const q = [members[0]];
    while (q.length) for (const v of adj.get(q.pop()) ?? []) if (!seen.has(v)) { seen.add(v); q.push(v); }
    if (seen.size !== members.length) errors.push(`city_links: le parti di ${city} non sono tutte collegate`);
  }
  return errors;
}
