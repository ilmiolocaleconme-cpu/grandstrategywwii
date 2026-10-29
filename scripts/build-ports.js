// Rigenera data/ports/ports_1936.json dall'elenco ridotto e dalle città costiere. Nessuna rete: `node scripts/build-ports.js`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildPorts } from '../src/data/ports.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));

export async function buildFile() {
  const cities = (await read('citta_grandi.json')).features.map((f) => f.properties);
  return buildPorts({ list: await read('ports/ports_list.json'), cities });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { file, coastal, unresolved } = await buildFile();
  if (unresolved.length) { console.error(`porti non trovati: ${unresolved.join(', ')}`); process.exitCode = 1; }
  await writeFile(new URL('../data/ports/ports_1936.json', import.meta.url), `${JSON.stringify(file, null, 1)}\n`);
  await writeFile(new URL('../data/ports/coastal_cities.json', import.meta.url), `${JSON.stringify(coastal)}\n`);
  console.log(`coastal_cities.json: ${Object.keys(coastal.cities).length} città costiere`);
  console.log(`ports_1936.json: ${Object.keys(file.ports).length} porti`);
}
