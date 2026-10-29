// Genera data/units/deployment_1936.json (unità → provincia madre) da units.json, dalle città e dalle province.
// Uso: node scripts/build-deployment.js
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildDeployment } from '../src/data/deployment.js';

const data = new URL('../data/', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, data), 'utf8'));

export async function loadProvinceProps() {
  const out = [];
  for (const f of (await readdir(new URL('provinces/', data))).filter((n) => /^[A-Z]+\.json$/.test(n)).sort()) {
    for (const ft of (await json(`provinces/${f}`)).features) out.push(ft.properties);
  }
  return out;
}

export async function deploymentBuilt() {
  const units = (await json('units/units.json')).units;
  const cities = (await json('citta_grandi.json')).features.map((f) => f.properties);
  return buildDeployment({ units, cities, provinces: await loadProvinceProps() });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await deploymentBuilt();
  await writeFile(new URL('units/deployment_1936.json', data), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`collocate ${doc.entries.length}, non collocate ${doc.unplaced.length}`);
}
