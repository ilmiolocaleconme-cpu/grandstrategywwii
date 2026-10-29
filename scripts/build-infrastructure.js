// Rigenera data/infrastructure/link_edges.json: i collegamenti tra PROVINCE MADRI per le regole di gioco (livello massimo, livello di partenza, km),
// derivati da data/links.json (grafo dei collegamenti) e dai parametri di data/infrastructure/infrastructure.json. Nessuna rete: `node scripts/build-infrastructure.js`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { buildLinkEdges } from '../src/data/infrastructure.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));

export async function buildFile() {
  const provinces = await loadProvinces();
  return buildLinkEdges({ links: await read('links.json'), config: await read('infrastructure/infrastructure.json'), provinces: provinces.features.map((f) => f.properties) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = await buildFile();
  await writeFile(new URL('../data/infrastructure/link_edges.json', import.meta.url), `${JSON.stringify(file)}\n`);
  console.log(`link_edges.json: ${file.edges.length} collegamenti tra province madri, ${file.provinces.length} province; per massimo: ${JSON.stringify(file.counts.byCeiling)}; in partenza al massimo: ${JSON.stringify(file.counts.startAtCeiling)}`);
}
