// Genera data/industry/initial_cash.json (cassa iniziale = 30 giorni di entrata + 200 ECV per tutte; approvata il 28/10/2026).
// Entrata a difficoltà Media: valore aggiunto (miniere nazionali + impianti a pieno regime − ingressi) + quota province + capitale; le città grandi non sono contate (DESIGN_DEFAULT).
// Uso: npm run build:cash   (dopo build:industry e build:stocks)
import fs from 'node:fs';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';
import { fullCapacityFlows } from '../src/data/recipes.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { dailyIncome } from '../src/rules/treasury.js';
import { buildNations } from '../src/game/economyState.js';

export const DAYS = 30;
export const FLOOR = 200;
const t = (p) => fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const j = (p) => JSON.parse(t(p));
const cat = loadIndustryCatalog({ factoriesCsv: t('industry/factories.csv'), structuresCsv: t('infrastructure/structures.csv'), categoriesCsv: t('industry/production_categories.csv') });
const recipes = new Map(j('industry/recipes.json').recipes.map((r) => [r.id, r]));
const ctx = { production: j('resources/production_1936.json'), factors: j('resources/extraction_factors.json'), scaleFile: j('resources/extraction_scale.json'), pointsByProvince: j('resources/resource_points.json').byProvince, extra: j('resources/resource_locations_extra.json') };
const RAW = ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur', 'copper', 'wheat', 'tin']; // il frumento estratto vale entrata come le altre materie (dal 29/10/2026)
const ext = Object.fromEntries(RAW.map((r) => [r, resourceExtraction(r, ctx)]));
const political = j('political_1936.json');
const economy = j('economy/economy.json');
const nations = buildNations({ political, nationIds: j('nations.json').map((n) => n.id), industry: j('industry/initial_industry.json'), stocks: j('industry/initial_stocks.json'), cash: null });
const provincesByOwner = {};
for (const f of fs.readdirSync(new URL('../data/provinces/', import.meta.url))) {
  if (f.startsWith('_') || !f.endsWith('.json')) continue;
  for (const x of j(`provinces/${f}`).features ?? []) provincesByOwner[x.properties.owner] = (provincesByOwner[x.properties.owner] ?? 0) + 1;
}
const out = {};
for (const id of Object.keys(nations).sort()) {
  const goods = {}; const inputs = {};
  const territories = political.filter((e) => (e.owner ?? e.id) === id).map((e) => e.id);
  for (const tr of territories) for (const r of RAW) { const v = totalByPrefix(ext[r], tr); if (v > 0) goods[r] = (goods[r] ?? 0) + v; }
  for (const f of nations[id].facilities) {
    const r = recipes.get(f.recipeId); const fl = fullCapacityFlows(r, cat.byId.get(f.type));
    if (fl.outputUnit === 'MW') { inputs.coal = (inputs.coal ?? 0) + fl.inputsPerDay.coal; continue; }
    goods[r.output.product] = (goods[r.output.product] ?? 0) + fl.outputPerDay;
    for (const [k, q] of Object.entries(fl.inputsPerDay)) inputs[k] = (inputs[k] ?? 0) + q;
  }
  const provinces = territories.reduce((s, e) => s + (provincesByOwner[e] ?? 0), 0);
  const inc = dailyIncome({ goods, inputs, territory: { provinces, cities: 0, capitals: 1 } }, economy, 'media');
  const incomePerDay = Math.round(inc.total * 100) / 100; // la cassa usa l'entrata arrotondata, così il file è verificabile a mano
  out[id] = { incomePerDay, provinces, cash: Math.round((DAYS * incomePerDay + FLOOR) * 100) / 100 };
}
const doc = {
  schema: 'initial-cash-v1', quality: 'DESIGN_DEFAULT', asOf: '1936-01-01', currency: 'ECV', days: DAYS, floor: FLOOR,
  note: 'Cassa iniziale = 30 giorni di entrata (difficoltà Media: miniere nazionali + impianti a pieno regime − ingressi + quota province + capitale) + 200 ECV uguali per tutte (decisioni del 28/10/2026). Le città grandi non sono contate. A runtime la cassa è moltiplicata per stockMul della difficoltà (1,5 · 1 · 0,7). Stima di progetto, non un dato storico.',
  nations: out,
};
fs.writeFileSync(new URL('../data/industry/initial_cash.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`cassa iniziale: ${Object.keys(out).length} proprietari, USA ${out.USA.cash} ECV, mediana fascia C ${[...Object.entries(out)].filter(([k]) => j('industry/initial_industry.json').tierC.includes(k)).map(([, v]) => v.cash).sort((a, b) => a - b)[25]} ECV`);
