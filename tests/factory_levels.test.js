// Livelli delle fabbriche (29/10/2026): fabbrica → complesso industriale → grande complesso industriale. Valori DESIGN_DEFAULT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createConstruction } from '../src/game/construction.js';
import { validateFactoryLevels, levelMult, upgradeCost, maxFactoryLevel, workersAt } from '../src/data/factoryLevels.js';
import { fullCapacityFlows } from '../src/data/recipes.js';
import { workersState } from '../src/rules/workers.js';
import { upgradeOptions, economySummary } from '../src/ui/buildOptions.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const levels = json('industry/factory_levels.json');
const recipesFile = json('industry/recipes.json');
const catalog = { levels, recipes: new Map(recipesFile.recipes.map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json'); const economy = json('economy/economy.json'); const sites = json('resources/mine_sites.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const share = population.workersShare.value;
const build = createConstruction({ catalog, economy, sites, hydro: json('resources/hydro_plants.json'), political, workersShare: share });
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const rich = (s) => ({ ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, balance: 1e7, population: 1e9, baseGridMw: 1e6, stocks: { ...s.nations.ITA.stocks, steel: 1e7 } } } });
const steel = cat.byId.get('FCT-STEEL');
const steelFac = (s) => s.nations.ITA.facilities.find((f) => f.type === 'FCT-STEEL');

test('dati: file valido, tre livelli, valori crescenti e dichiarati DESIGN_DEFAULT', () => {
  assert.deepEqual(validateFactoryLevels(levels), []);
  assert.equal(maxFactoryLevel(levels), 3);
  assert.equal(levels.quality, 'DESIGN_DEFAULT');
  assert.deepEqual(levels.levels.map((l) => l.name_it), ['Fabbrica', 'Complesso industriale', 'Grande complesso industriale']);
  assert.notDeepEqual(validateFactoryLevels({ ...levels, levels: [levels.levels[1], levels.levels[0]] }), []);
});

test('moltiplicatori: livello assente = 1, livello 3 = capacità ×4, livello non valido è un errore', () => {
  assert.deepEqual(levelMult(levels), { capacity: 1, energy: 1, workers: 1 });
  assert.equal(levelMult(levels, 3).capacity, 4);
  assert.throws(() => levelMult(levels, 9), RangeError);
  const recipe = catalog.recipes.get('REC-STEEL-001');
  const base = fullCapacityFlows(recipe, steel);
  const l2 = fullCapacityFlows(recipe, steel, levelMult(levels, 2));
  assert.equal(l2.energyMw, base.energyMw * 2);
  for (const k of Object.keys(base.outputs ?? {})) assert.equal(l2.outputs[k], base.outputs[k] * 2);
  assert.equal(workersAt(steel, levels, 2), Math.round(steel.workers * 1.8));
});

test('costo del miglioramento: 1,5× i costi di costruzione per L2, 3× per L3, tempo 1,5× e 2×', () => {
  const c1 = upgradeCost(economy, steel, 1, levels, 'media');
  assert.equal(c1.ecv, 180); assert.equal(c1.steel, 450); assert.equal(c1.days, 68);
  const c2 = upgradeCost(economy, steel, 2, levels, 'media');
  assert.equal(c2.ecv, 360); assert.equal(c2.days, 90);
  assert.ok(c2.workers > 0);
});

test('ordine di miglioramento: paga subito, la fabbrica resta a L1 durante i lavori, a fine lavori diventa L2 senza slot in più', () => {
  const s0 = rich(fresh()); const f0 = steelFac(s0); const nFac = s0.nations.ITA.facilities.length;
  const r = build.start(s0, 'ITA', { kind: 'upgrade', facilityId: f0.id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.state.nations.ITA.balance, Math.round((1e7 - 180) * 1000) / 1000);
  assert.equal(r.state.nations.ITA.stocks.steel, 1e7 - 450);
  assert.equal(r.state.nations.ITA.construction[0].kind, 'upgrade');
  assert.equal(steelFac(r.state).level ?? 1, 1);
  assert.deepEqual(validateState(r.state), []);
  assert.equal(build.start(r.state, 'ITA', { kind: 'upgrade', facilityId: f0.id }).reason, 'already_building');
  let s = r.state;
  for (let i = 0; i < 67; i += 1) s = build.constructionDay(advanceDay(s, []));
  assert.equal(s.nations.ITA.construction.length, 1);
  s = build.constructionDay(advanceDay(s, []));
  assert.equal(s.nations.ITA.construction.length, 0);
  assert.equal(s.nations.ITA.facilities.find((f) => f.id === f0.id).level, 2);
  assert.equal(s.nations.ITA.facilities.length, nFac, 'nessuna fabbrica duplicata');
  assert.deepEqual(validateState(s), []);
});

test('rifiuti: impianto inesistente, livello massimo, fondi insufficienti, nazione che non controlla il territorio', () => {
  const s0 = rich(fresh());
  assert.equal(build.start(s0, 'ITA', { kind: 'upgrade', facilityId: 'NOPE' }).reason, 'no_facility');
  const f0 = steelFac(s0);
  const maxed = { ...s0, nations: { ...s0.nations, ITA: { ...s0.nations.ITA, facilities: s0.nations.ITA.facilities.map((f) => (f.id === f0.id ? { ...f, level: 3 } : f)) } } };
  assert.equal(build.start(maxed, 'ITA', { kind: 'upgrade', facilityId: f0.id }).reason, 'max_level');
  const poor = { ...s0, nations: { ...s0.nations, ITA: { ...s0.nations.ITA, balance: 1 } } };
  assert.equal(build.start(poor, 'ITA', { kind: 'upgrade', facilityId: f0.id }).ok, false);
});

test('lavoratori: l\'impianto migliorato ne occupa di più, i lavori in corso ne riservano la differenza', () => {
  const s0 = rich(fresh()); const f0 = steelFac(s0);
  const before = workersState(s0.nations.ITA, { factoriesById: cat.byId, share, levels });
  const r = build.start(s0, 'ITA', { kind: 'upgrade', facilityId: f0.id });
  const during = workersState(r.state.nations.ITA, { factoriesById: cat.byId, share, levels });
  assert.ok(during.building > before.building);
  const done = { ...r.state.nations.ITA, construction: [], facilities: r.state.nations.ITA.facilities.map((f) => (f.id === f0.id ? { ...f, level: 2 } : f)) };
  assert.ok(workersState(done, { factoriesById: cat.byId, share, levels }).employed > before.employed);
});

test('salvataggio: livello fuori 1..3 viene rifiutato, livello assente è valido', () => {
  const s = fresh();
  assert.deepEqual(validateState(s), []);
  const bad = { ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, facilities: s.nations.ITA.facilities.map((f, i) => (i === 0 ? { ...f, level: 7 } : f)) } } };
  assert.notDeepEqual(validateState(bad), []);
});

test('interfaccia: righe raggruppate, prova a secco senza toccare lo stato, riepilogo con nome del livello', () => {
  const s0 = rich(fresh()); const before = JSON.stringify(s0);
  const ctx = { build, catalog, economy };
  const ups = upgradeOptions(s0, 'ITA', ctx);
  assert.equal(JSON.stringify(s0), before);
  const row = ups.find((u) => /^Acciaieria/.test(u.label));
  assert.ok(row && row.ok && /Fabbrica → Complesso industriale/.test(row.label) && row.count >= 1);
  const started = build.start(s0, 'ITA', row.order).state;
  const e = economySummary(started, 'ITA', { build, catalog, workersShare: share });
  assert.match(e.queue[0].label, /Acciaieria → Complesso industriale/);
  assert.deepEqual(upgradeOptions(s0, 'ITA', { ...ctx, provinceId: 'P_NONE' }), []);
});
