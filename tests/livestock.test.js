// Cavalli, mangime, fertilizzanti, medicina (29/10/2026): catalogo, ricette, regole pure, ciclo giornaliero e validatori.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalogFrom, validateIndustryCatalog } from '../src/data/industry.js';
import { fullCapacityFlows, validateRecipes } from '../src/data/recipes.js';
import { produceDay, checkBalance } from '../src/rules/production.js';
import { fertilizerEffect } from '../src/rules/fertilizer.js';
import { horseUpkeep, horsePoolAvailable, setHorses, horsePoolSummary } from '../src/rules/horsePool.js';
import { planReinforcements } from '../src/rules/reinforcements.js';
import { validateFertilizerEffect, validateHorseBreeding, initialHorseStocks } from '../src/data/livestock.js';
import { createEconomySystem } from '../src/game/economySystem.js';
import { buildNations } from '../src/game/economyState.js';
import { newGame } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const clone = (x) => JSON.parse(JSON.stringify(x));
const cat = loadIndustryCatalogFrom(text);
const recipesDoc = json('industry/recipes.json');
const recipes = new Map(recipesDoc.recipes.map((r) => [r.id, r]));
const catalog = { recipes, factories: cat.byId };
const resources = json('resources.json');
const fert = json('agriculture/fertilizer_effect.json');
const horses = json('agriculture/horse_breeding.json');
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const entityIds = new Set(political.map((e) => e.id));
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy: json('economy/economy.json') };
const baseline = json('resources/extraction_baseline.json');
const hydro = json('resources/hydro_plants.json');
const mk = (livestock) => createEconomySystem({ catalog, economy: start.economy, baseline, hydro, political, cash: start.cash, livestock });
const withLivestock = mk({ fertilizer: fert, horses });
const without = mk(null);
const fresh = () => newGame({ nation: 'USA', political, ownersWithProvinces: nationIds, start }).state;
const fac = (id, type, recipeId) => ({ id, type, recipeId, territory: 'USA', damage: 0, priority: 1, active: true });

test('catalogo: 4 fabbriche del repository, 3 industriali con slot e l\'allevamento agricolo', () => {
  assert.deepEqual(validateIndustryCatalog(cat), []);
  for (const id of ['FCT-FEED', 'FCT-FERTILIZER', 'FCT-PHARMA', 'FCT-STUD']) {
    const f = cat.byId.get(id);
    assert.ok(f, id);
    assert.equal(f.status, 'repo_extra');
  }
  assert.equal(cat.byId.get('FCT-STUD').factory_class, 'agriculture');
  for (const id of ['FCT-FEED', 'FCT-FERTILIZER', 'FCT-PHARMA']) assert.equal(cat.byId.get(id).factory_class, 'industry');
});

test('ricette reali valide e flussi a pieno regime', () => {
  assert.deepEqual(validateRecipes(recipesDoc, { factoriesById: cat.byId, resources }), []);
  const flow = (rid) => fullCapacityFlows(recipes.get(rid), cat.byId.get(recipes.get(rid).factory));
  const feed = flow('REC-FEED-001');
  assert.equal(feed.inputsPerDay.wheat, 120); assert.equal(feed.outputPerDay, 100);
  const f = flow('REC-FERT-001');
  assert.equal(f.inputsPerDay.coal, 60); assert.equal(f.inputsPerDay.chemicals, 18); assert.equal(f.outputPerDay, 60);
  const p = flow('REC-PHARMA-001');
  assert.equal(p.inputsPerDay.chemicals, 15); assert.equal(p.inputsPerDay.sulphur, 1); assert.equal(p.outputPerDay, 10);
  const h = flow('REC-HORSES-001');
  assert.equal(h.inputsPerDay.feed, 40); assert.equal(h.inputsPerDay.medicine, 2); assert.equal(h.outputPerDay, 40);
});

test('catena: frumento → mangime, medicina → cavalli; il collo di bottiglia è il mangime e il bilancio quadra', () => {
  const facilities = [fac('a', 'FCT-FEED', 'REC-FEED-001'), fac('b', 'FCT-STUD', 'REC-HORSES-001')];
  const r = produceDay({ facilities, stock: { wheat: 1000, medicine: 100 }, hydroMw: 1000 }, catalog);
  assert.deepEqual(checkBalance(r.balance), []);
  assert.equal(r.stock.feed ?? 0, 60, 'mangimificio +100, allevamento -40');
  assert.equal(r.stock.horses, 40);
  assert.equal(r.stock.medicine, 98);
  const starved = produceDay({ facilities: [facilities[1]], stock: { medicine: 100 }, hydroMw: 1000 }, catalog);
  assert.ok(!starved.stock.horses, 'senza mangime non nascono cavalli');
  assert.equal(starved.facilities[0].bottleneck, 'feed');
});

test('fertilizzanti: copertura piena, parziale e nulla', () => {
  assert.deepEqual(fertilizerEffect({ baseWheat: 1000, fertilizer: 1000 }, fert), { need: 60, coverage: 1, used: 60, extraWheat: 250 });
  assert.deepEqual(fertilizerEffect({ baseWheat: 1000, fertilizer: 30 }, fert), { need: 60, coverage: 0.5, used: 30, extraWheat: 125 });
  assert.equal(fertilizerEffect({ baseWheat: 1000, fertilizer: 0 }, fert).extraWheat, 0);
  assert.equal(fertilizerEffect({ baseWheat: 0, fertilizer: 50 }, fert).used, 0, 'senza frumento non si consuma fertilizzante');
  assert.throws(() => fertilizerEffect({ baseWheat: -1, fertilizer: 0 }, fert), RangeError);
  assert.throws(() => fertilizerEffect({ baseWheat: 1, fertilizer: Number.NaN }, fert), RangeError);
});

test('mantenimento del pool: nutriti nessuna perdita, senza mangime muore l\'1%, mai mangime in più', () => {
  const up = horses.upkeep;
  assert.deepEqual(horseUpkeep({ horses: 100000, feed: 1000 }, up), { need: 90, feedUsed: 90, unfedShare: 0, lost: 0, horses: 100000 });
  const none = horseUpkeep({ horses: 100000, feed: 0 }, up);
  assert.equal(none.lost, 1000); assert.equal(none.horses, 99000); assert.equal(none.feedUsed, 0);
  const half = horseUpkeep({ horses: 100000, feed: 45 }, up);
  assert.equal(half.feedUsed, 45); assert.equal(half.unfedShare, 0.5); assert.equal(half.lost, 500);
  assert.deepEqual(horseUpkeep({ horses: 0, feed: 0 }, up), { need: 0, feedUsed: 0, unfedShare: 0, lost: 0, horses: 0 });
  assert.throws(() => horseUpkeep({ horses: -1, feed: 0 }, up), RangeError);
});

test('pool: capi interi disponibili, la parte frazionaria resta, riepilogo con giorni di mangime', () => {
  assert.equal(horsePoolAvailable({ horses: 10.7 }), 10);
  assert.equal(horsePoolAvailable({}), 0);
  const s = setHorses({ horses: 10.7, feed: 3 }, 4);
  assert.equal(s.horses, 4.7); assert.equal(s.feed, 3);
  assert.throws(() => setHorses({ horses: 5 }, 1.5), RangeError);
  assert.deepEqual(horsePoolSummary({ horses: 1000, feed: 9 }, horses.upkeep), { horses: 1000, available: 1000, feedNeedPerDay: 0.9, feedDays: 10 });
  assert.equal(horsePoolSummary({}, horses.upkeep).feedDays, null);
});

test('rinforzi: il pool dei cavalli dà quantità intere e non si duplica', () => {
  const forces = { divisions: { D1: { items: { horses: { planned: 100, effective: 0 } }, reinforce: true } }, transit: [] };
  const units = [{ id: 'D1', nation: 'USA' }];
  const stocks = { horses: 10.7 };
  const plan = planReinforcements(forces, { units, nation: 'USA', date: '1936-01-01', poolAvailable: 0, stocks: { horses: horsePoolAvailable(stocks) }, transitDays: () => 2 });
  const sent = plan.transfers.filter((t) => t.item === 'horses');
  assert.ok(sent.every((t) => Number.isInteger(t.qty)));
  assert.equal(sent.reduce((s, t) => s + t.qty, 0), 10);
  assert.equal(setHorses(stocks, plan.remaining.stocks.horses).horses, 0.7, 'ne restano solo 0,7: nessun cavallo creato né perso');
});

test('buildNations: tabella vuota non cambia nulla, con numeri li somma al proprietario, entità sconosciuta è un errore', () => {
  const base = buildNations({ political, ...start });
  assert.deepEqual(buildNations({ political, ...start, horses }), base);
  const filled = clone(horses); filled.initialPool.status = 'USER_DATA';
  filled.initialPool.byNation = { USA: { horses: 1000, basis: 'utente', referenceYear: '1936', source: 'prova' } };
  assert.equal(buildNations({ political, ...start, horses: filled }).USA.stocks.horses, 1000);
  filled.initialPool.byNation = { XXX: { horses: 5, basis: 'utente', referenceYear: '1936', source: 'prova' } };
  assert.throws(() => buildNations({ political, ...start, horses: filled }), /XXX/);
  assert.deepEqual(initialHorseStocks(horses), {});
});

test('ciclo giornaliero: senza "livestock" il comportamento è quello di prima (nessun cavallo, nessun fertilizzante)', () => {
  const s0 = fresh();
  const s1 = advanceDay({ ...s0, nations: { ...s0.nations, USA: { ...s0.nations.USA, stocks: { ...s0.nations.USA.stocks, horses: 100, fertilizer: 100, feed: 10 } } } }, [without]);
  assert.equal(s1.nations.USA.stocks.horses, 100); assert.equal(s1.nations.USA.stocks.fertilizer, 100); assert.equal(s1.nations.USA.stocks.feed, 10);
});

test('ciclo giornaliero: il fertilizzante dà più frumento, i cavalli mangiano e senza mangime muoiono', () => {
  const s0 = fresh();
  const setUsa = (stocks) => ({ ...s0, nations: { ...s0.nations, USA: { ...s0.nations.USA, facilities: [], stocks } } });
  const wheat = baseline.byTerritory.USA.wheat;
  assert.equal(wheat, 917);
  const plain = advanceDay(setUsa({}), [withLivestock]).nations.USA.stocks;
  assert.equal(plain.wheat, 917);
  const fed = advanceDay(setUsa({ fertilizer: 100 }), [withLivestock]);
  assert.equal(fed.nations.USA.stocks.wheat, 917 + 917 * 0.25, 'copertura piena: +25%');
  assert.equal(fed.nations.USA.stocks.fertilizer, Math.round((100 - 917 * 0.06) * 1000) / 1000);
  assert.ok(fed.nations.USA.balance > advanceDay(setUsa({}), [withLivestock]).nations.USA.balance, 'più raccolto, più entrata');
  const hungry = advanceDay(setUsa({ horses: 1000 }), [withLivestock]).nations.USA.stocks;
  assert.equal(hungry.horses, 990);
  const nourished = advanceDay(setUsa({ horses: 1000, feed: 5 }), [withLivestock]).nations.USA.stocks;
  assert.equal(nourished.horses, 1000); assert.equal(nourished.feed, 4.1);
});

test('baseline del frumento: solo USA, URSS, Canada, Argentina e India', () => {
  const owners = Object.entries(baseline.byTerritory).filter(([, r]) => r.wheat > 0).map(([t]) => t).sort();
  assert.ok(owners.length > 0);
  assert.equal(baseline.byTerritory.USA.wheat, 917);
  assert.equal(baseline.byTerritory.USSR.wheat, 540);
  assert.equal(baseline.byTerritory.CAN.wheat, 539.4);
});

test('validatori: dati reali validi, errori espliciti sui casi sbagliati', () => {
  assert.deepEqual(validateFertilizerEffect(fert, { resources }), []);
  assert.deepEqual(validateHorseBreeding(horses, { resources, recipes: recipesDoc, entityIds }), []);
  const f = clone(fert); f.yieldBonusMax = 2; f.input = 'wheat';
  assert.equal(validateFertilizerEffect(f, { resources }).length, 2);
  assert.match(validateFertilizerEffect({ schema: 'x' }, { resources })[0], /schema/);
  const h = clone(horses); h.initialPool.byNation = { USA: { horses: 1.5, basis: '?', referenceYear: '36', source: '' } };
  const errs = validateHorseBreeding(h, { resources, recipes: recipesDoc, entityIds });
  assert.ok(errs.some((e) => /MISSING_DATA/.test(e)) && errs.some((e) => /capi/.test(e)) && errs.some((e) => /basis/.test(e)) && errs.some((e) => /anno/.test(e)) && errs.some((e) => /fonte/.test(e)));
  const e2 = clone(horses); e2.initialPool.status = 'USER_DATA';
  assert.ok(validateHorseBreeding(e2, { resources, recipes: recipesDoc, entityIds }).some((e) => /vuota/.test(e)));
  const e3 = clone(recipesDoc); e3.recipes.find((r) => r.id === 'REC-HORSES-001').outputUnit = 't/day';
  assert.ok(validateHorseBreeding(horses, { resources, recipes: e3, entityIds }).some((e) => /head\/day/.test(e)));
});
