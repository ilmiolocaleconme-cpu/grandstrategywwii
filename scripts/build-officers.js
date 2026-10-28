// Genera data/officers/officers.json dal CSV dell'utente (data/officers/source/) e dalle revisioni.
// Uso: npm run build:officers
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildOfficers, parseSemicolonCsv, OFFICERS_SCHEMA } from '../src/data/officers.js';

const dir = new URL('../data/officers/', import.meta.url);
export const OFFICERS_SOURCE = 'source/ufficiali_comando_1935_1945_master.csv';
export const CARD_TEMPLATE_SOURCE = 'source/template_card_ufficiale_ui.csv';

export async function officersBuilt() {
  const buffer = await readFile(new URL(OFFICERS_SOURCE, dir));
  const card = await readFile(new URL(CARD_TEMPLATE_SOURCE, dir));
  const reviews = JSON.parse(await readFile(new URL('officer_reviews.json', dir), 'utf8')).reviews;
  const rows = parseSemicolonCsv(buffer.toString('utf8'), { name: 'ufficiali_comando_1935_1945_master.csv' });
  const officers = buildOfficers(rows, reviews);
  for (const id of Object.keys(reviews)) if (!officers.some((o) => o.id === id)) throw new Error(`revisione ${id}: ufficiale inesistente nel CSV`);
  return {
    schema: OFFICERS_SCHEMA,
    quality: 'DA_VERIFICARE',
    note: "Catalogo generato dal CSV dell'utente. Le date 1935-01-01 sono l'inizio della finestra, non una data di nomina (dating: window_start). Il CSV non contiene i valori della scheda (offensiva, difesa...): non sono stati inventati.",
    source: { file: OFFICERS_SOURCE, sha256: createHash('sha256').update(buffer).digest('hex'), rows: rows.length },
    cardTemplate: { file: CARD_TEMPLATE_SOURCE, sha256: createHash('sha256').update(card).digest('hex') },
    officers,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await officersBuilt();
  await writeFile(new URL('officers.json', dir), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`officers.json: ${doc.officers.length} ufficiali`);
}
