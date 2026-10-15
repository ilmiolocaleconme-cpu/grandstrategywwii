// Carica da disco tutti i file di data/provinces/ e li unisce, con lo stesso codice di unione
// usato dal browser (src/data/provinces.js): test, validazione e app vedono la stessa collezione.
import { readdir, readFile } from 'node:fs/promises';
import { loadProvincesFrom } from '../src/data/provinces.js';

export const provincesDir = new URL('../data/provinces/', import.meta.url);

/** Nomi dei file .json nella cartella (ordine alfabetico), con _meta.json incluso. */
export async function listProvinceFiles(dirUrl = provincesDir) {
  return (await readdir(dirUrl)).filter((n) => n.endsWith('.json')).sort();
}

/** Tutte le province unite in una FeatureCollection. Lancia un Error se i file non tornano. */
export async function loadProvinces(dirUrl = provincesDir) {
  const names = await listProvinceFiles(dirUrl);
  const modules = Object.fromEntries(
    names.map((n) => [n, async () => JSON.parse(await readFile(new URL(n, dirUrl), 'utf8'))]),
  );
  return loadProvincesFrom(modules);
}
