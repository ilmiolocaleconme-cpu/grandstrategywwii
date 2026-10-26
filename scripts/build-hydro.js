// Genera data/resources/hydro_plants.json dal CSV delle centrali idroelettriche e dalle province (coordinate → provincia).
//   node scripts/build-hydro.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/data/csv.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { buildHydroPlants, hydroFile, normalizeHydroRows } from '../src/data/hydro.js';
import { loadProvinces } from './load-provinces.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

export const HYDRO_FILES = Object.freeze(['centrali_idroelettriche_pre_1936.csv', 'centrali_idroelettriche_1936_1945.csv']);

function csvWithHeader(text, name) {
  const header = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0].split(',').map((h) => h.trim());
  return { rows: parseCsv(text, { name }), header };
}

export async function hydroOverrides() {
  const rows = parseCsv(await readFile(dataUrl('resources/hydro_province_overrides.csv'), 'utf8'), { name: 'hydro_province_overrides.csv' });
  return new Map(rows.map((r) => [r.plant_id, r]));
}

export async function hydroSites() {
  const rows = parseCsv(await readFile(dataUrl('resources/hydro_sites.csv'), 'utf8'), { name: 'hydro_sites.csv' });
  return new Map(rows.map((r) => [r.plant_id, r.site_id]));
}

export async function hydroBuilt() {
  const all = [];
  for (const f of HYDRO_FILES) {
    const { rows, header } = csvWithHeader(await readFile(dataUrl(`resources/${f}`), 'utf8'), f);
    all.push(...normalizeHydroRows(rows, header));
  }
  return buildHydroPlants(all, buildProvinceIndex(await loadProvinces()), { overrides: await hydroOverrides(), sites: await hydroSites() });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = await hydroBuilt();
  await writeFile(dataUrl('resources/hydro_plants.json'), `${JSON.stringify(hydroFile(built), null, 2)}\n`);
  console.log(`hydro_plants.json: ${built.plants.length} centrali, ${built.unmapped.length} senza provincia, ${built.ambiguous.length} ambigue`);
}
