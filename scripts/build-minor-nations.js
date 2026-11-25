// Genera il catalogo comune e i battaglioni delle nazioni minori (25/11/2026) da src/data/minorNations.js:
// data/units/equipment/catalog_minors.json e data/units/modules/modules_minors.json. Senza rete.
// `node scripts/build-minor-nations.js`, poi `node scripts/build-module-templates.js`. I file generati non si modificano a mano.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildMinorCatalog, buildMinorModules, minorArtilleryMasses } from '../src/data/minorNations.js';

export async function minorNationFiles() {
  const nations = JSON.parse(await readFile(new URL('../data/nations.json', import.meta.url), 'utf8'));
  const names = Object.fromEntries(nations.map((n) => [n.id, n.name]));
  return { catalog: buildMinorCatalog(), modules: buildMinorModules(names) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { catalog, modules } = await minorNationFiles();
  await writeFile(new URL('../data/units/equipment/catalog_minors.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
  await writeFile(new URL('../data/units/modules/modules_minors.json', import.meta.url), `${JSON.stringify(modules, null, 2)}\n`);
  // pesi per modello dell'artiglieria comune: righe in fondo agli overrides di equipment_production.json (rigenerate, una per riga)
  const prodUrl = new URL('../data/units/equipment/equipment_production.json', import.meta.url);
  const masses = minorArtilleryMasses();
  let lines = (await readFile(prodUrl, 'utf8')).split('\n').filter((l) => !Object.keys(masses).some((k) => l.startsWith(`    "${k}": `)));
  const end = lines.findIndex((l, i) => l === '  },' && lines[i + 1]?.startsWith('  "priceFactor"'));
  if (end < 0) throw new Error('equipment_production.json: fine degli overrides non trovata');
  if (!lines[end - 1].endsWith(',')) lines[end - 1] += ',';
  lines.splice(end, 0, ...Object.entries(masses).map(([k, v], i, a) => `    "${k}": ${JSON.stringify(v)}${i < a.length - 1 ? ',' : ''}`));
  const out = lines.join('\n');
  JSON.parse(out);
  await writeFile(prodUrl, out);
  console.log(`catalogo: ${catalog.entries.length} voci; battaglioni: ${modules.modules.length}; composizioni: ${modules.compositions.length}; modelli di partenza: ${modules.presets.length}`);
}
