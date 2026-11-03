// Rete di movimento tra PROVINCE MADRI, dalle province della mappa e dal grafo di adiacenza (data/adjacency.json).
// Le sotto-province (sponde, isole di una madre) si fondono nella madre; due madri sono vicine se lo sono due loro parti.
// Le ZONE URBANE (citta_grandi.json) sono nodi a sé, come le province: si entra e si esce da esse. Collegamenti da
// data/city_links.json: "access" zona → tassello di provincia (la zona è vicina alla madre di quel tassello), "part" fra
// parti della stessa città. Una zona ha `parentOf` = la sua madre, per ereditarne il controllo finché non ne ha uno proprio.
// Distanza = tra i centri dei riquadri (in gradi → km con la formula dell’emiverseno (haversine)): APPROSSIMAZIONE dichiarata.
import { buildAdjacency } from './adjacency.js';

const R_KM = 6371;
function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bboxOf(geometry) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else for (const k of c) walk(k);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  return [x0, y0, x1, y1];
}

/**
 * Rete { has, neighbors, km, owner, centre, name, parentOf } sulle madri e sulle zone urbane.
 * collection: FeatureCollection delle province (senza città); adjacencyFile: data/adjacency.json.
 * opts (facoltativo): { cities: feature delle zone urbane (citta_grandi.json), cityLinks: data/city_links.json }.
 */
export function buildMoveNet(collection, adjacencyFile, { cities = [], cityLinks = null } = {}) {
  const adj = buildAdjacency(collection, adjacencyFile); // lancia se il file non corrisponde alle province
  const motherOf = new Map();
  const owner = new Map();
  const name = new Map();
  const box = new Map();
  const parent = new Map();
  for (const f of collection.features) {
    const p = f.properties;
    const m = p.parentProvince ?? p.id;
    motherOf.set(p.id, m);
    if (!owner.has(m) || p.parentProvince == null) owner.set(m, p.owner);
    if (!name.has(m) || p.parentProvince == null) name.set(m, p.name ?? m);
    const b = bboxOf(f.geometry);
    const cur = box.get(m);
    box.set(m, cur ? [Math.min(cur[0], b[0]), Math.min(cur[1], b[1]), Math.max(cur[2], b[2]), Math.max(cur[3], b[3])] : b);
  }
  const nb = new Map([...box.keys()].map((m) => [m, new Set()]));
  for (const f of collection.features) {
    const a = motherOf.get(f.properties.id);
    for (const n of adj.neighbors(f.properties.id)) {
      const b = motherOf.get(n);
      if (b && b !== a) { nb.get(a).add(b); nb.get(b).add(a); }
    }
  }
  // zone urbane: nodi propri (id della zona), collegati dai soli collegamenti di città
  const cityIds = new Set();
  for (const z of cities) {
    const id = z.properties.id;
    if (box.has(id) || cityIds.has(id)) continue; // un id già usato da una provincia non si sovrascrive
    cityIds.add(id);
    box.set(id, bboxOf(z.geometry));
    nb.set(id, new Set());
    owner.set(id, z.properties.owner ?? null);
    name.set(id, z.properties.name ?? id);
    parent.set(id, z.properties.parentProvince ?? null);
  }
  for (const l of cityLinks?.links ?? []) {
    if (!cityIds.has(l.a)) continue;
    const other = l.type === 'access' ? motherOf.get(l.b) : (cityIds.has(l.b) ? l.b : null);
    if (!other || !nb.has(other) || other === l.a) continue;
    nb.get(l.a).add(other); nb.get(other).add(l.a);
  }
  const centre = (m) => { const b = box.get(m); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
  return {
    has: (m) => box.has(m),
    provinces: () => [...box.keys()].sort(),
    neighbors: (m) => [...(nb.get(m) ?? [])].sort(),
    km: (a, b) => haversine(centre(a), centre(b)),
    owner: (m) => owner.get(m) ?? null,
    name: (m) => name.get(m) ?? m,
    centre,
    parentOf: (m) => (cityIds.has(m) ? parent.get(m) ?? null : null),
    isCity: (m) => cityIds.has(m),
  };
}
