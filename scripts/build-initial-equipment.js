// Genera data/industry/initial_equipment.json (riserva iniziale di armi in magazzino, 22/11/2026) da
// data/industry/initial_equipment_rules.json e dai template di fanteria a battaglioni (data/units/templates). Senza rete.
// `npm run build:initial-equipment`. Il file generato non si modifica a mano.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildInitialEquipment } from '../src/data/initialEquipment.js';

const START = '1936-01-01';

export async function initialEquipmentFile() {
  const rules = JSON.parse(await readFile(new URL('../data/industry/initial_equipment_rules.json', import.meta.url), 'utf8'));
  const dir = new URL('../data/units/templates/', import.meta.url);
  const templates = [];
  for (const f of (await readdir(dir)).filter((n) => /^(divisione|brigata)_.*\.json$/.test(n)).sort()) templates.push(JSON.parse(await readFile(new URL(f, dir), 'utf8')));
  return buildInitialEquipment(rules, templates, START);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await initialEquipmentFile();
  await writeFile(new URL('../data/industry/initial_equipment.json', import.meta.url), `${JSON.stringify(doc, null, 2)}\n`);
  for (const [id, e] of Object.entries(doc.nations)) console.log(`${id}: ${e.divisions} div. × ${e.templateId}, ${Object.values(e.equipment).reduce((a, b) => a + b, 0)} pezzi`);
  console.log(`in attesa della fanteria a battaglioni: ${doc.pending.join(' ')}`);
}
