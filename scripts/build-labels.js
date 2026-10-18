// Rigenera data/labels.json (npm run build:labels): posizione, rotazione e corpo dei nomi di nazioni, province e mari.
// Va rieseguito quando cambiano province, zone marittime o nomi: la somma di controllo lo impone al caricamento.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { computeNationLabels, computeProvinceLabels, computeSeaLabels, SEA_CHAR_W } from './labels-compute.js';
import { CHAR_W } from '../src/map/labelfit.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { LABELS_SCHEMA } from '../src/data/labels.js';

const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);

export async function buildLabelsFile() {
  const collection = await loadProvinces();
  const sea = JSON.parse(await readFile(dataUrl('sea_zones.json'), 'utf8'));
  const political = JSON.parse(await readFile(dataUrl('political_1936.json'), 'utf8'));
  const ids = collection.features.map((f) => f.properties.id);
  return {
    schema: LABELS_SCHEMA,
    method: 'posizione = polo di inaccessibilità e asse maggiore della forma (province, mari) o di una griglia del territorio principale (nazioni); corpo = il più grande che sta dentro la forma. x,y in unità di mappa (src/map/geo.js project), s corpo, r gradi, l righe.',
    quality: 'hypothesis',
    charW: { nations: CHAR_W, provinces: CHAR_W, seas: SEA_CHAR_W }, // larghezza media di un carattere in em: serve a imporre la larghezza del testo
    count: ids.length,
    checksum: idsChecksum(ids),
    seaChecksum: idsChecksum(sea.zones.map((z) => z.id)),
    nations: computeNationLabels(collection, political),
    provinces: computeProvinceLabels(collection),
    seas: computeSeaLabels(sea),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const file = await buildLabelsFile();
  await writeFile(dataUrl('labels.json'), `${JSON.stringify(file)}\n`);
  console.log(`labels.json: ${file.nations.length} nazioni, ${file.provinces.length} province, ${file.seas.length} mari (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
