// Estrae da data/terrain.json la sola classe di terreno per provincia (data/combat/terrain_class.json, ~60 kB): serve al combattimento
// senza caricare il terreno completo (548 kB, con frazioni e rugosità). Deterministico, nessuna rete. Uso: node scripts/build-terrain-class.js
import { readFile, writeFile } from 'node:fs/promises';

const terrain = JSON.parse(await readFile(new URL('../data/terrain.json', import.meta.url), 'utf8'));
const classes = Object.fromEntries(Object.entries(terrain.province).sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, p]) => [id, p.terreno]));
const doc = { schema: 'terrain-class-v1', source: 'data/terrain.json (stima da raster Natural Earth, non quote misurate)', classes };
await writeFile(new URL('../data/combat/terrain_class.json', import.meta.url), `${JSON.stringify(doc)}\n`);
console.log(`terrain_class.json: ${Object.keys(classes).length} province`);
