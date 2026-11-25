// Toglie dal catalogo le città che il 1° gennaio 1936 non esistevano (25/11/2026, richiesta dell'utente): elenco e motivi in
// data/sources/citta_escluse_1936.json. Tocca i dischi di partenza (sources/citta_base.json) e le zone (citta_grandi.json);
// build-cities-world.js e add-extra-cities.js le saltano. Poi rigenerare i derivati:
//   node scripts/rimuovi-citta-inesistenti.js
//   node scripts/build-city-links.js && node scripts/build-province-industry.js && node scripts/build-ports.js && node scripts/build-deployment.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);
const readJson = async (n) => JSON.parse(await readFile(dataUrl(n), 'utf8'));

export async function escluse() {
  return new Set((await readJson('sources/citta_escluse_1936.json')).citta.map((c) => c.cittaId));
}

export async function main() {
  const via = await escluse();
  const cittaDi = (f) => f.properties.cittaId ?? f.properties.id ?? f.id;
  for (const n of ['sources/citta_base.json', 'citta_grandi.json']) {
    const raw = await readFile(dataUrl(n), 'utf8');
    const doc = JSON.parse(raw);
    const prima = doc.features.length;
    doc.features = doc.features.filter((f) => !via.has(cittaDi(f)));
    await writeFile(dataUrl(n), `${JSON.stringify(doc)}${raw.endsWith('\n') ? '\n' : ''}`);
    console.log(`${n}: ${prima - doc.features.length} zone tolte`);
  }
  const sub = await readJson('sources/ne_places_citta.json');
  for (const id of via) delete sub.cities[id];
  await writeFile(dataUrl('sources/ne_places_citta.json'), `${JSON.stringify(sub)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
