// Rigenera data/adjacency.json dai poligoni delle province (data/provinces/) e dalle esclusioni
// motivate di data/adjacency_overrides.json. Da rieseguire ogni volta che le province cambiano
// (npm run build:adjacency): senza, il caricamento fallisce per somma di controllo diversa.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { computeAdjacency } from './adjacency-compute.js';
import { ADJACENCY_SCHEMA, idsChecksum } from '../src/data/adjacency.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

export async function buildAdjacencyFile() {
  const collection = await loadProvinces();
  const ids = collection.features.map((f) => f.properties.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const overrides = JSON.parse(await readFile(dataUrl('adjacency_overrides.json'), 'utf8'));
  const { edges, params } = computeAdjacency(collection);

  const removed = new Set();
  for (const { a, b, reason } of overrides.remove) {
    if (!index.has(a) || !index.has(b)) throw new Error(`esclusione con id sconosciuto: ${a} / ${b}`);
    if (typeof reason !== 'string' || reason === '') throw new Error(`esclusione senza motivo: ${a} / ${b}`);
    const i = index.get(a);
    const j = index.get(b);
    removed.add(`${Math.min(i, j)}|${Math.max(i, j)}`);
  }
  const kept = edges.filter(([i, j]) => !removed.has(`${i}|${j}`));
  const computed = new Set(edges.map(([i, j]) => `${i}|${j}`));
  const notFound = [...removed].filter((k) => !computed.has(k));
  if (notFound.length > 0) throw new Error(`esclusioni che non corrispondono ad alcun arco calcolato (indici ${notFound.join(', ')}): rivedere data/adjacency_overrides.json`);

  return {
    schema: ADJACENCY_SCHEMA,
    method: 'contorni campionati; adiacenti se entro la tolleranza; km = stima grossolana (sovrastima probabile)',
    stepDeg: params.stepDeg,
    tolDeg: params.tolDeg,
    count: ids.length,
    checksum: idsChecksum(ids),
    excluded: removed.size,
    edges: kept,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = await buildAdjacencyFile();
  await writeFile(dataUrl('adjacency.json'), `${JSON.stringify(file)}\n`);
  console.log(`data/adjacency.json: ${file.edges.length} archi su ${file.count} province (${file.excluded} esclusi a mano)`);
}
