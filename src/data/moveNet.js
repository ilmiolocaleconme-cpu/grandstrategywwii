// Rete di movimento dalle province della mappa e dal grafo di adiacenza (data/adjacency.json).
// SPONDE (decisione dell'utente 11/11/2026): ogni sponda di un fiume è un POSTO a sé; passare da una sponda all'altra è una marcia.
// La provincia madre di una provincia divisa resta un NOME DI COMODO: vale come la sua sponda principale (la più grande per area),
// così le posizioni salvate prima delle sponde e gli incarichi dei teatri (scritti per provincia madre) continuano a funzionare.
// Le province non divise sono un posto solo (id della madre). `provinceOf(id)` dà la provincia madre di un posto.
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

// area di un anello (gradi² riportati a km² con il coseno della latitudine): serve solo a scegliere la sponda più grande
function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  const lat = r.reduce((t, p) => t + p[1], 0) / Math.max(1, r.length);
  return Math.abs(a / 2) * 111.32 * 111.32 * Math.cos((lat * Math.PI) / 180);
}
export function areaOf(geometry) {
  if (!geometry?.coordinates) return 0;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.reduce((t, poly) => t + poly.reduce((u, ring, i) => u + (i === 0 ? 1 : -1) * ringArea(ring), 0), 0);
}

/**
 * Sponde delle province divise: { canon(id), provinceOf(id), isBank(id), isSplit(id), banksOf(madre) }. features: tasselli della mappa.
 * Sponda principale = la più grande per area (a parità l'id minore): è la stessa sponda dove la mappa disegna icone e segnalini della madre.
 */
export function bankIndex(features) {
  const banks = new Map(); const mother = new Map(); const area = new Map();
  for (const f of features ?? []) {
    const p = f.properties; const m = p.parentProvince;
    if (!m) continue;
    mother.set(p.id, m); area.set(p.id, areaOf(f.geometry));
    (banks.get(m) ?? banks.set(m, []).get(m)).push(p.id);
  }
  const main = new Map();
  for (const [m, ids] of banks) main.set(m, [...ids].sort((a, b) => area.get(b) - area.get(a) || (a < b ? -1 : 1))[0]);
  return {
    canon: (id) => main.get(id) ?? id,
    provinceOf: (id) => mother.get(id) ?? id,
    isBank: (id) => mother.has(id),
    isSplit: (id) => main.has(id),
    banksOf: (m) => [...(banks.get(m) ?? [])].sort(),
  };
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
  const bank = bankIndex(collection.features);
  // posto di un tassello: la sponda per le province divise, la provincia per le altre (le isole staccate di una madre non divisa da un fiume
  // non esistono più: le sponde sotto 100 km² sono già fuse, vedi docs/STATO_IMPLEMENTAZIONE.md)
  const nodeOf = new Map();
  const owner = new Map();
  const name = new Map();
  const box = new Map();
  const parent = new Map();
  const grow = (k, b) => { const cur = box.get(k); box.set(k, cur ? [Math.min(cur[0], b[0]), Math.min(cur[1], b[1]), Math.max(cur[2], b[2]), Math.max(cur[3], b[3])] : b); };
  for (const f of collection.features) {
    const p = f.properties;
    const m = p.parentProvince ?? p.id;
    const node = bank.isBank(p.id) ? p.id : m;
    nodeOf.set(p.id, node);
    const b = bboxOf(f.geometry);
    grow(node, b);
    if (!owner.has(node) || p.parentProvince == null) owner.set(node, p.owner);
    if (!name.has(node) || p.parentProvince == null) name.set(node, p.name ?? node);
    if (node !== m) {
      parent.set(node, m);
      if (!owner.has(m)) owner.set(m, p.owner);
      if (!name.has(m)) name.set(m, String(p.name ?? m).replace(/ \(sponda [a-z]\)$/i, ''));
    }
  }
  const nb = new Map([...new Set(nodeOf.values())].map((m) => [m, new Set()]));
  for (const f of collection.features) {
    const a = nodeOf.get(f.properties.id);
    for (const n of adj.neighbors(f.properties.id)) {
      const b = nodeOf.get(n);
      if (b && b !== a) { nb.get(a).add(b); nb.get(b).add(a); }
    }
  }
  // zone urbane: nodi propri (id della zona), collegati dai soli collegamenti di città
  const cityIds = new Set();
  for (const z of cities) {
    const id = z.properties.id;
    if (nb.has(id) || bank.isSplit(id) || cityIds.has(id)) continue; // un id già usato da una provincia non si sovrascrive
    cityIds.add(id);
    box.set(id, bboxOf(z.geometry));
    nb.set(id, new Set());
    owner.set(id, z.properties.owner ?? null);
    name.set(id, z.properties.name ?? id);
    parent.set(id, z.properties.parentProvince ?? null);
  }
  for (const l of cityLinks?.links ?? []) {
    if (!cityIds.has(l.a)) continue;
    // "access": la zona tocca un tassello preciso (una sponda, se la provincia è divisa)
    const other = l.type === 'access' ? nodeOf.get(l.b) : (cityIds.has(l.b) ? l.b : null);
    if (!other || !nb.has(other) || other === l.a) continue;
    nb.get(l.a).add(other); nb.get(other).add(l.a);
  }
  const canon = (id) => bank.canon(id);
  const centre = (m) => { const b = box.get(canon(m)) ?? box.get(m); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
  return {
    has: (m) => nb.has(m) || bank.isSplit(m),
    provinces: () => [...nb.keys()].sort(),
    neighbors: (m) => [...(nb.get(canon(m)) ?? [])].sort(),
    km: (a, b) => haversine(centre(a), centre(b)),
    owner: (m) => owner.get(m) ?? null,
    name: (m) => name.get(m) ?? m,
    centre,
    parentOf: (m) => parent.get(m) ?? null,
    isCity: (m) => cityIds.has(m),
    // sponde: posto canonico (madre divisa → sponda principale), provincia madre di un posto, sponda sì/no
    canon,
    provinceOf: (m) => (cityIds.has(m) ? m : bank.provinceOf(m)),
    isBank: (m) => bank.isBank(m),
    banksOf: (m) => bank.banksOf(m),
  };
}
