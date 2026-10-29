// Applica data/rail_overrides_1936.json a data/links.json senza rigenerare la rete (che richiede Natural Earth, fuori dal repository).
// Idempotente. Uso: node scripts/apply-rail-overrides.js
import { readFile, writeFile } from 'node:fs/promises';
import { applyRailOverrides, validateRailOverrides } from '../src/data/railOverrides.js';

const url = (n) => new URL(`../data/${n}`, import.meta.url);
const links = JSON.parse(await readFile(url('links.json'), 'utf8'));
const ov = JSON.parse(await readFile(url('rail_overrides_1936.json'), 'utf8'));
const errors = validateRailOverrides(ov, { linkIds: new Set(links.links.map((l) => l.id)) });
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const { file, applied, skipped } = applyRailOverrides(links, ov);
await writeFile(url('links.json'), `${JSON.stringify(file)}\n`);
console.log(`declassati ${applied.length}, già applicati ${skipped.length}`);
