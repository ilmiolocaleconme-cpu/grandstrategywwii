// Costruzioni nelle zone urbane: una zona ha 10 slot di fabbrica (per parte), non i 14 della provincia madre.
import { allRecipeList, EQUIPMENT_RECIPE_LIST } from './_equipment_recipes.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame, validateState } from '../src/game/state.js';
import { createConstruction } from '../src/game/construction.js';
import { SLOT_CAPACITY } from '../src/rules/slots.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') });
const recipesFile = json('industry/recipes.json');
const catalog = { recipes: new Map([...recipesFile.recipes, ...EQUIPMENT_RECIPE_LIST].map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json');
const economy = json('economy/economy.json');
const sites = json('resources/mine_sites.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const cities = json('citta_grandi.json').features.map((f) => f.properties);
const cityIds = new Set(cities.map((c) => c.id));
const api = createConstruction({ catalog, economy, sites, hydro: json('resources/hydro_plants.json'), political, workersShare: population.workersShare.value, isCity: (id) => cityIds.has(id) });
const base = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start, difficulty: 'media' }).state;
const rich = (s) => ({ ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, balance: 1e7, population: 1e9, baseGridMw: 1e6, stocks: { ...s.nations.ITA.stocks, steel: 1e7 } } } });
const steel = (provinceId) => ({ kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId });
const cityZone = cities.find((c) => c.owner === 'ITA' && cityIds.has(c.id) && c.parentProvince && !c.parentProvince.includes('_SP'));

test('una zona urbana italiana accetta fabbriche fino alla capienza di parte, poi rifiuta', () => {
  assert.ok(cityZone, 'serve una zona urbana italiana');
  assert.equal(SLOT_CAPACITY.cityPart, 10);
  let s = rich(base);
  let accepted = 0; let last = null;
  for (let i = 0; i < SLOT_CAPACITY.cityPart + 1; i += 1) {
    const r = api.start(s, 'ITA', steel(cityZone.id));
    if (!r.ok) { last = r; break; }
    s = r.state; accepted += 1;
  }
  assert.equal(accepted, SLOT_CAPACITY.cityPart);
  assert.equal(last.reason, 'no_slot');
  assert.equal(last.capacity, SLOT_CAPACITY.cityPart);
  assert.deepEqual(validateState(s), []);
});
