// Genera data/resources/province_resources.json (provincia → risorse presenti) da resource_locations.csv e location_provinces.csv.
// Piccolo file pronto per il browser: il livello Risorse della mappa non legge i CSV. Dato di riferimento, non storico.
//   node scripts/build-province-resources.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildProvinceResources } from '../src/data/provinceResources.js';
import { parseCsv } from '../src/data/csv.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const text = (name) => readFile(dataUrl(name), 'utf8');

export async function provinceResourcesFile() {
  const locations = parseCsv(await text('resources/resource_locations.csv'), { name: 'resource_locations.csv' });
  const links = parseCsv(await text('resources/location_provinces.csv'), { name: 'location_provinces.csv' });
  return buildProvinceResources(locations, links);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = await provinceResourcesFile();
  await writeFile(dataUrl('resources/province_resources.json'), `${JSON.stringify(file, null, 1)}\n`);
  console.log(`province_resources.json: ${Object.keys(file.byProvince).length} province con risorse`);
}
