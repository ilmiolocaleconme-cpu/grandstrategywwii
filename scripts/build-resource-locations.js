// Genera data/resources/resource_locations.csv e location_provinces.csv dal CSV di riferimento sulle risorse, dalle righe aggiunte,
// dalle note di revisione e dalla tabella luogo → province (scritta a mano, approssimata). Non sono dati storici: `quality = reference`.
//   node scripts/build-resource-locations.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildResourceLocations, LOCATION_HEADER, LINK_HEADER } from '../src/data/resourceLocations.js';
import { toCsv } from '../src/data/csv.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const text = (name) => readFile(dataUrl(name), 'utf8');

export async function resourceLocationRows() {
  return buildResourceLocations({ rawCsv: await text('resources/risorse_riferimento.csv'), addedCsv: await text('resources/risorse_aggiunte.csv'), notesCsv: await text('resources/location_notes.csv'), placesCsv: await text('resources/place_provinces.csv') });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { locations, links, unmapped } = await resourceLocationRows();
  await writeFile(dataUrl('resources/resource_locations.csv'), toCsv(LOCATION_HEADER, locations));
  await writeFile(dataUrl('resources/location_provinces.csv'), toCsv(LINK_HEADER, links));
  const by = (k) => locations.filter((l) => l.kind === k).length;
  console.log(`resource_locations.csv: ${locations.length} righe (${by('deposit')} giacimenti, ${by('plant')} impianti, ${by('aggregate')} aggregati, ${by('national_total')} totali, ${by('trade_flow')} flussi); location_provinces.csv: ${links.length} collegamenti`);
  if (unmapped.length) console.log(`ATTENZIONE ${unmapped.length} luoghi senza provincia:`, unmapped.map((u) => `${u.location_id} ${u.country_id}/${u.place}`).join('; '));
}
