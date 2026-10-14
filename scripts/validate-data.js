// Carica i file in data/ e li valida. Uscita con codice 1 se ci sono errori.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../src/data/validate.js';

const dataDir = new URL('../data/', import.meta.url);

export async function loadCatalog(baseUrl = dataDir) {
  const read = async (name) => JSON.parse(await readFile(new URL(name, baseUrl), 'utf8'));
  return {
    nations: await read('nations.json'),
    resources: await read('resources.json'),
    rivers: await read('rivers.json'),
    crossings: await read('crossings.json'),
    political: await read('political_1936.json'),
    provinces: await read('provinces_1936.json'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalog = await loadCatalog();
  const { ok, errors, warnings } = validateCatalog(catalog);
  warnings.forEach((w) => console.warn(`AVVISO ${w}`));
  errors.forEach((e) => console.error(`ERRORE ${e}`));
  console.log(
    `${ok ? 'OK' : 'FALLITO'}: ${catalog.nations.length} nazioni, ${catalog.resources.length} risorse, ` +
      `${catalog.rivers.length} fiumi, ${catalog.crossings.length} attraversamenti, ` +
      `${catalog.political.length} entità politiche (1936), ${catalog.provinces.features.length} province`,
  );
  process.exit(ok ? 0 : 1);
}
