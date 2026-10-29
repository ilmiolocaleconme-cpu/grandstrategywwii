// Genera data/resources/production_1936.json dai due CSV di produzione 1936 (fusione: il completo prevale).
//   node scripts/build-production.js
import { readFile, writeFile } from 'node:fs/promises';
import { parseCsv } from '../src/data/csv.js';
import { mergeProduction, PRODUCTION_SCHEMA } from '../src/data/production.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

export async function productionBuilt() {
  const first = parseCsv(await readFile(dataUrl('resources/produzione_risorse_mondiale_1936.csv'), 'utf8'), { name: 'produzione_risorse_mondiale_1936.csv' });
  const complete = parseCsv(await readFile(dataUrl('resources/produzione_risorse_mondiale_completo_1936.csv'), 'utf8'), { name: 'produzione_risorse_mondiale_completo_1936.csv' });
  const research = parseCsv(await readFile(dataUrl('resources/produzione_stagno_1936.csv'), 'utf8'), { name: 'produzione_stagno_1936.csv' });
  return mergeProduction(first, complete, research);
}

export function productionFile({ rows, conflicts }) {
  return {
    schema: PRODUCTION_SCHEMA,
    quality: 'USER_ESTIMATE',
    unit: 'Mt/anno',
    note: 'Stime 1936 fornite dall\'utente (non verificate su fonti primarie; il ferro di USA, Francia, URSS, Regno Unito, Germania e Belgio coincide con US Bureau of Mines e NBER). Il file «completo» prevale sul primo dove si sovrappongono; le righe del primo che il completo non ha si aggiungono. Generato da scripts/build-production.js: non modificare a mano. Dal 29/10/2026 lo stagno (5 territori) viene da una terza sorgente, produzione_stagno_1936.csv: cifre dell\'International Tin Research and Development Council (Statistical Year Book 1937) riassunte in Nature 140, 176, in tonnellate lunghe, controllo incrociato col totale mondiale USGS (182.000 t metriche); NON sono stime dell\'utente e non sono verificate su fonti primarie. Riga con source «ricerca».',
    conversion: { realPerGame: 43.8, quality: 'DESIGN_DEFAULT', rationale: '1 acciaieria (100 t/giorno) ≈ 1,6 Mt/anno di acciaio reale → 1 t di gioco ≈ 43,8 t reali. Non ancora applicata ai punti delle province.' },
    rows,
    conflicts,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const built = await productionBuilt();
  await writeFile(dataUrl('resources/production_1936.json'), `${JSON.stringify(productionFile(built), null, 2)}\n`);
  console.log(`production_1936.json: ${built.rows.length} righe, ${built.conflicts.length} note`);
}
