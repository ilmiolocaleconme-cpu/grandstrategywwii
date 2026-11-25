// Genera data/units/deployment_1936.json (unità → provincia madre) da units.json, dalle città e dalle province.
// Uso: node scripts/build-deployment.js
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildDeployment } from '../src/data/deployment.js';
import { bankIndex } from '../src/data/moveNet.js';
import { buildAdjacency } from '../src/data/adjacency.js';
import { minorDeployment } from '../src/data/minorNations.js';
import { loadProvinces } from './load-provinces.js';

const data = new URL('../data/', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, data), 'utf8'));

export async function loadProvinceFeatures() {
  const out = [];
  for (const f of (await readdir(new URL('provinces/', data))).filter((n) => /^[A-Z]+\.json$/.test(n)).sort()) {
    for (const ft of (await json(`provinces/${f}`)).features) out.push(ft);
  }
  return out;
}
export async function loadProvinceProps() { return (await loadProvinceFeatures()).map((f) => f.properties); }

export async function deploymentBuilt() {
  const units = (await json('units/units.json')).units;
  const cities = (await json('citta_grandi.json')).features.map((f) => f.properties);
  const garrisons = (await json('units/source/ita_sedi_guarnigione.json').catch(() => ({ entries: [] }))).entries;
  const features = await loadProvinceFeatures();
  // nazioni minori (25/11/2026): capitale e province di confine
  const all = await loadProvinces(); // stessa collezione dell'adiacenza (tutti i file di data/provinces/)
  const minor = minorDeployment(units, { tiles: all.features.map((f) => f.properties), adjacency: buildAdjacency(all, await json('adjacency.json')), depots: await json('units/depots.json') });
  return buildDeployment({ units, cities, provinces: features.map((f) => f.properties), garrisons, banks: bankIndex(features), cityLinks: await json('city_links.json'), placements: minor });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await deploymentBuilt();
  await writeFile(new URL('units/deployment_1936.json', data), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`collocate ${doc.entries.length}, non collocate ${doc.unplaced.length}`);
}
