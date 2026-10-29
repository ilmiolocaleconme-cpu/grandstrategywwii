// Genera data/industry/initial_stocks.json dall'industria iniziale (regola: 150 giorni senza commercio, industria a pieno regime; approvata il 27/10/2026).
// Uso: npm run build:stocks   (dopo build:industry)
import fs from 'node:fs';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { computeInitialStocks } from '../src/data/initialStocks.js';

// Riserva minima di acciaio uguale per tutte (29/10/2026): pavimento di cassa (200 ECV) × acciaio per ECV delle costruzioni (2,5 t/ECV) = 500 t.
// Senza, chi non ha deficit di acciaio (produttori) o industria nei dati parte a 0 t e non può avviare nessun ordine (ogni ordine richiede acciaio).
export const DAYS = 150;
export const UTILISATION = 1;
const t = (p) => fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const j = (p) => JSON.parse(t(p));
const cat = loadIndustryCatalog({ factoriesCsv: t('industry/factories.csv'), structuresCsv: t('infrastructure/structures.csv'), categoriesCsv: t('industry/production_categories.csv') });
const ctx = { production: j('resources/production_1936.json'), factors: j('resources/extraction_factors.json'), scaleFile: j('resources/extraction_scale.json'), pointsByProvince: j('resources/resource_points.json').byProvince, extra: j('resources/resource_locations_extra.json') };
const industry = j('industry/initial_industry.json');
const RAW = ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur', 'copper'];
const ext = Object.fromEntries(RAW.map((r) => [r, resourceExtraction(r, ctx)]));
const supply = {};
for (const id of Object.keys(industry.nations)) supply[id] = Object.fromEntries(RAW.map((r) => [r, totalByPrefix(ext[r], id)]));
const stocks = computeInitialStocks({ industry, recipes: j('industry/recipes.json'), factoriesById: cat.byId, supply, days: DAYS, utilisation: UTILISATION });
const cashFloor = j('industry/initial_cash.json').floor;
const steelPerEcv = j('economy/economy.json').construction.steelPerEcv;
const STEEL_FLOOR = Math.round(cashFloor * steelPerEcv);
const doc = {
  schema: 'initial-stocks-v1',
  quality: 'DESIGN_DEFAULT',
  asOf: '1936-01-01',
  days: DAYS,
  utilisation: UTILISATION,
  unit: 't',
  note: 'Regola approvata in chat il 27/10/2026: ogni nazione con industria iniziale resiste 150 giorni senza commercio con l\'industria a pieno regime. Stock = giorni × (consumo − produzione nazionale), solo dove manca. Copre l\'industria, non l\'esercito (consumatori militari: Fase 5). I deficit di carbone delle nazioni piccole dipendono da dati di produzione 1936 mancanti (MISSING_DATA). Gli stock non sono sottratti a nessuno.',
  floor: { steel: STEEL_FLOOR },
  floorNote: `Riserva minima uguale per tutte le nazioni (decisione del 29/10/2026): ${cashFloor} ECV di cassa minima × ${steelPerEcv} t di acciaio per ECV = ${STEEL_FLOOR} t. Si applica come massimo (chi ha già più acciaio non cambia) e scala con la difficoltà come gli altri stock. Stima di progetto, non un dato storico.`,
  stocks,
};
fs.writeFileSync(new URL('../data/industry/initial_stocks.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`stock iniziali: ${Object.keys(stocks).length} entità, ${Object.values(stocks).reduce((s, x) => s + Object.keys(x).length, 0)} voci`);
