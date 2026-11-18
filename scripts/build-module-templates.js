// Genera i template di divisione composti da battaglioni (data/units/modules/modules_*.json → data/units/templates/<file>).
// `node scripts/build-module-templates.js`; senza rete. I file generati non si modificano a mano.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { templateFromComposition } from '../src/data/modules.js';

const dir = new URL('../data/units/modules/', import.meta.url);

export async function buildAll() {
  const out = [];
  for (const f of (await readdir(dir)).filter((n) => /^modules_.*\.json$/.test(n)).sort()) {
    const doc = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
    for (const c of doc.compositions ?? []) out.push({ file: c.file, template: templateFromComposition(doc, c) });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { file, template } of await buildAll()) {
    await writeFile(new URL(`../data/units/templates/${file}`, import.meta.url), `${JSON.stringify(template, null, 2)}\n`);
    console.log(`${file}: ${template.id}, ${template.manpower.war.value} uomini, ${Object.keys(template.equipment).length} voci`);
  }
}
