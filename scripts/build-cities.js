// Rifà i contorni delle città a parte (data/citta_grandi.json) con le aree urbane vere di Natural Earth.
//
//   node scripts/build-cities.js --dry                        (stampa le statistiche, non scrive nulla)
//   node scripts/build-cities.js --urban=<ne_10m_urban_areas.geojson>   (prima volta: crea il sottoinsieme in data/sources/)
//   node scripts/build-cities.js                              (riscrive data/citta_grandi.json dal sottoinsieme)
//
// Per ogni città (cittaId) si prende: il centro e il raggio stimato dall'area attuale (disco di area stimata),
// i poligoni urbani che cadono nel cerchio di sicurezza (1,5 volte quel raggio), e li si ritaglia sulla provincia
// madre (o sulla sponda del fiume, per le città divise in parti). Dove Natural Earth non ha un'area urbana nel
// cerchio resta il disco attuale. Id, nomi, parti e proprietà restano invariati.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { intersect, polygonArea } from '../src/data/polyclip.js';
import { ringAreaKm2 } from '../src/map/geo.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const SUBSET = 'sources/ne_urban_areas_citta.json';
export const MIN_AREA_KM2 = 3; // sotto questa area totale la città resta il disco attuale
export const SAFETY = 2.0; // cerchio massimo = SAFETY x raggio stimato; fra città vicine decide la cella di Voronoi (vedi cellOf)
const KM_PER_DEG = 111.195;
const round6 = (v) => Math.round(v * 1e6) / 1e6;

const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const bboxOfPolys = (polys) => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
const bboxHit = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

function polygonAreaKm2(poly) {
  return poly.reduce((s, r, i) => s + (i === 0 ? 1 : -1) * ringAreaKm2(r), 0);
}

/** Centro (media pesata dai vertici) e area totale (km2) di un gruppo di parti. */
function groupCentre(parts) {
  let x = 0; let y = 0; let n = 0; let area = 0;
  for (const f of parts) {
    area += f.properties.areaKm2;
    for (const p of polysOf(f.geometry)) for (const [lon, lat] of p[0]) { x += lon; y += lat; n += 1; }
  }
  return { lon: x / n, lat: y / n, areaKm2: area };
}

function disc(lon, lat, radiusKm, n = 72) {
  const dLat = radiusKm / KM_PER_DEG;
  const dLon = radiusKm / (KM_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({ length: n }, (_, i) => [lon + dLon * Math.cos((2 * Math.PI * i) / n), lat + dLat * Math.sin((2 * Math.PI * i) / n)]);
  return [[...ring, ring[0]]];
}

/**
 * Regione di competenza di una città: il suo cerchio massimo ritagliato dalle celle di Voronoi con le città vicine
 * (retta equidistante fra i due centri). Due città sulla stessa area urbana (Ruhr, Rhein-Main) si dividono l'area con una
 * linea retta invece di due archi di cerchio. Calcolo in coordinate scalate (lon x cos(lat), lat), poligono convesso.
 */
export function cellOf(centre, radiusKm, neighbours) {
  const c = Math.cos((centre.lat * Math.PI) / 180);
  const to = (p) => [(p[0] - centre.lon) * c, p[1] - centre.lat];
  const back = (q) => [centre.lon + q[0] / c, centre.lat + q[1]];
  let poly = disc(centre.lon, centre.lat, radiusKm)[0].slice(0, -1).map(to);
  for (const n of neighbours) {
    const [nx, ny] = to([n.lon, n.lat]);
    const side = (q) => (q[0] - nx / 2) * nx + (q[1] - ny / 2) * ny; // <= 0: dalla parte della città
    const out = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const sa = side(a);
      const sb = side(b);
      if (sa <= 0) out.push(a);
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const t = sa / (sa - sb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    poly = out;
    if (poly.length < 3) return null;
  }
  const ring = poly.map(back);
  return [[...ring, ring[0]]];
}

/** Calcola la nuova geometria per ogni parte di una città. Restituisce { parts: [{id, polys|null}], urban: bool }. */
export function cityGeometry(parts, regionOf, urbanIndex, neighbours = []) {
  const { lon, lat, areaKm2 } = groupCentre(parts);
  const radius = Math.sqrt(areaKm2 / Math.PI) * SAFETY;
  const bound = cellOf({ lon, lat }, radius, neighbours) ?? disc(lon, lat, radius);
  const bb = bboxOfPolys([bound]);
  const inBound = [];
  for (const u of urbanIndex) {
    if (!bboxHit(u.bbox, bb)) continue;
    for (const piece of intersect(u.poly, bound)) inBound.push(piece);
  }
  const result = parts.map((f) => {
    const region = regionOf(f);
    if (!region) return { id: f.id, polys: null, reason: 'regione non trovata' };
    const out = [];
    for (const piece of inBound) for (const rp of region) for (const q of intersect(piece, rp)) if (polygonArea(q) > 1e-10) out.push(q);
    return { id: f.id, polys: out.length ? out : null, reason: out.length ? null : 'nessuna area urbana' };
  });
  return { parts: result, centre: { lon, lat }, radiusKm: radius, boundPieces: inBound.length };
}

async function loadUrban(arg) {
  if (arg) {
    const src = JSON.parse(await readFile(arg, 'utf8'));
    return src.features.filter((f) => f.geometry).flatMap((f) => polysOf(f.geometry).map((poly) => ({ poly, bbox: bboxOfPolys([poly]) })));
  }
  const sub = JSON.parse(await readFile(dataUrl(SUBSET), 'utf8'));
  return sub.polygons.map((poly) => ({ poly, bbox: bboxOfPolys([poly]) }));
}

export async function main(argv) {
  const dry = argv.includes('--dry');
  const urbanArg = argv.find((a) => a.startsWith('--urban='))?.slice(8);
  const cities = JSON.parse(await readFile(dataUrl('citta_grandi.json'), 'utf8'));
  const provinces = await loadProvinces();
  const byId = new Map(provinces.features.map((f) => [f.properties.id, f]));
  const bySponda = new Map();
  for (const f of provinces.features) {
    if (!f.properties.sponda_fiume) continue;
    const k = `${f.properties.parentProvince}|${f.properties.sponda}`; // nelle province la sponda è un numero: 1, 2, ...
    bySponda.set(k, f);
  }
  // nelle città la sponda è una lettera: A = 1, B = 2, ...
  const spondaIndex = (letter) => (/^[A-Z]$/.test(letter) ? letter.charCodeAt(0) - 64 : null);
  const groups = new Map();
  for (const f of cities.features) {
    const g = f.properties.cittaId ?? f.id;
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  const provinceOf = (cf) => {
    const m = cf.properties.parentProvince;
    const letter = cf.properties.sponda;
    return letter ? bySponda.get(`${m}|${spondaIndex(letter)}`) : byId.get(m);
  };
  // Città divise in parti per cui la provincia/sponda non basta a distinguere le parti (senza sponda, o due parti sulla
  // stessa sponda: Varsavia, Stalingrado, Firenze, Kiev...): il taglio lungo il fiume sta già nelle parti attuali,
  // quindi la regione di ritaglio è la parte attuale stessa (la città resta dentro il disco di prima).
  const regioniAttuali = new Set();
  for (const [g, parts] of groups) {
    if (parts.length < 2) { if (!provinceOf(parts[0])) regioniAttuali.add(g); continue; }
    const keys = parts.map((f) => provinceOf(f)?.properties.id ?? null);
    if (keys.some((k) => k === null) || new Set(keys).size < keys.length) regioniAttuali.add(g);
  }
  const regionOf = (cf) => {
    if (regioniAttuali.has(cf.properties.cittaId ?? cf.id)) return polysOf(cf.geometry);
    return polysOf(provinceOf(cf).geometry);
  };

  const centres = new Map([...groups].map(([g, parts]) => [g, groupCentre(parts)]));
  const neighboursOf = (g) => {
    const me = centres.get(g);
    const reach = (Math.sqrt(me.areaKm2 / Math.PI) * SAFETY * 2) / KM_PER_DEG * 1.6; // gradi: cerchio massimo di una città grande e un vicino
    const near = [];
    for (const [h, o] of centres) {
      if (h === g) continue;
      const d = Math.hypot((o.lon - me.lon) * Math.cos((me.lat * Math.PI) / 180), o.lat - me.lat);
      if (d < reach + (Math.sqrt(o.areaKm2 / Math.PI) * SAFETY) / KM_PER_DEG) near.push({ lon: o.lon, lat: o.lat });
    }
    return near;
  };

  const urban = await loadUrban(urbanArg);
  // sottoinsieme: solo le aree urbane che toccano il cerchio di sicurezza di almeno una città
  const bounds = [...groups.values()].map((parts) => {
    const { lon, lat, areaKm2 } = groupCentre(parts);
    return bboxOfPolys([disc(lon, lat, Math.sqrt(areaKm2 / Math.PI) * SAFETY)]);
  });
  const needed = urban.filter((u) => bounds.some((b) => bboxHit(u.bbox, b)));
  if (urbanArg && !dry) {
    await writeFile(dataUrl(SUBSET), `${JSON.stringify({ schema: 'ne-urban-areas-subset-v1', source: 'Natural Earth 10m urban areas (ne_10m_urban_areas)', license: 'Public Domain (Natural Earth)', note: 'Solo le aree urbane che toccano il cerchio di sicurezza di una città di data/citta_grandi.json (scripts/build-cities.js).', polygons: needed.map((u) => u.poly) })}\n`);
    console.log(`sottoinsieme scritto: ${needed.length} poligoni urbani su ${urban.length}`);
  }

  const stats = { groups: 0, urban: 0, disc: 0, partsKept: 0, partsDisc: 0, noRegion: 0, ratio: [] };
  const newGeom = new Map();
  const flag = new Map();
  for (const [gid, parts] of groups) {
    stats.groups += 1;
    const r = cityGeometry(parts, regionOf, needed, neighboursOf(gid));
    const areaNuova = r.parts.reduce((t, p) => t + (p.polys ? p.polys.reduce((a, q) => a + polygonAreaKm2(q), 0) : 0), 0);
    if (areaNuova < MIN_AREA_KM2) for (const p of r.parts) p.polys = null; // quasi nulla: meglio il disco che una striscia
    const anyUrban = r.parts.some((p) => p.polys);
    if (r.parts.some((p) => p.reason === 'regione non trovata')) stats.noRegion += 1;
    if (!anyUrban) { stats.disc += 1; for (const p of r.parts) flag.set(p.id, 'disco'); continue; }
    stats.urban += 1;
    for (const p of r.parts) {
      if (p.polys) {
        newGeom.set(p.id, p.polys);
        flag.set(p.id, 'urbana');
        stats.partsKept += 1;
      } else {
        flag.set(p.id, 'disco');
        stats.partsDisc += 1;
      }
    }
    const old = parts.reduce((s, f) => s + f.properties.areaKm2, 0);
    const nu = r.parts.reduce((s, p) => s + (p.polys ? p.polys.reduce((a, q) => a + polygonAreaKm2(q), 0) : 0), 0);
    stats.ratio.push([gid, old, nu]);
  }
  console.log(`città: ${stats.groups}; con area urbana: ${stats.urban}; restano dischi: ${stats.disc}; regioni non trovate: ${stats.noRegion}`);
  console.log(`parti: ${stats.partsKept} nuove, ${stats.partsDisc} restano disco (città con area urbana solo in altre parti)`);
  const sorted = stats.ratio.map(([g, o, n]) => [g, o, n, n / o]).sort((a, b) => a[3] - b[3]);
  console.log('area nuova / vecchia: min', sorted[0]?.[3].toFixed(2), 'mediana', sorted[Math.floor(sorted.length / 2)]?.[3].toFixed(2), 'max', sorted.at(-1)?.[3].toFixed(2));
  console.log('più piccole:', sorted.slice(0, 5).map((s) => `${s[0]} ${s[1].toFixed(0)}->${s[2].toFixed(0)}`).join('; '));
  console.log('più grandi:', sorted.slice(-5).map((s) => `${s[0]} ${s[1].toFixed(0)}->${s[2].toFixed(0)}`).join('; '));
  if (dry) return { cities, newGeom, flag };

  const features = cities.features.map((f) => {
    const polys = newGeom.get(f.id);
    const props = { ...f.properties, geometria: flag.get(f.id) ?? 'disco' };
    if (!polys) return { ...f, properties: props };
    const coords = polys.map((p) => p.map((r) => r.map(([x, y]) => [round6(x), round6(y)])));
    const area = coords.reduce((s, p) => s + polygonAreaKm2(p), 0);
    props.areaKm2 = Math.round(area * 10) / 10;
    props.source = 'NE urban areas 10m (poligoni reali) ritagliati sulla provincia madre';
    return { ...f, properties: props, geometry: coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords } };
  });
  await writeFile(dataUrl('citta_grandi.json'), `${JSON.stringify({ ...cities, features })}\n`);
  console.log('data/citta_grandi.json riscritto');
  return { cities, newGeom, flag };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
