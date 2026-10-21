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
import { splitPolygon } from '../src/data/splitline.js';
import { ringAreaKm2 } from '../src/map/geo.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const SUBSET = 'sources/ne_urban_areas_citta.json';
const BASE = 'sources/citta_base.json';
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


export const COVER_RATIO = 0.5; // l'area urbana riempie almeno questa parte della provincia: la città prende tutta la provincia
export const COVER_MAX_KM2 = 3000; // ...ma solo per province non enormi
export const ZONE_MIN_KM2 = 3; // una zona (parte cliccabile) ha almeno questa area; i pezzi più piccoli si uniscono a una zona vicina
const dedupe = (ring) => ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);

/**
 * Linee dei fiumi (data/rivers_geo.json). I tratti di uno stesso fiume (separati dove passa in un lago) si ricollegano
 * per estremi coincidenti, così un fiume che attraversa una città è una linea sola.
 */
export function chainLines(lines) {
  const key = (p) => `${p[0]},${p[1]}`;
  const work = lines.map((l) => [...l]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < work.length; i += 1) {
      for (let j = 0; j < work.length; j += 1) {
        if (i === j) continue;
        const a = work[i];
        const b = work[j];
        let next = null;
        if (key(a.at(-1)) === key(b[0])) next = [...a, ...b.slice(1)];
        else if (key(a.at(-1)) === key(b.at(-1))) next = [...a, ...[...b].reverse().slice(1)];
        else if (key(a[0]) === key(b[0])) next = [...[...a].reverse(), ...b.slice(1)];
        if (next) { work.splice(Math.max(i, j), 1); work.splice(Math.min(i, j), 1, next); merged = true; break outer; }
      }
    }
  }
  return work;
}

async function readRivers() {
  const g = JSON.parse(await readFile(dataUrl('rivers_geo.json'), 'utf8'));
  const byRiver = new Map();
  for (const f of g.features) {
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    byRiver.set(f.properties.riverId, [...(byRiver.get(f.properties.riverId) ?? []), ...parts]);
  }
  return [...byRiver.values()].flatMap(chainLines);
}

/** Divide ogni poligono dai fiumi: [{ src: indice del poligono di partenza, polygon, area }]. */
function splitParts(polys, lines) {
  const items = [];
  polys.forEach((poly, src) => {
    for (const piece of splitPolygon(poly, lines)) items.push({ src, polygon: piece, area: polygonAreaKm2(piece) });
  });
  return items;
}

const centreOf = (polys) => {
  let x = 0; let y = 0; let n = 0;
  for (const p of polys) for (const [lon, lat] of p[0]) { x += lon; y += lat; n += 1; }
  return [x / n, y / n];
};

/**
 * Zone cliccabili di una città: per ogni parte attuale, i pezzi del poligono più grande (se >= ZONE_MIN_KM2 ciascuno);
 * i frammenti degli altri poligoni e i pezzi minuscoli si uniscono alla zona più vicina della stessa parte.
 */
function buildZones(pieces) {
  const zones = [];
  for (const { f, urban, cover, items } of pieces) {
    const bySrc = new Map();
    for (const it of items) bySrc.set(it.src, (bySrc.get(it.src) ?? 0) + it.area);
    const main = [...bySrc].sort((a, b) => b[1] - a[1])[0]?.[0];
    const mine = items.filter((it) => it.src === main).sort((a, b) => b.area - a.area);
    let core = mine.filter((it) => it.area >= ZONE_MIN_KM2);
    if (!core.length) core = mine.slice(0, 1);
    const local = core.map((it) => ({ origin: f, urban, cover, polys: [it.polygon], area: it.area }));
    for (const it of items) {
      if (core.includes(it)) continue;
      const [cx, cy] = centreOf([it.polygon]);
      let best = local[0];
      let bd = Infinity;
      for (const z of local) { const [zx, zy] = centreOf(z.polys); const d = Math.hypot(zx - cx, zy - cy); if (d < bd) { bd = d; best = z; } }
      best.polys.push(it.polygon);
      best.area += it.area;
    }
    zones.push(...local);
  }
  return zones;
}

/** Nomi: la zona più grande porta il nome della città; le altre il punto cardinale rispetto ad essa (con numero se si ripete). */
function nameZones(zones, baseName) {
  const sorted = [...zones].sort((a, b) => b.area - a.area);
  const [mx, my] = centreOf(sorted[0].polys);
  const used = new Map();
  return sorted.map((z, i) => {
    if (i === 0) return { ...z, name: baseName };
    const [x, y] = centreOf(z.polys);
    const dx = (x - mx) * Math.cos((my * Math.PI) / 180);
    const dy = y - my;
    const dir = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'sud' : 'nord') : (dx > 0 ? 'est' : 'ovest');
    const n = (used.get(dir) ?? 0) + 1;
    used.set(dir, n);
    return { ...z, name: n === 1 ? `${baseName} ${dir}` : `${baseName} ${dir} ${n}` };
  });
}

export async function main(argv) {
  const dry = argv.includes('--dry');
  const urbanArg = argv.find((a) => a.startsWith('--urban='))?.slice(8);
  const cities = JSON.parse(await readFile(dataUrl(BASE), 'utf8')); // punto di partenza fisso: i dischi originali (le zone nuove non rientrano nel calcolo)
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

  const lines = (await readRivers()).filter((l) => l.length >= 2);
  const partById = new Map(cities.features.map((f) => [f.id, f]));
  const stats = { groups: 0, urban: 0, disc: 0, cover: 0, zonesTotal: 0, split: 0, ratio: [] };
  const out = [];
  for (const [gid, parts] of groups) {
    stats.groups += 1;
    const r = cityGeometry(parts, regionOf, needed, neighboursOf(gid));
    const areaNuova = r.parts.reduce((t, p) => t + (p.polys ? p.polys.reduce((a, q) => a + polygonAreaKm2(q), 0) : 0), 0);
    if (areaNuova < MIN_AREA_KM2) for (const p of r.parts) p.polys = null; // quasi nulla: meglio il disco che una striscia
    const anyUrban = r.parts.some((p) => p.polys);
    if (anyUrban) stats.urban += 1; else stats.disc += 1;
    // Città che riempie la sua provincia (Berlino e il suo Gau): la provincia si copre tutta, non resta un "territorio" attorno.
    if (!regioniAttuali.has(gid)) {
      for (const p of r.parts) {
        if (!p.polys) continue;
        const region = regionOf(partById.get(p.id));
        const regionArea = region.reduce((t, q) => t + polygonAreaKm2(q), 0);
        const urbanArea = p.polys.reduce((t, q) => t + polygonAreaKm2(q), 0);
        if (regionArea < COVER_MAX_KM2 && urbanArea / regionArea >= COVER_RATIO) { p.polys = region; p.cover = true; stats.cover += 1; }
      }
    }
    // poligoni finali di ogni parte attuale (area urbana, provincia intera o disco di prima), poi divisi dai fiumi
    const pieces = parts.map((f) => {
      const res = r.parts.find((p) => p.id === f.id);
      const polys = res?.polys ?? polysOf(f.geometry);
      return { f, urban: Boolean(res?.polys), cover: Boolean(res?.cover), items: splitParts(polys, lines) };
    });
    const zones = buildZones(pieces);
    stats.zonesTotal += zones.length;
    if (zones.length > parts.length) stats.split += 1;
    const baseName = parts[0].properties.name.replace(/ \((sponda [A-Z])\)$/, '').replace(/ (sud|nord|est|ovest)( \d+)?$/, '');
    const named = nameZones(zones, baseName);
    named.forEach((z, i) => {
      const coords = z.polys.map((poly) => poly.map((ring) => dedupe(ring.map(([x, y]) => [round6(x), round6(y)]))));
      const area = coords.reduce((s2, poly) => s2 + polygonAreaKm2(poly), 0);
      const o = z.origin;
      const zoneId = named.length === 1 ? gid : `${gid}_P${i + 1}`;
      const props = {
        ...o.properties,
        id: zoneId,
        name: z.name,
        parti: named.length,
        geometria: z.urban ? 'urbana' : 'disco',
        areaKm2: Math.round(area * 10) / 10,
      };
      if (z.urban) props.source = z.cover ? 'NE urban areas 10m (aree reali): la città riempie la provincia madre' : 'NE urban areas 10m (poligoni reali) ritagliati sulla provincia madre';
      if (named.length > parts.length) props.zone = 'divisa dai fiumi (data/rivers_geo.json)';
      out.push({
        ...o,
        id: zoneId,
        properties: props,
        geometry: coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords },
      });
    });
    const old = parts.reduce((s2, f) => s2 + f.properties.areaKm2, 0);
    stats.ratio.push([gid, old, named.reduce((s2, z) => s2 + z.area, 0)]);
  }
  console.log(`città: ${stats.groups}; con area urbana: ${stats.urban}; restano dischi: ${stats.disc}; provincia coperta (città = provincia): ${stats.cover}; regioni non trovate: 0`);
  console.log(`zone: ${stats.zonesTotal} (prima ${cities.features.length}); città divise in più zone dai fiumi: ${stats.split}`);
  const sorted = stats.ratio.map(([g, o, n]) => [g, o, n, n / o]).sort((a, b) => a[3] - b[3]);
  console.log('area nuova / vecchia: min', sorted[0]?.[3].toFixed(2), 'mediana', sorted[Math.floor(sorted.length / 2)]?.[3].toFixed(2), 'max', sorted.at(-1)?.[3].toFixed(2));
  if (dry) return { cities, out };
  await writeFile(dataUrl('citta_grandi.json'), `${JSON.stringify({ ...cities, features: out })}\n`);
  console.log('data/citta_grandi.json riscritto');
  return { cities, out };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
