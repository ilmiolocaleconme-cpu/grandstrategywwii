// Genera data/units/units.json dal CSV dell'utente (data/units/source/) e dalle revisioni (data/units/unit_reviews.json).
// Uso: npm run build:units
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/data/csv.js';
import { buildUnits, mergeOob1936, makeDivisionPlaceholders, parseOob1936Csv, UNITS_SCHEMA } from '../src/data/units.js';

const dir = new URL('../data/units/', import.meta.url);
export const SOURCE_FILE = 'source/unita_cronologia_1935_1945.csv';
const REASON_CAV = 'Il file utente elenca divisioni di cavalleria al 1/1/1936; storicamente la cavalleria tedesca era in riorganizzazione (la 1ª Kavallerie-Division nasce dopo, da una brigata). Da verificare.';
/** File utente "ordine di battaglia 1/1/1936" per nazione; doubts: nome normalizzato → motivo (l'unità resta inattiva finché non è verificata). */
export const OOB1936_SOURCES = [
  {
    nation: 'FRA', file: 'source/francia_1936_oob.csv',
    doubts: {
      '5divisiondecavalerie': 'Il file utente ne elenca 5; il testo di Tournès del 1936 (blog empires-and-revolution) ne conta 4. Da verificare.',
      ...Object.fromEntries([1, 2, 3, 4].map((i) => [`${i}divisiondinfanteriecoloniale`, `Il file utente la dà presente al 1/1/1936, ma la data di costituzione della ${i}ª Divisione di fanteria coloniale non è verificata (il CSV riporta 1939). Da verificare.`])),
    },
  },
  {
    nation: 'DEU', file: 'source/germania_1936_oob.csv',
    doubts: {
      ...Object.fromEntries([1, 2, 3].map((i) => [`${i}.kavalleriedivision`, REASON_CAV])),
      ...Object.fromEntries([31, 32, 33, 34, 35, 36].map((i) => [`${i}.infanteriedivision`, `Il file utente la elenca al 1/1/1936 (struttura a 36 divisioni su 12 corpi), ma il CSV si ferma alla 30ª e la data di formazione della ${i}ª non è verificata. Da verificare.`])),
    },
  },
  {
    nation: 'USSR', file: 'source/urss_1936_oob.csv',
    doubts: {
      ...Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`${i + 1}°corpofucilieri`, 'Il file dà 23 corpi fucilieri con numerazione 1°–23°; il numero totale è citato come dato storico ma la numerazione sembra generica, non verificata. Da verificare.'])),
      ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`${i + 1}°corpodicavalleria`, 'Il file dà 7 corpi di cavalleria numerati 1°–7°; numero e numerazione non verificati. Da verificare.'])),
      ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`${i + 1}°corpomeccanizzato`, 'Wikipedia (Mechanised corps) indica 4 corpi meccanizzati a inizio 1936 e nomina l\'11º (Leningrado) e il 45º (Ucraina): la numerazione 1°–4° del file non coincide. Da verificare.'])),
    },
  },
];

export async function unitsBuilt() {
  const csvBuffer = await readFile(new URL(SOURCE_FILE, dir));
  const reviews = JSON.parse(await readFile(new URL('unit_reviews.json', dir), 'utf8')).reviews;
  const rows = parseCsv(csvBuffer.toString('utf8'), { name: 'unita_cronologia_1935_1945.csv' });
  const base = buildUnits(rows, reviews);
  let units = base; const sources1936 = [];
  for (const src of OOB1936_SOURCES) {
    const buffer = await readFile(new URL(src.file, dir));
    const { rows: oobRows, repaired, malformed } = parseOob1936Csv(buffer.toString('utf8'), { name: src.file });
    const merged = mergeOob1936(oobRows, units, { nation: src.nation, doubts: src.doubts });
    units = merged.units;
    sources1936.push({ nation: src.nation, file: src.file, sha256: createHash('sha256').update(buffer).digest('hex'), rows: oobRows.length + malformed.length, repairedRows: repaired, malformedRows: malformed, notImported: merged.skipped });
  }
  // Template da rivedere: il file URSS non contiene divisioni di fucilieri, solo 23 corpi con "tipicamente 2-3 divisioni": 2 per corpo (limite basso del file) = 46 segnaposto inattivi.
  const rifleCorps = units.filter((u) => u.nation === 'USSR' && /Corpo fucilieri$/.test(u.name)).map((u) => u.name);
  units = [...units, ...makeDivisionPlaceholders({
    nation: 'USSR', idPrefix: 'S36-USSR-F', namePrefix: 'Divisione fucilieri 1936 (segnaposto)', category: 'infantry', variant: 'rifle', corps: rifleCorps, perCorps: 2, startYear: 1936,
    reason: 'Segnaposto: il file utente cita 23 corpi fucilieri con 2-3 divisioni ciascuno ma non elenca le divisioni; 2 per corpo = limite basso. Numeri, nomi e distretti reali da inserire.',
  })];
  for (const id of Object.keys(reviews)) if (!units.some((u) => u.id === id)) throw new Error(`revisione ${id}: unità inesistente nel CSV`);
  return {
    schema: UNITS_SCHEMA,
    quality: 'DA_VERIFICARE',
    note: 'Catalogo cronologico generato dal CSV dell\'utente: NON è l\'ordine di battaglia del 1936. Le date sono solo anni (inizio assunto al 1° gennaio); 1935 = inizio della finestra del CSV, non data di costituzione. Le unità con revisione date_doubt/duplicate/excluded/faction_doubt sono inattive nella politica strict.',
    source: { file: SOURCE_FILE, sha256: createHash('sha256').update(csvBuffer).digest('hex'), rows: rows.length },
    sources1936,
    units,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await unitsBuilt();
  await writeFile(new URL('units.json', dir), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`units.json: ${doc.units.length} unità`);
}
