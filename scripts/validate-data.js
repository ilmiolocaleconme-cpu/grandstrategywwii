// Carica i file in data/ e li valida. Uscita con codice 1 se ci sono errori.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../src/data/validate.js';
import { loadProvinces } from './load-provinces.js';
import { checkTerrain } from '../src/data/terrain.js';

const dataDir = new URL('../data/', import.meta.url);

export async function loadCatalog(baseUrl = dataDir) {
  const read = async (name) => JSON.parse(await readFile(new URL(name, baseUrl), 'utf8'));
  return {
    nations: await read('nations.json'),
    resources: await read('resources.json'),
    rivers: await read('rivers.json'),
    crossings: await read('crossings.json'),
    political: await read('political_1936.json'),
    provinces: await loadProvinces(new URL('provinces/', baseUrl)),
    riversGeo: await read('rivers_geo.json'),
    lakes: await read('lakes.json'),
    terrain: await read('terrain.json'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (error) {
    // file province mancanti, duplicati o nel file sbagliato: si elencano tutti gli errori
    (error.errors ?? [error.message]).forEach((e) => console.error(`ERRORE ${e}`));
    console.log('FALLITO: i file in data/provinces/ non sono coerenti');
    process.exit(1);
  }
  const { ok: catalogOk, errors, warnings } = validateCatalog(catalog);
  const terrainErrors = checkTerrain(catalog.terrain, catalog.provinces.features.map((f) => f.properties.id));
  errors.push(...terrainErrors);
  if (catalog.terrain?.basis === 'hypothesis') warnings.push(`terreno: ${Object.keys(catalog.terrain.provinces ?? {}).length} province classificate a stima (basis "hypothesis"), non da dati di quota`);
  const ok = catalogOk && terrainErrors.length === 0;
  warnings.forEach((w) => console.warn(`AVVISO ${w}`));
  errors.forEach((e) => console.error(`ERRORE ${e}`));
  console.log(
    `${ok ? 'OK' : 'FALLITO'}: ${catalog.nations.length} nazioni, ${catalog.resources.length} risorse, ` +
      `${catalog.rivers.length} fiumi (${catalog.riversGeo.features.length} tratti), ${catalog.lakes.features.length} laghi, ${catalog.crossings.length} attraversamenti, ` +
      `${catalog.political.length} entità politiche (1936), ${catalog.provinces.features.length} province`,
  );
  process.exit(ok ? 0 : 1);
}
