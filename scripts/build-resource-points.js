// Genera data/resources/resource_points.json (tiratura delle risorse a punti) da resource_locations.csv, location_provinces.csv,
// punteggi_output.csv e modello_punti.json. Dato di riferimento per il bilanciamento, non storico.
//   node scripts/build-resource-points.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildResourcePoints, pointsTableMarkdown, sensitivity } from '../src/data/resourcePoints.js';
import { parseCsv } from '../src/data/csv.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const text = (name) => readFile(dataUrl(name), 'utf8');

export async function resourcePointsInputs() {
  return {
    locations: parseCsv(await text('resources/resource_locations.csv'), { name: 'resource_locations.csv' }),
    links: parseCsv(await text('resources/location_provinces.csv'), { name: 'location_provinces.csv' }),
    scores: parseCsv(await text('resources/punteggi_output.csv'), { name: 'punteggi_output.csv' }),
    params: JSON.parse(await text('resources/modello_punti.json')),
  };
}

export async function resourcePointsFile() {
  return buildResourcePoints(await resourcePointsInputs());
}

export const SENSITIVITY_STEPS = [1.4, 1.7, 2, 2.8];

/** Tabella Markdown generata (docs/RISORSE_PUNTI_TABELLA.md). */
export async function resourcePointsTable() {
  const inputs = await resourcePointsInputs();
  const file = buildResourcePoints(inputs);
  const labels = Object.fromEntries(JSON.parse(await text('resources.json')).map((r) => [r.id, r.name]));
  return pointsTableMarkdown(file, sensitivity(inputs, SENSITIVITY_STEPS), labels, SENSITIVITY_STEPS);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = await resourcePointsFile();
  await writeFile(dataUrl('resources/resource_points.json'), `${JSON.stringify(file, null, 1)}\n`);
  await writeFile(new URL('../docs/RISORSE_PUNTI_TABELLA.md', import.meta.url), await resourcePointsTable());
  const centers = Object.values(file.resources).reduce((n, r) => n + r.centers.length, 0);
  console.log(`resource_points.json: ${Object.keys(file.resources).length} risorse, ${centers} centri produttivi, ${Object.keys(file.byProvince).length} province con punti (step ${file.params.step})`);
}
