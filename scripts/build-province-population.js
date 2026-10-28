// Genera data/population/province_population.json: totali nazionali 1936 (data/population/nazioni_1936.csv, forniti dall'utente)
// distribuiti sulle province madri (src/data/population.js). Rigenerare dopo ogni cambio di province o di CSV:
//   node scripts/build-province-population.js        (npm run build:population)
import { readFile, writeFile } from 'node:fs/promises';
import { parseCsv } from '../src/data/csv.js';
import { AREA_POWER, DEFAULT_DENSITY, MAPPING_NOTES, POPULATION_YEAR, TERRAIN_DENSITY, URBAN_POWER, URBAN_WEIGHT, buildProvincePopulation, habitableFactor } from '../src/data/population.js';
import { featureAreaKm2 } from '../src/map/geo.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { loadProvinces } from './load-provinces.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

/** Calcolo completo dai file su disco: { built, provinces }. */
export async function populationBuilt() {
  const provinces = await loadProvinces();
  const links = JSON.parse(await readFile(dataUrl('links.json'), 'utf8'));
  const terrain = JSON.parse(await readFile(dataUrl('terrain.json'), 'utf8'));
  const rows = parseCsv(await readFile(dataUrl('population/nazioni_1936.csv'), 'utf8'), { name: 'nazioni_1936.csv' });
  const pieces = provinces.features.map((f) => ({
    id: f.properties.id, owner: f.properties.owner, mother: f.properties.parentProvince ?? f.properties.id,
    habitableKm2: (f.properties.areaKm2 ?? featureAreaKm2(f)) * habitableFactor(terrain.province[f.properties.parentProvince ?? f.properties.id]?.frazioni),
  }));
  // Popolazione moderna dei luoghi abitati per pezzo: somma di POP_MIN di TUTTI i luoghi Natural Earth 10m (data/sources/ne_places_pop.json)
  // che cadono nel pezzo (POP_MAX è l'area metropolitana e conterebbe due volte i sobborghi). Dove non cade nessun luogo si ricade sul
  // valore dei nodi di links.json (stessa indicazione NE, per indice del pezzo: la somma di controllo di links.json garantisce l'ordine).
  const index = buildProvinceIndex(provinces);
  const pieceIndex = new Map(provinces.features.map((f, i) => [f, i]));
  const places = JSON.parse(await readFile(dataUrl('sources/ne_places_pop.json'), 'utf8')).places;
  const piecePop = new Array(pieces.length).fill(0);
  for (const [lon, lat, , popMin] of places) {
    const hit = index.provincesAt(lon, lat)[0];
    if (hit && popMin > 0) piecePop[pieceIndex.get(hit)] += popMin;
  }
  for (const n of links.nodes) if (n.pop > 0 && n.p in piecePop && piecePop[n.p] === 0) piecePop[n.p] = n.pop;
  return buildProvincePopulation({ rows, pieces, piecePop });
}

export function populationFile(built) {
  return {
    schema: 'province-population-v1',
    quality: 'DESIGN_DEFAULT',
    note: `Totali nazionali ${POPULATION_YEAR} forniti dall'utente (data/population/nazioni_1936.csv, Gapminder v7 / Our World in Data; solo il valore dell'Italia è un censimento, ISTAT 21 aprile 1936) DISTRIBUITI sulle province madri: la ripartizione è una scelta di design, non un dato storico. Peso = ${1 - URBAN_WEIGHT} × quota del territorio abitabile (area × densità relativa del terreno di data/terrain.json, elevata a ${AREA_POWER}) + ${URBAN_WEIGHT} × quota della popolazione moderna dei luoghi abitati (somma di POP_MIN di tutti i luoghi Natural Earth 10m della provincia, data/sources/ne_places_pop.json; dove manca, nodi di data/links.json; elevata a ${URBAN_POWER}); i valori sono in method. Il totale di ogni nazione è esatto, i singoli valori NO: senza una densità per provincia possono essere lontani dal vero di un fattore 5-10 (province enormi e semivuote come Xinjiang o Alaska sovrastimate, idem province con una megalopoli moderna come Shanghai). Le nazioni non presenti nel CSV restano senza dato. Rigenerare con npm run build:population; non modificare a mano.`,
    method: { urbanWeight: URBAN_WEIGHT, urbanPower: URBAN_POWER, areaPower: AREA_POWER, terrainDensity: TERRAIN_DENSITY, defaultDensity: DEFAULT_DENSITY, rounding: 'resto maggiore (somma esatta)', year: POPULATION_YEAR },
    nationalTotals: built.totals,
    mappingNotes: MAPPING_NOTES,
    byProvince: Object.fromEntries(Object.entries(built.byProvince).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const built = await populationBuilt();
  built.errors.forEach((e) => console.error(`ERRORE ${e}`));
  if (built.errors.length > 0 || built.noProvinces.length > 0) {
    if (built.noProvinces.length) console.error(`ERRORE nessuna provincia per: ${built.noProvinces.join(', ')}`);
    process.exit(1);
  }
  await writeFile(dataUrl('population/province_population.json'), `${JSON.stringify(populationFile(built), null, 2)}\n`);
  console.log(`province_population.json: ${Object.keys(built.byProvince).length} province, ${Object.keys(built.totals).length} nazioni`);
}
