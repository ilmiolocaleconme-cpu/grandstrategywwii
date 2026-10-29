// Genera data/resources/extraction_baseline.json: estrazione giornaliera di base 1936 per entità politica (t di gioco al giorno), dai Mt reali di
// production_1936.json, dai fattori (extraction_factors.json) e dalle ripartizioni per provincia. Piccolo file per il ciclo giornaliero: nel browser
// non serve ricalcolare le ripartizioni. Le miniere costruite dal giocatore si sommano a runtime (state.mines).
// Uso: npm run build:extraction   (dopo ogni modifica a produzione, fattori o punti)
import fs from 'node:fs';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';

const j = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const ctx = { production: j('resources/production_1936.json'), factors: j('resources/extraction_factors.json'), scaleFile: j('resources/extraction_scale.json'), pointsByProvince: j('resources/resource_points.json').byProvince, extra: j('resources/resource_locations_extra.json') };
const RAW = ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur', 'copper', 'wheat', 'tin']; // il frumento dal 29/10/2026 (mangimificio): solo punti × scala, senza produzione storica
const ext = Object.fromEntries(RAW.map((r) => [r, resourceExtraction(r, ctx)]));
const territories = new Set();
for (const r of RAW) for (const id of ext[r].byProvince.keys()) territories.add(id.split('_')[1]);
const byTerritory = {};
for (const tr of [...territories].sort()) {
  const row = {};
  for (const r of RAW) { const v = Math.round(totalByPrefix(ext[r], tr) * 1000) / 1000; if (v > 0) row[r] = v; }
  if (Object.keys(row).length) byTerritory[tr] = row;
}
const doc = { schema: 'extraction-baseline-v1', quality: 'PROVISIONAL', unit: 't di gioco al giorno', note: 'Derivato da production_1936.json + extraction_factors.json (fattori provvisori) + resource_points.json. Rigenerare con npm run build:extraction. Non include le miniere costruite dal giocatore.', byTerritory };
fs.writeFileSync(new URL('../data/resources/extraction_baseline.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`estrazione di base: ${Object.keys(byTerritory).length} territori`);
