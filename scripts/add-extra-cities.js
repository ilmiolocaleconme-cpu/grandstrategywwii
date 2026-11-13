// Aggiunge a data/sources/citta_base.json le città di data/sources/citta_extra.json (dischi di partenza, come build-cities-world.js).
//   node scripts/add-extra-cities.js        poi: node scripts/build-cities.js e i derivati (build:city-links, build:labels, build:links, ...)
// Idempotente: le voci già prodotte (source con SRC_TAG) si rifanno da zero; le altre non si toccano. Nessuna rete.
import { readFile, writeFile } from 'node:fs/promises';
import { loadProvinces } from './load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';

const SRC_TAG = 'Città extra per cantieri navali (coordinate approssimate)';
const SNAP_MAX_DEG = 0.3;
const KM_PER_DEG = 111.195;
const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);
const readJson = async (u) => JSON.parse(await readFile(u, 'utf8'));
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
function disc(lon, lat, radiusKm, n = 72) {
  const dLat = radiusKm / KM_PER_DEG;
  const dLon = radiusKm / (KM_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({ length: n }, (_, i) => [lon + dLon * Math.cos((2 * Math.PI * i) / n), lat + dLat * Math.sin((2 * Math.PI * i) / n)].map((v) => Math.round(v * 1e6) / 1e6));
  return [[...ring, ring[0]]];
}

const extra = await readJson(dataUrl('sources/citta_extra.json'));
const base = await readJson(dataUrl('sources/citta_base.json'));
const subset = await readJson(dataUrl('sources/ne_places_citta.json'));
const isMine = (f) => String(f.properties.source ?? '').includes(SRC_TAG);
const kept = base.features.filter((f) => !isMine(f));
for (const k of Object.keys(subset.cities)) if (subset.cities[k].extra) delete subset.cities[k];
const index = buildProvinceIndex(await loadProvinces());
const used = new Set(kept.map((f) => f.id));
const features = []; const names = {};
for (const c of extra.cities) {
  let { lon, lat } = c; let snapKm = 0;
  let hit = index.provincesAt(lon, lat)[0];
  if (!hit) {
    outer: for (let r = 0.03; r <= SNAP_MAX_DEG + 1e-9; r += 0.03) {
      for (let k = 0; k < 24; k += 1) {
        const ang = (2 * Math.PI * k) / 24;
        const x = lon + (r * Math.cos(ang)) / Math.cos((lat * Math.PI) / 180); const y = lat + r * Math.sin(ang);
        const h = index.provincesAt(x, y)[0];
        if (h) { hit = h; snapKm = Math.round(r * KM_PER_DEG * 10) / 10; lon = x; lat = y; break outer; }
      }
    }
  }
  if (!hit) throw new Error(`${c.name}: nessuna provincia entro ${SNAP_MAX_DEG}°`);
  const hp = hit.properties; const owner = hp.owner;
  const id = `P_${owner}_${slug(c.name)}_CITTA`;
  if (used.has(id)) throw new Error(`${id}: id già presente nel catalogo`);
  used.add(id);
  const props = {
    id, name: c.name, owner, kind: 'citta', parentProvince: hp.sponda_fiume ? hp.parentProvince : hp.id, cittaId: id, parti: 1,
    ...(hp.sponda_fiume ? { sponda: String.fromCharCode(64 + Number(hp.sponda)) } : {}),
    nomeDaVerificare: true, areaKm2: c.areaKm2, borderQuality: 'hypothesis',
    source: `${SRC_TAG}: centro ${lon.toFixed(3)}, ${lat.toFixed(3)}${snapKm ? ` (agganciato alla terra più vicina, ${snapKm} km)` : ''}; disco di partenza di area stimata ${c.areaKm2} km² (ipotesi); area urbana vera solo se il sottoinsieme Natural Earth del repository ne ha una (vedi campo geometria)`,
  };
  features.push({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: disc(lon, lat, Math.sqrt(c.areaKm2 / Math.PI)) } });
  names[id] = { ne: null, distKm: 0, basis: 'nome', extra: true, names: { NAME: c.nameLocal, NAMEASCII: c.name } };
  console.log(`${id} → ${props.parentProvince}${snapKm ? ` (agganciata ${snapKm} km)` : ''}`);
}
base.features = [...kept, ...features];
subset.cities = { ...subset.cities, ...names };
await writeFile(dataUrl('sources/citta_base.json'), `${JSON.stringify(base)}\n`);
await writeFile(dataUrl('sources/ne_places_citta.json'), `${JSON.stringify(subset)}\n`);
console.log(`aggiunte ${features.length} città`);
