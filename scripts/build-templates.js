// Genera i template di divisione (data/units/templates/divisione_*.json, unit-template-v2) e i cataloghi equipaggiamenti per nazione
// (data/units/equipment/catalog_<nazione>.json) dai CSV elencati in data/units/source/templates_manifest.json.
// Uso: npm run build:templates
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildDivisionSet, buildNationCatalog, csvRows, MANIFEST_SCHEMA } from '../src/data/templateBuilder.js';

const root = new URL('../data/units/', import.meta.url);
const sourceDir = new URL('source/', root);

/** { templates: { 'divisione_x.json': doc }, catalogs: { 'catalog_fra.json': doc } } generati dai CSV: confrontati con i file su disco da validate-data. */
export async function templatesBuilt() {
  const manifest = JSON.parse(await readFile(new URL('templates_manifest.json', sourceDir), 'utf8'));
  if (manifest.schema !== MANIFEST_SCHEMA) throw new Error(`manifesto: schema ${JSON.stringify(manifest.schema)}`);
  const templates = {}; const byNation = new Map();
  for (const set of manifest.sets) {
    const files = [];
    const read = async (name) => {
      const buf = await readFile(new URL(name, sourceDir));
      files.push({ file: `source/${name}`, sha256: createHash('sha256').update(buf).digest('hex') });
      return csvRows(buf.toString('utf8'), name);
    };
    const [template, lines, catalog] = [await read(set.template), await read(set.lines), await read(set.catalog)];
    const built = buildDivisionSet({ template, lines, catalog, overrides: set.granularityOverrides ?? {}, sourceFiles: files });
    if (templates[set.output]) throw new Error(`manifesto: output duplicato ${set.output}`);
    templates[set.output] = built.template;
    const nation = built.template.appliesTo.nation;
    if (!byNation.has(nation)) byNation.set(nation, { sets: [], files: [] });
    byNation.get(nation).sets.push(built); byNation.get(nation).files.push(...files);
  }
  const catalogs = {};
  for (const [nation, { sets, files }] of byNation) catalogs[`catalog_${nation.toLowerCase()}.json`] = buildNationCatalog(nation, sets, files);
  return { templates, catalogs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { templates, catalogs } = await templatesBuilt();
  for (const [name, doc] of Object.entries(templates)) await writeFile(new URL(`templates/${name}`, root), `${JSON.stringify(doc, null, 2)}\n`);
  for (const [name, doc] of Object.entries(catalogs)) await writeFile(new URL(`equipment/${name}`, root), `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`template: ${Object.keys(templates).length}; cataloghi: ${Object.keys(catalogs).length}`);
}
