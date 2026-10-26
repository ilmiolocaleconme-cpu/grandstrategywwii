// Città del resto del mondo (fuori dalle nazioni che hanno già città in data/sources/citta_base.json).
//
//   node scripts/build-cities-world.js <cartella geojson di Natural Earth>
//
// Aggiunge a data/sources/citta_base.json (i dischi di partenza) e a data/sources/ne_places_citta.json (nomi originali) le città
// di Natural Earth 10m populated places con almeno MIN_POP abitanti (POP_MAX) più le capitali (ADM0CAP = 1) con almeno
// CAPITAL_MIN_POP, che cadono in una provincia di una nazione senza città. Idempotente: le voci già prodotte da questo script
// (`source` con la dicitura di SRC_TAG) si rifanno da zero; le altre non si toccano.
// Poi, per avere aree urbane reali, fiumi e zone:
//   node scripts/build-cities.js --urban=<NE>/ne_10m_urban_areas.geojson
// e a seguire i derivati (build:city-links, build:adjacency se serve, build:labels, build:links).
//
// L'area del disco di partenza si stima dalla popolazione con una regressione log-log sulle città già nel catalogo
// (stampata a ogni esecuzione): è una stima, poi sostituita dall'area urbana vera dove Natural Earth la ha.
import { readFile, writeFile } from 'node:fs/promises';
import { loadProvinces } from './load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { isLatin } from './city-names.js';

const NE = process.argv[2];
if (!NE) {
  console.error('Uso: node scripts/build-cities-world.js <cartella geojson di Natural Earth>');
  process.exit(1);
}
export const MIN_POP = 300000;
export const CAPITAL_MIN_POP = 50000;
const SNAP_MAX_DEG = 0.3; // aggancio alla terra: massimo circa 33 km
const SRC_TAG = 'NE populated places 10m + urban areas, world';
const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);
const readJson = async (u) => JSON.parse(await readFile(u, 'utf8'));
const KM_PER_DEG = 111.195;

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
function disc(lon, lat, radiusKm, n = 72) {
  const dLat = radiusKm / KM_PER_DEG;
  const dLon = radiusKm / (KM_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({ length: n }, (_, i) => [lon + dLon * Math.cos((2 * Math.PI * i) / n), lat + dLat * Math.sin((2 * Math.PI * i) / n)].map((v) => Math.round(v * 1e6) / 1e6));
  return [[...ring, ring[0]]];
}

const places = (await readJson(`${NE}/ne_10m_populated_places.geojson`)).features;
const simple = (await readJson(`${NE}/ne_10m_populated_places_simple.geojson`)).features;
const popByNe = new Map(simple.map((f) => [String(f.properties.ne_id), f.properties.pop_max]));
const base = await readJson(dataUrl('sources/citta_base.json'));
const subset = await readJson(dataUrl('sources/ne_places_citta.json'));

const isWorld = (f) => String(f.properties.source ?? '').includes(SRC_TAG);
const kept = base.features.filter((f) => !isWorld(f));
for (const k of Object.keys(subset.cities)) if (subset.cities[k].world) delete subset.cities[k];
const covered = new Set(kept.map((f) => f.properties.owner));

// regressione area ~ pop sulle città esistenti
const pts = [];
for (const f of kept) {
  const place = subset.cities[f.properties.cittaId ?? f.id];
  const pop = place && popByNe.get(String(place.ne));
  if (pop > 1000 && f.properties.areaKm2 > 1 && (f.properties.parti ?? 1) === 1) pts.push([Math.log(pop), Math.log(f.properties.areaKm2)]);
}
const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
const a = my - b * mx;
const areaOf = (pop) => Math.max(15, Math.min(1500, Math.exp(a + b * Math.log(pop))));
console.log(`regressione area~pop su ${pts.length} città: ln(area) = ${a.toFixed(3)} + ${b.toFixed(3)} ln(pop)`);

const index = buildProvinceIndex(await loadProvinces());
const placeNames = new Map(); // ne_id -> righe NE complete
for (const f of places) placeNames.set(String(f.properties.NE_ID ?? f.properties.ne_id), f.properties);

const cand = [];
for (const f of simple) {
  const p = f.properties;
  const pop = p.pop_max;
  const capital = p.adm0cap === 1;
  if (!(pop >= MIN_POP || (capital && pop >= CAPITAL_MIN_POP))) continue;
  let [lon, lat] = f.geometry.coordinates;
  let hit = index.provincesAt(lon, lat)[0];
  let snapKm = 0;
  if (!hit) {
    // città sulla costa o su un estuario (New York, Buenos Aires, Lagos...): il punto cade in mare perché i confini delle province sono
    // generalizzati. Si aggancia al punto di terra più vicino (anelli di raggio crescente, fino a SNAP_MAX_DEG).
    outer: for (let r = 0.03; r <= SNAP_MAX_DEG + 1e-9; r += 0.03) {
      for (let k = 0; k < 24; k += 1) {
        const ang = (2 * Math.PI * k) / 24;
        const x = lon + (r * Math.cos(ang)) / Math.cos((lat * Math.PI) / 180);
        const y = lat + r * Math.sin(ang);
        const h = index.provincesAt(x, y)[0];
        if (h) { hit = h; snapKm = Math.round(r * KM_PER_DEG * 10) / 10; lon = x; lat = y; break outer; }
      }
    }
  }
  if (!hit) continue;
  const owner = hit.properties.owner;
  if (covered.has(owner)) continue;
  const full = placeNames.get(String(p.ne_id));
  if (!full) continue;
  cand.push({ p, pop, lon, lat, hit, owner, full, capital, snapKm });
}
cand.sort((x, y) => y.pop - x.pop);

const used = new Set(kept.map((f) => f.id));
const features = [];
const names = {};
for (const c of cand) {
  const row = c.full;
  const itName = [row.NAME_IT, row.NAME_EN, row.NAMEASCII, row.NAME].find((n) => isLatin(n)) ?? row.NAMEASCII ?? row.NAME;
  let id = `P_${c.owner}_${slug(itName)}_CITTA`;
  if (used.has(id)) id = `${id}_${c.p.ne_id}`;
  used.add(id);
  const hp = c.hit.properties;
  const props = {
    id, name: itName, owner: c.owner, kind: 'citta', parentProvince: hp.sponda_fiume ? hp.parentProvince : hp.id, cittaId: id, parti: 1,
    ...(hp.sponda_fiume ? { sponda: String.fromCharCode(64 + Number(hp.sponda)) } : {}),
    nomeDaVerificare: true, areaKm2: Math.round(areaOf(c.pop) * 10) / 10, borderQuality: 'hypothesis',
    source: `${SRC_TAG}: popolazione NE ${c.pop}${c.capital ? ', capitale' : ''}${c.snapKm ? `; centro agganciato alla terra più vicina (${c.snapKm} km: il punto NE cade fuori dai confini generalizzati)` : ''}; disco di area stimata dalla popolazione`,
  };
  features.push({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: disc(c.lon, c.lat, Math.sqrt(props.areaKm2 / Math.PI)) } });
  const keep = {};
  for (const k of Object.keys(row)) if (k === 'NAME' || k === 'NAMEASCII' || k === 'ADM0NAME' || k.startsWith('NAME_')) if (row[k]) keep[k] = row[k];
  names[id] = { ne: c.p.ne_id, distKm: 0, basis: 'nome', world: true, names: keep };
}

base.features = [...kept, ...features];
subset.cities = { ...subset.cities, ...names };
await writeFile(dataUrl('sources/citta_base.json'), `${JSON.stringify(base)}\n`);
await writeFile(dataUrl('sources/ne_places_citta.json'), `${JSON.stringify(subset)}\n`);
const by = {};
for (const f of features) by[f.properties.owner] = (by[f.properties.owner] ?? 0) + 1;
console.log(JSON.stringify({ nuove: features.length, nazioni: Object.keys(by).length, top: Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 12) }));
