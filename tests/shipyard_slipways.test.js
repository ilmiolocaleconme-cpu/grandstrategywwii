// Scali dei cantieri navali (25/11/2026): livelli 1-4 con tonnellaggio massimo, livelli iniziali del 1936, potenziamento come i porti. Costi DESIGN_DEFAULT.
import { allRecipeList } from './_equipment_recipes.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createConstruction } from '../src/game/construction.js';
import { serializeSave, parseSave } from '../src/game/save.js';
import { validateShipyards, validateSlipwayLevels, slipwayCost, slipwayFits, maxSlipwayLevel } from '../src/data/shipyards.js';
import { historicYardsByCity, slipwayLevelIn, slipwayCitiesOf, validateShipyardsShape } from '../src/game/shipyardsState.js';
import { provinceSlipwayRows } from '../src/ui/shipyardView.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const levels = json('naval/slipway_levels.json'); const doc = json('naval/shipyards_1936.json'); const coastal = json('ports/coastal_cities.json').cities;
const yards = { levels, coastal, historic: historicYardsByCity(doc) };
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') });
const catalog = { recipes: new Map(allRecipeList().map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json') };
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json'); const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const build = createConstruction({ catalog, economy, sites: json('resources/mine_sites.json'), hydro: json('resources/hydro_plants.json'), political, workersShare: population.workersShare.value, shipyards: yards });
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const rich = (s) => ({ ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, balance: 1e7, population: 1e9, stocks: { ...s.nations.ITA.stocks, steel: 1e7 } } } });
const yardCity = (id) => doc.shipyards.find((y) => y.id === id).cittaId;
const finish = (s, days) => { let x = s; for (let i = 0; i < days; i += 1) x = build.constructionDay(advanceDay(x, [])); return x; };

test('dati: soglie crescenti, ultimo livello senza limite, livello 1 gratuito; ogni cantiere ha uno scalo 1-4; difetti segnalati', () => {
  assert.deepEqual(validateSlipwayLevels(levels), []);
  assert.deepEqual(validateShipyards(doc, { coastal, slipways: levels }), []);
  assert.equal(maxSlipwayLevel(levels), 4);
  assert.deepEqual(levels.levels.map((l) => l.maxTons), [3000, 15000, 38000, null]);
  const bad = structuredClone(levels); bad.levels[2].maxTons = 10000; bad.levels[3].ecv = 10; bad.levels[0].ecv = 5;
  const e = validateSlipwayLevels(bad).join();
  assert.match(e, /più tonnellaggio/); assert.match(e, /costa meno/); assert.match(e, /livello 1/);
  assert.match(validateShipyards({ ...doc, shipyards: [{ ...doc.shipyards[0], slipway: 5 }, ...doc.shipyards.slice(1)] }, { coastal, slipways: levels }).join(), /scalo/);
});

test('livelli iniziali scelti il 25/11/2026: corazzate grandi a livello 4, trattati a 3, nazioni minori a 1', () => {
  const lv = (id) => doc.shipyards.find((y) => y.id === id).slipway;
  for (const id of ['YARD-ITA_GENOVA', 'YARD-ITA_TRIESTE', 'YARD-JPN_KURE', 'YARD-JPN_NAGASAKI', 'YARD-DEU_AMBURGO', 'YARD-DEU_WILHELMSHAVEN', 'YARD-USA_NEW_YORK', 'YARD-USSR_LENINGRADO']) assert.equal(lv(id), 4, id);
  for (const id of ['YARD-DEU_KIEL', 'YARD-FRA_BREST', 'YARD-FRA_SAINT_NAZAIRE', 'YARD-GBR_GLASGOW', 'YARD-JPN_KOBE', 'YARD-GBR_BARROW_IN_FURNESS']) assert.equal(lv(id), 3, id);
  for (const id of ['YARD-ITA_TARANTO', 'YARD-FRA_TOLONE']) assert.equal(lv(id), 2, id);
  for (const id of ['YARD-POL_GDYNIA', 'YARD-SWE_MALMO']) assert.equal(lv(id), 1, id);
  // tonnellaggio: Yamato (64.000 t) solo al 4, King George V (36.700 t) dal 3, incrociatore da 10.000 t dal 2, cacciatorpediniere dal 1
  assert.ok(slipwayFits(levels, 4, 64000) && !slipwayFits(levels, 3, 64000));
  assert.ok(slipwayFits(levels, 3, 36700) && !slipwayFits(levels, 2, 36700));
  assert.ok(slipwayFits(levels, 2, 10000) && !slipwayFits(levels, 1, 10000) && slipwayFits(levels, 1, 1800));
});

test('potenziamento: Taranto da 2 a 3, costo pagato all\'ordine, un lavoro per città, completamento nello stato e nel salvataggio', () => {
  const taranto = yardCity('YARD-ITA_TARANTO');
  let s = rich(fresh());
  assert.equal(slipwayLevelIn(s, taranto, yards), 2);
  const cost = slipwayCost(levels, economy, 2, s.difficulty);
  const r = build.start(s, 'ITA', { kind: 'slipway', cittaId: taranto });
  assert.ok(r.ok, r.reason);
  assert.equal(r.entry.level, 3);
  assert.equal(r.state.nations.ITA.balance, Math.round((s.nations.ITA.balance - cost.ecv) * 1000) / 1000);
  assert.equal(build.start(r.state, 'ITA', { kind: 'slipway', cittaId: taranto }).reason, 'already_building');
  s = finish(r.state, cost.days);
  assert.equal(slipwayLevelIn(s, taranto, yards), 3);
  assert.equal(s.shipyards.slipways[taranto], 3);
  assert.deepEqual(validateState(s), []);
  assert.equal(parseSave(serializeSave(s)).state.shipyards.slipways[taranto], 3);
});

test('rifiuti: livello massimo, città senza cantiere, provincia non controllata, senza dati; stato non valido segnalato', () => {
  const s = rich(fresh());
  assert.equal(build.start(s, 'ITA', { kind: 'slipway', cittaId: yardCity('YARD-ITA_GENOVA') }).reason, 'max_level');
  const noYard = Object.entries(coastal).find(([id, c]) => c.owner === 'ITA' && !yards.historic.has(id) && slipwayCitiesOf(s, c.parentProvince, yards).length === 0)[0];
  assert.equal(build.start(s, 'ITA', { kind: 'slipway', cittaId: noYard }).reason, 'no_shipyard');
  assert.equal(build.start(s, 'ITA', { kind: 'slipway', cittaId: yardCity('YARD-FRA_BREST') }).reason, 'not_controlled');
  const bare = createConstruction({ catalog, economy, sites: json('resources/mine_sites.json'), hydro: json('resources/hydro_plants.json'), political, workersShare: population.workersShare.value });
  assert.equal(bare.start(s, 'ITA', { kind: 'slipway', cittaId: yardCity('YARD-ITA_TARANTO') }).reason, 'no_shipyard_data');
  assert.deepEqual(validateShipyardsShape(undefined), []);
  assert.ok(validateShipyardsShape({ slipways: { X: 7 } }).length > 0);
});

test('cantiere costruito in partita: scalo di livello 1 sulla prima città costiera della provincia; righe del pannello', () => {
  const s0 = rich(fresh());
  const [, c] = Object.entries(coastal).filter(([id, x]) => x.owner === 'ITA' && slipwayCitiesOf(s0, x.parentProvince, yards).length === 0).sort(([a], [b]) => (a < b ? -1 : 1))[0];
  const first = Object.keys(coastal).filter((id) => coastal[id].parentProvince === c.parentProvince).sort()[0];
  const fac = { id: 'test-yard', type: 'FCT-SHIPYARD', recipeId: s0.nations.ITA.facilities[0].recipeId, // oggi il cantiere non ha ricette: per il bilancio elettrico prendiamo quella di un impianto esistente
    territory: 'ITA', provinceId: c.parentProvince, damage: 0, priority: 99, active: true };
  const s = { ...s0, nations: { ...s0.nations, ITA: { ...s0.nations.ITA, facilities: [...s0.nations.ITA.facilities, fac] } } };
  assert.deepEqual(slipwayCitiesOf(s, c.parentProvince, yards), [first]);
  assert.equal(slipwayLevelIn(s, first, yards), 1);
  const rows = provinceSlipwayRows(s, c.parentProvince, { yards, build, nationId: 'ITA' });
  assert.equal(rows.length, 1);
  assert.ok(rows[0].ok && rows[0].cost.days > 0 && /Scalo medio/.test(rows[0].nextText), JSON.stringify(rows[0]));
});
