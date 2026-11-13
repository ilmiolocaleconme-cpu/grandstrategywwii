// Genera data/industry/initial_stocks.json dall'industria iniziale (regola: 150 giorni senza commercio, industria a pieno regime; approvata il 27/10/2026).
// Uso: npm run build:stocks   (dopo build:industry)
import fs from 'node:fs';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';
import { loadIndustryCatalogFrom } from '../src/data/industry.js';
import { computeInitialStocks } from '../src/data/initialStocks.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, withEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { activeDivisions, militaryReserve, RESERVE_DAYS, MUNITIONS_ID } from '../src/rules/militaryReserve.js';

// Riserva minima di acciaio uguale per tutte (29/10/2026): pavimento di cassa (200 ECV) × acciaio per ECV delle costruzioni (2,5 t/ECV) = 500 t.
// Senza, chi non ha deficit di acciaio (produttori) o industria nei dati parte a 0 t e non può avviare nessun ordine (ogni ordine richiede acciaio).
export const DAYS = 150;
export const UTILISATION = 1;
const t = (p) => fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const j = (p) => JSON.parse(t(p));
const cat = loadIndustryCatalogFrom(t); // con le fabbriche del repo (mangimificio, allevamento...)
const ctx = { production: j('resources/production_1936.json'), factors: j('resources/extraction_factors.json'), scaleFile: j('resources/extraction_scale.json'), pointsByProvince: j('resources/resource_points.json').byProvince, extra: j('resources/resource_locations_extra.json') };
const industry = j('industry/initial_industry.json');
const RAW = ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur', 'copper', 'wheat', 'tin'];
const ext = Object.fromEntries(RAW.map((r) => [r, resourceExtraction(r, ctx)]));
const supply = {};
for (const id of Object.keys(industry.nations)) supply[id] = Object.fromEntries(RAW.map((r) => [r, totalByPrefix(ext[r], id)]));
const stocks = computeInitialStocks({ industry, recipes: withEquipmentRecipes(j('industry/recipes.json'), buildEquipmentRecipes(mergeEquipmentCatalogs(['catalog', 'catalog_deu', 'catalog_fra', 'catalog_gbr', 'catalog_ita', 'catalog_ussr', 'catalog_jpn', 'catalog_usa'].map((n) => j(`units/equipment/${n}.json`))), j('units/equipment/equipment_production.json'))), factoriesById: cat.byId, supply, days: DAYS, utilisation: UTILISATION });
// Riserva militare di munizioni (regola del 04/11/2026): 30 giorni del consumo di attacco delle divisioni attive al 1/1/1936.
// Il conteggio parte dal catalogo (units.json), non dall'industria: la copertura in divisioni intere è in src/rules/militaryReserve.js.
const unitsFile = j('units/units.json');
const reserveDivisions = activeDivisions(Array.isArray(unitsFile) ? unitsFile : unitsFile.units, j('military/ammo_consumption.json'));
for (const [nation, row] of Object.entries(militaryReserve({ divisions: reserveDivisions, factories: {}, days: RESERVE_DAYS }))) {
  if (row.reserve > 0) stocks[nation] = { ...(stocks[nation] ?? {}), [MUNITIONS_ID]: row.reserve };
}
// Mangime per il pool dei cavalli (13/11/2026): 30 giorni del mantenimento dei cavalli iniziali (horse_breeding.json), perché il pool mangia prima
// che il mangimificio produca: senza, il primo giorno muore l'1% del pool. Valore di progetto.
const HORSE_FEED_DAYS = 30;
const breeding = j('agriculture/horse_breeding.json');
for (const [nation, e] of Object.entries(breeding.initialPool?.byNation ?? {})) {
  const feed = Math.round(e.horses * breeding.upkeep.feedPerHorsePerDay * HORSE_FEED_DAYS);
  if (feed > 0) stocks[nation] = { ...(stocks[nation] ?? {}), feed: (stocks[nation]?.feed ?? 0) + feed };
}
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
