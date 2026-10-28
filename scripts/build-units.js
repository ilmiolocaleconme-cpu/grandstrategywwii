// Genera data/units/units.json dal CSV dell'utente (data/units/source/) e dalle revisioni (data/units/unit_reviews.json).
// Uso: npm run build:units
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/data/csv.js';
import { buildUnits, UNITS_SCHEMA } from '../src/data/units.js';

const dir = new URL('../data/units/', import.meta.url);
export const SOURCE_FILE = 'source/unita_cronologia_1935_1945.csv';

export async function unitsBuilt() {
  const csvBuffer = await readFile(new URL(SOURCE_FILE, dir));
  const reviews = JSON.parse(await readFile(new URL('unit_reviews.json', dir), 'utf8')).reviews;
  const rows = parseCsv(csvBuffer.toString('utf8'), { name: 'unita_cronologia_1935_1945.csv' });
  const units = buildUnits(rows, reviews);
  for (const id of Object.keys(reviews)) if (!units.some((u) => u.id === id)) throw new Error(`revisione ${id}: unità inesistente nel CSV`);
  return {
    schema: UNITS_SCHEMA,
    quality: 'DA_VERIFICARE',
    note: 'Catalogo cronologico generato dal CSV dell\'utente: NON è l\'ordine di battaglia del 1936. Le date sono solo anni (inizio assunto al 1° gennaio); 1935 = inizio della finestra del CSV, non data di costituzione. Le unità con revisione date_doubt/duplicate/excluded/faction_doubt sono inattive nella politica strict.',
    source: { file: SOURCE_FILE, sha256: createHash('sha256').update(csvBuffer).digest('hex'), rows: rows.length },
    units,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await unitsBuilt();
  await writeFile(new URL('units.json', dir), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`units.json: ${doc.units.length} unità`);
}
