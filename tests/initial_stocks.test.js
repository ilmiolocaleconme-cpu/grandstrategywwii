// Stock iniziali (27/10/2026): 150 giorni senza commercio per le nazioni con industria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';
import { computeInitialStocks, validateInitialStocks } from '../src/data/initialStocks.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const file = json('industry/initial_stocks.json');
const industry = json('industry/initial_industry.json');
const recipes = json('industry/recipes.json');
const ctx = { production: json('resources/production_1936.json'), factors: json('resources/extraction_factors.json'), scaleFile: json('resources/extraction_scale.json'), pointsByProvince: json('resources/resource_points.json').byProvince, extra: json('resources/resource_locations_extra.json') };
const RAW = ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur'];
const ext = Object.fromEntries(RAW.map((r) => [r, resourceExtraction(r, ctx)]));
const supply = Object.fromEntries(Object.keys(industry.nations).map((id) => [id, Object.fromEntries(RAW.map((r) => [r, totalByPrefix(ext[r], id)]))]));
const resourceIds = new Set(json('resources.json').map((r) => r.id));

test('valido, e coincide con il ricalcolo dalla regola (150 giorni, pieno regime)', () => {
  assert.deepEqual(validateInitialStocks(file, { resourceIds, industry }), []);
  assert.deepEqual(computeInitialStocks({ industry, recipes, factoriesById: cat.byId, supply, days: file.days, utilisation: file.utilisation }), file.stocks);
  assert.equal(file.days, 150);
});

test('valori chiave: Germania importa ferro e bauxite, Giappone petrolio, USA ferro; chi si basta non ha stock', () => {
  assert.equal(file.stocks.DEU.iron_ore, 227010);
  assert.equal(file.stocks.DEU.bauxite, 84000);
  assert.equal(file.stocks.JPN.oil, 12045);
  assert.equal(file.stocks.USA.iron_ore, 250875);
  assert.equal(file.stocks.NLD, undefined);
  assert.equal(file.stocks.USSR.iron_ore, undefined);
  for (const id of industry.tierC) assert.equal(file.stocks[id], undefined, `${id}: la fascia C non ha industria né stock`);
});

test('gli stock bastano davvero: giorni = stock / deficit giornaliero, non meno di 150', () => {
  // con 1 giorno di regola il totale è circa un centocinquantesimo (arrotondamento per eccesso)
  const one = computeInitialStocks({ industry, recipes, factoriesById: cat.byId, supply, days: 1, utilisation: 1 });
  for (const [id, s] of Object.entries(file.stocks)) for (const [r, v] of Object.entries(s)) assert.ok(v >= 150 * (one[id][r] - 1) && v <= 150 * one[id][r], `${id} ${r}`);
});

test('errori segnalati: risorsa inesistente, elettricità come stock, nazione senza industria', () => {
  const bad = structuredClone(file); bad.stocks.DEU.titanio = 5; bad.stocks.USA.electricity = 5; bad.stocks.ALB = { coal: 5 };
  const e = validateInitialStocks(bad, { resourceIds, industry }).join('|');
  assert.match(e, /risorsa inesistente titanio/); assert.match(e, /flusso/); assert.match(e, /ALB non ha industria/);
});
