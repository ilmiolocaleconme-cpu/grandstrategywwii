// Divide la Sicilia nelle 9 province storiche (Trapani, Palermo, Messina, Agrigento, Caltanissetta, Enna, Catania, Ragusa,
// Siracusa) al posto dell'unica provincia «Sicily» (che era l'unione senza fusione delle stesse 9, con isole minori a parte).
// Ingresso: ne_10m_admin_1_states_provinces.geojson di Natural Earth (pubblico dominio, non nel repository):
//   git -C ne sparse-checkout add /geojson/ne_10m_admin_1_states_provinces.geojson
//   node scripts/build-sicily.js <cartella ne/geojson>      (oppure NE_DIR=<cartella>)
// Scrive data/provinces/ITA.json (le sponde P_ITA_SICILY_SPn sono sostituite dalle 9 province: i poligoni hanno i vertici
// di confine condivisi di Natural Earth, quindi niente fessure) e aggiorna `parentProvince` delle città siciliane in
// data/sources/citta_base.json. Dopo: npm run build:adjacency, build:sea, build:labels,
// build:crossing-points, build:links. Idempotente.
// Il Simeto (fiume «main») NON divide nessuna provincia: nasce e muore dentro l'isola, quindi non è un confine.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

export const PROVINCES = Object.freeze([
  { ne: 'Trapani', id: 'P_ITA_TRAPANI', name: 'Trapani' },
  { ne: 'Palermo', id: 'P_ITA_PALERMO', name: 'Palermo' },
  { ne: 'Messina', id: 'P_ITA_MESSINA', name: 'Messina' },
  { ne: 'Agrigento', id: 'P_ITA_AGRIGENTO', name: 'Agrigento' },
  { ne: 'Caltanissetta', id: 'P_ITA_CALTANISSETTA', name: 'Caltanissetta' },
  { ne: 'Enna', id: 'P_ITA_ENNA', name: 'Enna' },
  { ne: 'Catania', id: 'P_ITA_CATANIA', name: 'Catania' },
  { ne: 'Ragusa', id: 'P_ITA_RAGUSA', name: 'Ragusa' },
  { ne: 'Siracusa', id: 'P_ITA_SIRACUSA', name: 'Siracusa' },
]);
/** Città siciliane (id della città → id della nuova provincia madre). */
export const CITY_PARENT = Object.freeze({ P_ITA_CATANIA_CITTA: 'P_ITA_CATANIA', P_ITA_MESSINA_CITTA: 'P_ITA_MESSINA', P_ITA_PALERMO_CITTA: 'P_ITA_PALERMO' });

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const roundRing = (ring) => ring.map(([x, y]) => [r6(x), r6(y)]);
const roundGeom = (g) => (g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.coordinates.map(roundRing) } : { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(roundRing)) });

// stesso aspetto del resto dei file di dati (json di Python: ", " e ": ")
function dump(v) {
  if (Array.isArray(v)) return `[${v.map(dump).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${dump(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}

export function buildSicilyFeatures(neFeatures, template) {
  const out = [];
  for (const def of PROVINCES) {
    const ne = neFeatures.find((f) => f.properties.iso_a2 === 'IT' && f.properties.region === 'Sicily' && f.properties.name === def.ne);
    if (!ne) throw new Error(`provincia non trovata in Natural Earth: ${def.ne}`);
    const { id: _i, name: _n, nameLocal: _l, parentProvince: _p, sponda_fiume: _s, sponda: _sp, wikidata: _w, ...base } = template;
    out.push({
      type: 'Feature',
      id: def.id,
      properties: {
        id: def.id, name: def.name, nameLocal: def.name, ...base, adminLevel: 6,
        ...(ne.properties.wikidataid ? { wikidata: ne.properties.wikidataid } : {}),
        notes: 'Provincia siciliana (stessi confini nel 1936 e oggi, 9 province: Ragusa dal 1927); isole minori comprese',
      },
      geometry: roundGeom(ne.geometry),
    });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2] ?? process.env.NE_DIR;
  if (!src) { console.error('uso: node scripts/build-sicily.js <cartella con ne_10m_admin_1_states_provinces.geojson>'); process.exit(2); }
  const ne = JSON.parse(await readFile(path.join(src, 'ne_10m_admin_1_states_provinces.geojson'), 'utf8')).features;
  const ita = JSON.parse(await readFile(dataUrl('provinces/ITA.json'), 'utf8'));
  const isSicily = (f) => f.id === 'P_ITA_SICILY' || /^P_ITA_SICILY_SP\d+$/.test(f.id) || PROVINCES.some((p) => p.id === f.id);
  const old = ita.features.filter(isSicily);
  const template = (old.find((f) => f.properties.parentProvince === 'P_ITA_SICILY') ?? old[0]).properties;
  const at = ita.features.findIndex(isSicily);
  const rest = ita.features.filter((f) => !isSicily(f));
  const fresh = buildSicilyFeatures(ne, template);
  rest.splice(at, 0, ...fresh);
  await writeFile(dataUrl('provinces/ITA.json'), `${dump({ ...ita, features: rest })}\n`);
  for (const file of ['sources/citta_base.json']) { // citta_grandi.json si rifà con `node scripts/build-cities.js`
    const j = JSON.parse(await readFile(dataUrl(file), 'utf8'));
    let n = 0;
    for (const f of j.features) {
      const parent = CITY_PARENT[f.properties.id];
      if (!parent) continue;
      f.properties.parentProvince = parent;
      delete f.properties.sponda;
      n += 1;
    }
    await writeFile(dataUrl(file), `${dump(j)}\n`);
    console.log(`${file}: ${n} città siciliane aggiornate`);
  }
  console.log(`data/provinces/ITA.json: ${old.length} pezzi siciliani sostituiti da ${fresh.length} province`);
}
