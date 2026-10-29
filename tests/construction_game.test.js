// Costruzioni nel gioco (28/10/2026): costi, vincoli, coda, completamento, miniere, ciclo con l'economia.
// Le province degli ordini sono quelle «madre» (resource_points.json, slot per provincia madre): le sponde di un fiume non moltiplicano gli slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay, advanceDays } from '../src/game/engine.js';
import { createEconomySystem } from '../src/game/economySystem.js';
import { createConstruction } from '../src/game/construction.js';
import { factoryBuildCost, validateEconomy } from '../src/data/economy.js';
import { workersState } from '../src/rules/workers.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const recipesFile = json('industry/recipes.json');
const catalog = { recipes: new Map(recipesFile.recipes.map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json');
const economy = json('economy/economy.json');
const sites = json('resources/mine_sites.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const share = population.workersShare.value;
const provinceFirst = (code) => json(`provinces/${code}.json`).features[0].properties.id;
const allProvinceIds = new Set(readdirSync(new URL('../data/provinces/', import.meta.url)).filter((f) => !f.startsWith('_') && f.endsWith('.json')).flatMap((f) => json(`provinces/${f}`).features.flatMap((x) => [x.properties.id, x.properties.parentProvince ?? x.properties.id])));
const api = createConstruction({ catalog, economy, sites, hydro: json('resources/hydro_plants.json'), political, workersShare: share, provinceExists: (id) => allProvinceIds.has(id) });
const eco = createEconomySystem({ catalog, economy, baseline: json('resources/extraction_baseline.json'), hydro: json('resources/hydro_plants.json'), political, cash: start.cash, sites });
const SYSTEMS = [api.constructionDay, eco];
// il giocatore è sempre l'Italia: le nazioni degli ordini sono indipendenti da chi gioca
const fresh = (difficulty = 'media') => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start, difficulty }).state;
const rich = (s, id) => ({ ...s, nations: { ...s.nations, [id]: { ...s.nations[id], balance: 1e7, population: 1e9, baseGridMw: 1e6, stocks: { ...s.nations[id].stocks, steel: 1e7 } } } });
const steelOrder = (provinceId) => ({ kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId });

test('costo di una fabbrica: acciaieria 120 ECV → 300 t di acciaio (2,5 t/ECV), 45 giorni, 500 lavoratori; difficoltà come moltiplicatori', () => {
  const f = cat.byId.get('FCT-STEEL');
  assert.deepEqual(factoryBuildCost(economy, f, 'media'), { ecv: 120, days: 45, steel: 300, workers: 500 });
  assert.deepEqual(factoryBuildCost(economy, f, 'reale'), { ecv: 180, days: 59, steel: 450, workers: 500 });
  assert.deepEqual(factoryBuildCost(economy, f, 'facile'), { ecv: 60, days: 32, steel: 150, workers: 500 });
  assert.equal(factoryBuildCost(economy, cat.byId.get('FCT-SHIPYARD'), 'media').steel, 625);
  assert.deepEqual(validateEconomy(economy, { resources: json('resources.json'), recipes: recipesFile }), []);
});

test('ordine di una fabbrica: paga cassa e acciaio, occupa i lavoratori, 45 giorni dopo l\'impianto esiste e la coda è vuota', () => {
  const s0 = fresh(); const prov = provinceFirst('ITA');
  const r = api.start(s0, 'ITA', steelOrder(prov));
  assert.equal(r.ok, true, JSON.stringify(r));
  const n = r.state.nations.ITA;
  assert.equal(n.balance, Math.round((s0.nations.ITA.balance - 120) * 1000) / 1000);
  assert.equal(n.stocks.steel, s0.nations.ITA.stocks.steel - 300);
  assert.equal(n.construction.length, 1);
  assert.equal(workersState(n, { factoriesById: cat.byId, share }).building, 500);
  assert.deepEqual(validateState(r.state), []);
  assert.equal(s0.nations.ITA.construction.length, 0, 'lo stato precedente non viene modificato');
  let s = r.state;
  for (let i = 0; i < 44; i += 1) s = api.constructionDay(advanceDay(s, []));
  assert.equal(s.nations.ITA.construction[0].daysLeft, 1, 'al giorno 44 manca ancora un giorno');
  s = api.constructionDay(advanceDay(s, []));
  assert.equal(s.nations.ITA.construction.length, 0);
  const built = s.nations.ITA.facilities.filter((f) => f.provinceId === prov);
  assert.equal(built.length, 1); assert.equal(built[0].type, 'FCT-STEEL'); assert.equal(built[0].damage, 0);
  const w = workersState(s.nations.ITA, { factoriesById: cat.byId, share });
  assert.equal(w.building, 0); assert.equal(w.employed, workersState(s0.nations.ITA, { factoriesById: cat.byId, share }).employed + 500);
  assert.deepEqual(validateState(s), []);
});

test('vincoli: denaro e acciaio mancanti sono elencati; provincia altrui, ricetta sbagliata e fabbrica ignota rifiutate', () => {
  const base = fresh('media', 'ALB');
  const s = { ...base, nations: { ...base.nations, ALB: { ...base.nations.ALB, stocks: {} } } }; // senza la riserva minima di acciaio (29/10/2026): qui si prova il vincolo
  const r = api.start(s, 'ALB', steelOrder(provinceFirst('ALB')));
  assert.equal(r.ok, false); assert.equal(r.reason, 'missing');
  assert.ok(r.missing.some((m) => m.what === 'steel' && m.need === 300 && m.have === 0));
  assert.equal(api.start(fresh(), 'ITA', steelOrder(provinceFirst('FRA'))).reason, 'not_controlled');
  assert.equal(api.start(fresh(), 'ITA', { ...steelOrder(provinceFirst('ITA')), recipeId: 'REC-ALU-001' }).reason, 'recipe_mismatch');
  assert.equal(api.start(fresh(), 'ITA', { ...steelOrder(provinceFirst('ITA')), factoryId: 'FCT-NOPE' }).reason, 'unknown_factory');
  assert.equal(api.start(fresh(), 'XXX', steelOrder('P_ITA_X')).reason, 'unknown_nation');
  assert.equal(api.start(fresh(), 'ITA', steelOrder('P_ITA_INESISTENTE')).reason, 'unknown_province');
});

test('energia: con 40 MW di rete di base si costruiscono 3 acciaierie (12 MW ciascuna), la quarta no', () => {
  let s = fresh('media', 'ALB'); s = { ...s, nations: { ...s.nations, ALB: { ...s.nations.ALB, balance: 1e6, stocks: { steel: 1e6 }, population: 1e9 } } };
  const prov = provinceFirst('ALB');
  for (let i = 0; i < 3; i += 1) { const r = api.start(s, 'ALB', steelOrder(prov)); assert.equal(r.ok, true, `ordine ${i + 1}`); s = r.state; }
  const r4 = api.start(s, 'ALB', steelOrder(prov));
  assert.equal(r4.ok, false);
  assert.ok(r4.missing.some((m) => m.what === 'energyMw' && m.need === 12 && m.have === 4));
});

test('lavoratori: la riserva limita le costruzioni; slot: 14 per provincia, il 15° è rifiutato', () => {
  let s = rich(fresh(), 'ITA'); const prov = provinceFirst('ITA');
  for (let i = 0; i < 14; i += 1) { const r = api.start(s, 'ITA', steelOrder(prov)); assert.equal(r.ok, true, `ordine ${i + 1}`); s = r.state; }
  const r15 = api.start(s, 'ITA', steelOrder(prov));
  assert.equal(r15.reason, 'no_slot'); assert.equal(r15.capacity, 14);
  const poor = { ...fresh(), nations: { ...fresh().nations, ITA: { ...fresh().nations.ITA, population: 200000, balance: 1e6, stocks: { steel: 1e6 } } } }; // riserva = 1.000, occupati più di 1.000
  const w = workersState(poor.nations.ITA, { factoriesById: cat.byId, share });
  assert.ok(w.overdrawn || w.free < 500, `liberi ${w.free}`);
  const r = api.start(poor, 'ITA', steelOrder(prov));
  assert.equal(r.ok, false); assert.ok(r.missing.some((m) => m.what === 'workers'));
});

test('miniere: tre livelli in ordine, ognuna porta più estrazione; quarto livello, doppio ordine e sito inesistente rifiutati', () => {
  const [pid, res] = Object.entries(sites.byProvince).filter(([p, r]) => p.startsWith('P_DEU_') && r.coal && r.coal.extraPerDay[0] > 1).map(([p]) => [p, 'coal'])[0];
  let s = rich(fresh(), 'DEU');
  const coal = (x) => x.nations.DEU.stocks.coal ?? 0;
  const outBefore = coal(advanceDay(s, [eco])) - coal(s);
  const extras = sites.byProvince[pid][res].extraPerDay;
  let prevGain = 0;
  for (let level = 1; level <= 3; level += 1) {
    const r = api.start(s, 'DEU', { kind: 'mine', provinceId: pid, resource: res });
    assert.equal(r.ok, true, `livello ${level}: ${JSON.stringify(r)}`);
    assert.equal(api.start(r.state, 'DEU', { kind: 'mine', provinceId: pid, resource: res }).reason, 'already_building');
    s = r.state;
    for (let d = 0; d < 60; d += 1) s = api.constructionDay(advanceDay(s, []));
    assert.equal(s.nations.DEU.construction.length, 0);
    assert.equal(s.nations.DEU.mines.find((m) => m.provinceId === pid).level, level);
    const gain = (coal(advanceDay(s, [eco])) - coal(s)) - outBefore;
    assert.ok(Math.abs(gain - extras[level - 1]) < 0.01 && gain > prevGain, `livello ${level}: +${gain} t/giorno (atteso ${extras[level - 1]})`);
    prevGain = gain;
  }
  assert.equal(api.start(s, 'DEU', { kind: 'mine', provinceId: pid, resource: res }).reason, 'max_level');
  assert.equal(api.start(s, 'DEU', { kind: 'mine', provinceId: pid, resource: 'uranium' }).reason, 'no_site');
  const [flat] = Object.entries(sites.byProvince).filter(([p, r]) => p.startsWith('P_USA_') && r.coal && r.coal.extraPerDay[0] === 0);
  assert.equal(api.start(rich(fresh(), 'USA'), 'USA', { kind: 'mine', provinceId: flat[0], resource: 'coal' }).reason, 'no_gain', 'base = max: nessun guadagno possibile');
  assert.deepEqual(validateState(s), []);
});

test('ciclo completo: l\'Italia costruisce un\'acciaieria, a metà ciclo il lavoro è occupato, dopo il completamento la produzione di acciaio sale', () => {
  let s = fresh();
  const r = api.start(s, 'ITA', steelOrder(provinceFirst('ITA'))); s = r.state;
  const base = advanceDays(fresh(), 46, SYSTEMS);
  const withMill = advanceDays(s, 46, SYSTEMS);
  assert.equal(withMill.nations.ITA.facilities.length, base.nations.ITA.facilities.length + 1);
  const a = advanceDay(base, SYSTEMS); const b = advanceDay(withMill, SYSTEMS);
  const steel = (x, y) => x.nations.ITA.stocks.steel - y.nations.ITA.stocks.steel;
  assert.ok(steel(b, withMill) > steel(a, base), 'con l\'acciaieria in più l\'acciaio sale più in fretta (se il minerale basta)');
  assert.deepEqual(advanceDays(s, 46, SYSTEMS), withMill, 'deterministico');
});
