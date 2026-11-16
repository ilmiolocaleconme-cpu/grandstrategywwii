// Rigenera data/military/river_crossings.json: i fiumi medi e grandi scavalcati dai collegamenti tra posti confinanti (province e sponde),
// derivati dai ponti di data/links.json. Nessuna rete: `node scripts/build-river-crossings.js`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { buildRiverCrossings } from '../src/data/riverCrossings.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));

export async function buildFile() {
  const provinces = await loadProvinces();
  return buildRiverCrossings({ links: await read('links.json'), rivers: await read('rivers.json'), provinceIds: provinces.features.map((f) => f.properties.id) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = await buildFile();
  await writeFile(new URL('../data/military/river_crossings.json', import.meta.url), `${JSON.stringify(file)}\n`);
  console.log(`river_crossings.json: ${file.counts.pairs} coppie di posti divise da un fiume (${file.counts.medium} medio, ${file.counts.large} grande), ${file.places.length} posti, ${file.rivers.length} fiumi`);
}
