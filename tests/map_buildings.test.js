// Edifici e lavori in corso sulla mappa (21/11/2026): solo ciò che ha una provincia nei dati o nello stato; lavori con la quota fatta,
// solo per il giocatore; segnaposto sulle sponde per le province madri divise da un fiume.
import { allRecipeList, EQUIPMENT_RECIPE_LIST } from './_equipment_recipes.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame } from '../src/game/state.js';
import { createConstruction } from '../src/game/construction.js';
import { barracksOf } from '../src/game/barracksState.js';
import { buildingsByProvince, resolveBuildingAnchors, jobKind, FACTORY_KIND, BUILDING_KINDS } from '../src/rules/mapBuildings.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') });
const recipesFile = json('industry/recipes.json');
const catalog = { recipes: new Map([...recipesFile.recipes, ...EQUIPMENT_RECIPE_LIST].map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json');
const economy = json('economy/economy.json');
const hydro = json('resources/hydro_plants.json');
const barracksDoc = json('military/barracks.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const allProvinceIds = new Set(readdirSync(new URL('../data/provinces/', import.meta.url)).filter((f) => !f.startsWith('_') && f.endsWith('.json')).flatMap((f) => json(`provinces/${f}`).features.flatMap((x) => [x.properties.id, x.properties.parentProvince ?? x.properties.id])));
const api = createConstruction({ catalog, economy, sites: json('resources/mine_sites.json'), hydro, political, workersShare: population.workersShare.value, provinceExists: (id) => allProvinceIds.has(id) });
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start, difficulty: 'media' }).state;
const rich = (s, id) => ({ ...s, nations: { ...s.nations, [id]: { ...s.nations[id], balance: 1e7, population: 1e9, baseGridMw: 1e6, stocks: { ...s.nations[id].stocks, steel: 1e7 } } } });
const ctx = (s) => ({ player: s.player, hydro, barracksDoc, barracksOf });
const provinceFirst = (code) => json(`provinces/${code}.json`).features[0].properties.id;

test('ogni tipo di fabbrica del catalogo ha una categoria sulla mappa, e ogni categoria esiste', () => {
  const kinds = new Set(BUILDING_KINDS.map((k) => k.id));
  for (const id of cat.byId.keys()) if (id.startsWith('FCT-')) assert.ok(id in FACTORY_KIND, `${id} senza categoria`);
  for (const k of Object.values(FACTORY_KIND)) if (k !== null) assert.ok(kinds.has(k), k);
});

test('all\'avvio: centrali idroelettriche e caserme (Germania, URSS); gli impianti iniziali senza provincia NON compaiono', () => {
  const s = fresh();
  const b = buildingsByProvince(s, ctx(s));
  const all = Object.values(b).flat();
  const count = (k) => all.filter((e) => e.kind === k).reduce((t, e) => t + e.n, 0);
  const hydroNow = hydro.plants.filter((p) => p.provinceId && p.validFrom <= s.date).length;
  assert.equal(count('hydro'), hydroNow);
  assert.equal(count('barracks'), barracksDoc.initial.DEU.length + barracksDoc.initial.USSR.length, 'tutte al livello 1');
  assert.equal(count('steel'), 0, 'gli impianti iniziali non hanno provincia (MISSING_DATA)');
  assert.equal(all.some((e) => e.job), false);
  assert.ok(b.P_USSR_ZAPORIZHZHYA?.some((e) => e.kind === 'hydro'), 'DneproGES');
});

test('costruzione in corso: in cima alla provincia, quota fatta che sale ogni giorno; solo per il giocatore', () => {
  let s = rich(rich(fresh(), 'ITA'), 'DEU');
  const pi = provinceFirst('ITA');
  const r = api.start(s, 'ITA', { kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId: pi });
  assert.equal(r.ok, true, JSON.stringify(r));
  s = r.state;
  const pd = provinceFirst('DEU');
  const r2 = api.start(s, 'DEU', { kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId: pd });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  s = r2.state;
  let b = buildingsByProvince(s, ctx(s));
  assert.deepEqual(b[pi][0], { kind: 'steel', n: 1, job: { frac: 0, daysLeft: 45, totalDays: 45 } });
  assert.equal(b[pd]?.some((e) => e.job) ?? false, false, 'il cantiere tedesco non si vede (intelligence)');
  for (let i = 0; i < 15; i += 1) s = api.constructionDay(s);
  b = buildingsByProvince(s, ctx(s));
  assert.equal(b[pi][0].job.frac, 0.333);
  assert.equal(b[pi][0].job.daysLeft, 30);
  for (let i = 0; i < 30; i += 1) s = api.constructionDay(s);
  b = buildingsByProvince(s, ctx(s));
  assert.deepEqual(b[pi], [{ kind: 'steel', n: 1 }], 'finita: diventa un edificio');
  assert.deepEqual(b[pd], [{ kind: 'steel', n: 1 }], 'gli edifici finiti si vedono per tutti');
});

test('categorie dei lavori: collegamenti e cantieri navali esclusi; miniere, ospedali, caserme, porti inclusi', () => {
  assert.equal(jobKind({ kind: 'infra' }), null);
  assert.equal(jobKind({ kind: 'factory', factoryId: 'FCT-SHIPYARD' }), null);
  assert.equal(jobKind({ kind: 'factory', factoryId: 'FCT-POWER' }), 'power');
  assert.equal(jobKind({ kind: 'upgrade', factoryId: 'FCT-TANKS' }), 'vehicles');
  assert.equal(jobKind({ kind: 'mine' }), 'mine');
  assert.equal(jobKind({ kind: 'hospital' }), 'hospital');
  assert.equal(jobKind({ kind: 'barracks' }), 'barracks');
  assert.equal(jobKind({ kind: 'port' }), 'port');
});

test('segnaposto: la provincia madre divisa va sulla sponda più grande; i lavori restano in cima', () => {
  const items = [{ props: { id: 'A' }, areaKm2: 10 }, { props: { id: 'M_1', parentProvince: 'M' }, areaKm2: 5 }, { props: { id: 'M_2', parentProvince: 'M' }, areaKm2: 9 }];
  const out = resolveBuildingAnchors(items, { A: [{ kind: 'steel', n: 1 }], M: [{ kind: 'barracks', n: 2 }], M_2: [{ kind: 'power', n: 1, job: { frac: 0.5 } }], X: [{ kind: 'mine', n: 1 }] });
  assert.deepEqual(Object.keys(out).sort(), ['A', 'M_2']);
  assert.deepEqual(out.M_2.map((e) => e.kind), ['power', 'barracks']);
});
