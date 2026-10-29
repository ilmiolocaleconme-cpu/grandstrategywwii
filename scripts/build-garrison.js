// Rigenera data/military/garrison_estimate_1936.json dalle unità schierate. Nessuna rete: `node scripts/build-garrison.js`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildGarrisonEstimate } from '../src/data/garrison.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));

export async function buildFile() {
  return buildGarrisonEstimate({ deployment: await read('units/deployment_1936.json'), units: (await read('units/units.json')).units, config: await read('security/security.json'), entityIds: (await read('political_1936.json')).map((e) => e.id) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = await buildFile();
  await writeFile(new URL('../data/military/garrison_estimate_1936.json', import.meta.url), `${JSON.stringify(file, null, 1)}\n`);
  console.log(`garrison_estimate_1936.json: ${Object.keys(file.byProvince).length} province, ${Object.keys(file.byEntity).length} entità`);
}
