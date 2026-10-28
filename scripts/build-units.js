// Genera data/units/units.json dal CSV dell'utente (data/units/source/) e dalle revisioni (data/units/unit_reviews.json).
// Uso: npm run build:units
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/data/csv.js';
import { buildUnits, mergeOob1936, parseOob1936Csv, UNITS_SCHEMA } from '../src/data/units.js';

const dir = new URL('../data/units/', import.meta.url);
export const SOURCE_FILE = 'source/unita_cronologia_1935_1945.csv';
export const FRANCE_1936_FILE = 'source/francia_1936_oob.csv';
/** Unità del file francese che restano inattive finché non verificate (chiave = nome normalizzato). */
export const FRANCE_1936_DOUBTS = {
  '5divisiondecavalerie': 'Il file utente ne elenca 5; il testo di Tournès del 1936 (blog empires-and-revolution) ne conta 4. Da verificare.',
  ...Object.fromEntries([1, 2, 3, 4].map((i) => [`${i}divisiondinfanteriecoloniale`, `Il file utente la dà presente al 1/1/1936, ma la data di costituzione della ${i}re/e Divisione di fanteria coloniale non è verificata (il CSV riporta 1939). Da verificare.`])),
};

export async function unitsBuilt() {
  const csvBuffer = await readFile(new URL(SOURCE_FILE, dir));
  const reviews = JSON.parse(await readFile(new URL('unit_reviews.json', dir), 'utf8')).reviews;
  const rows = parseCsv(csvBuffer.toString('utf8'), { name: 'unita_cronologia_1935_1945.csv' });
  const base = buildUnits(rows, reviews);
  const frBuffer = await readFile(new URL(FRANCE_1936_FILE, dir));
  const { rows: frRows, repaired: frRepaired } = parseOob1936Csv(frBuffer.toString('utf8'), { name: 'francia_1936_oob.csv' });
  const { units, skipped } = mergeOob1936(frRows, base, { nation: 'FRA', doubts: FRANCE_1936_DOUBTS });
  for (const id of Object.keys(reviews)) if (!units.some((u) => u.id === id)) throw new Error(`revisione ${id}: unità inesistente nel CSV`);
  return {
    schema: UNITS_SCHEMA,
    quality: 'DA_VERIFICARE',
    note: 'Catalogo cronologico generato dal CSV dell\'utente: NON è l\'ordine di battaglia del 1936. Le date sono solo anni (inizio assunto al 1° gennaio); 1935 = inizio della finestra del CSV, non data di costituzione. Le unità con revisione date_doubt/duplicate/excluded/faction_doubt sono inattive nella politica strict.',
    source: { file: SOURCE_FILE, sha256: createHash('sha256').update(csvBuffer).digest('hex'), rows: rows.length },
    source1936: { file: FRANCE_1936_FILE, sha256: createHash('sha256').update(frBuffer).digest('hex'), rows: frRows.length, repairedRows: frRepaired, nation: 'FRA', notImported: skipped },
    units,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await unitsBuilt();
  await writeFile(new URL('units.json', dir), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`units.json: ${doc.units.length} unità`);
}
