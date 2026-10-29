// Entità di una provincia dall'id (29/10/2026): MAR_ES, NLD_EI e JPN_MANDATE hanno un trattino basso nell'id e risultavano «non controllate».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entityOfProvinceId } from '../src/data/provinceOwner.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame } from '../src/game/state.js';
import { createConstruction } from '../src/game/construction.js';
import { hydroMwByOwner } from '../src/game/economySystem.js';
import { provinceBuildOptions } from '../src/ui/buildOptions.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const political = json('political_1936.json');
const ids = political.map((e) => e.id);

test('l\'entità è la più lunga che combacia: MAR_ES non diventa MAR, NLD_EI non diventa NLD', () => {
  assert.equal(entityOfProvinceId('P_MAR_ES_PROTETTORATO_NORD_SP1', ids), 'MAR_ES');
  assert.equal(entityOfProvinceId('P_MAR_RABAT', ids), 'MAR');
  assert.equal(entityOfProvinceId('P_NLD_EI_ACEH', ids), 'NLD_EI');
  assert.equal(entityOfProvinceId('P_NLD_UTRECHT', ids), 'NLD');
  assert.equal(entityOfProvinceId('P_JPN_MANDATE_CAROLINE', ids), 'JPN_MANDATE');
  assert.equal(entityOfProvinceId('P_ITA_ROMA', ids), 'ITA');
});

test('id sconosciuto: ripiego sulla seconda parte dell\'id, senza errori', () => {
  assert.equal(entityOfProvinceId('P_ZZZ_X', ids), 'ZZZ');
  assert.equal(entityOfProvinceId('P_ITA_X', new Set(['ITA'])), 'ITA');
});

test('dati reali: per tutte le province l\'entità ricavata dall\'id è il proprietario del file', () => {
  const meta = json('provinces/_meta.json');
  let n = 0;
  for (const code of meta.order) {
    for (const f of json(`provinces/${code}.json`).features) {
      n += 1;
      assert.equal(entityOfProvinceId(f.properties.id, ids), f.properties.owner, f.properties.id);
    }
  }
  assert.ok(n > 3000);
});

test('dati reali: ogni centrale idroelettrica e ogni sito minerario risale a un\'entità politica', () => {
  for (const p of json('resources/hydro_plants.json').plants) assert.ok(ids.includes(entityOfProvinceId(p.provinceId, ids)), p.provinceId);
  for (const id of Object.keys(json('resources/mine_sites.json').byProvince)) assert.ok(ids.includes(entityOfProvinceId(id, ids)), id);
});

test('costruzioni: le province di MAR_ES, NLD_EI e JPN_MANDATE sono del controllore, non più «non controllate»', () => {
  const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
  const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId };
  const population = json('population/population.json'); const economy = json('economy/economy.json'); const sites = json('resources/mine_sites.json');
  const nationIds = json('nations.json').map((n) => n.id);
  const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
  const build = createConstruction({ catalog, economy, sites, hydro: json('resources/hydro_plants.json'), political, workersShare: population.workersShare.value });
  const ctx = { build, catalog, sites, economy, resourceLabel: (id) => id };
  const cases = [['ESP', 'P_MAR_ES_PROTETTORATO_NORD_SP1'], ['NLD', 'P_NLD_EI_ACEH'], ['JPN', 'P_JPN_MANDATE_CAROLINE']];
  for (const [nation, province] of cases) {
    const state = newGame({ nation, political, ownersWithProvinces: nationIds, start }).state;
    const entity = entityOfProvinceId(province, ids);
    assert.equal(state.control[entity], nation, `${entity} è controllato da ${nation} nel 1936`);
    assert.notEqual(provinceBuildOptions(state, nation, province, ctx).reason, 'not_controlled', province);
    const r = build.start(state, nation, { kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId: province });
    assert.notEqual(r.reason, 'not_controlled', `${province}: start`);
  }
});
