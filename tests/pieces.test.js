// Carri e artiglieria a PEZZI (non in tonnellate): capacità = t di lavorazione della fabbrica / peso del pezzo; Cecoslovacchia con le due fabbriche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { validateRecipes, fullCapacityFlows } from '../src/data/recipes.js';
import { produceDay, checkBalance } from '../src/rules/production.js';
import { facilityCounts } from '../src/data/initialIndustry.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const recipesFile = json('industry/recipes.json');
const resources = json('resources.json');
const ctx = () => ({ factoriesById: cat.byId, resources });
const rec = (id) => recipesFile.recipes.find((r) => r.id === id);
const catalog = { recipes: new Map(recipesFile.recipes.map((r) => [r.id, r])), factories: cat.byId };

test('i prodotti tanks e artillery sono a pezzi e le ricette passano la validazione', () => {
  assert.deepEqual(validateRecipes(recipesFile, ctx()), []);
  for (const id of ['tanks', 'artillery']) assert.equal(resources.find((r) => r.id === id).unit, 'pezzi');
  assert.ok(recipesFile.recipes.filter((r) => r.output.product === 'tanks').length >= 2);
});

test('capacità in pezzi al giorno: 45 t di lavorazione / peso del modello (LT vz. 35 10,5 t → 4,286 pezzi al giorno)', () => {
  const f = cat.byId.get('FCT-TANKS');
  assert.equal(f.base_capacity_per_day, 45);
  const a = fullCapacityFlows(rec('REC-TANK-CZE-LT35'), f);
  assert.equal(a.outputUnit, 'pieces/day');
  assert.equal(a.outputPerDay, 4.286);
  const b = fullCapacityFlows(rec('REC-TANK-CZE-LT38'), f);
  assert.ok(b.outputPerDay > a.outputPerDay, 'un modello più leggero si produce in più pezzi');
  // acciaio per pezzo = 1,2 × peso: 12,6 t × 4,286 pezzi/giorno
  assert.ok(Math.abs(a.inputsPerDay.steel - 12.6 * 4.286) < 0.01);
});

test('produzione di un giorno: i carri escono a pezzi e il bilancio torna; con metà acciaio, metà produzione', () => {
  const f = [{ id: 'T1', type: 'FCT-TANKS', recipeId: 'REC-TANK-CZE-LT35' }];
  const fl = fullCapacityFlows(rec('REC-TANK-CZE-LT35'), cat.byId.get('FCT-TANKS'));
  const full = produceDay({ facilities: f, stock: { ...fl.inputsPerDay }, hydroMw: 100 }, catalog);
  assert.equal(full.facilities[0].efficiency, 1);
  assert.ok(Math.abs(full.stock.tanks - 4.286) < 0.01);
  assert.deepEqual(checkBalance(full.balance), []);
  const half = produceDay({ facilities: f, stock: { ...fl.inputsPerDay, steel: fl.inputsPerDay.steel / 2 }, hydroMw: 100 }, catalog);
  assert.equal(half.facilities[0].bottleneck, 'steel');
  assert.ok(Math.abs(half.stock.tanks - 4.286 / 2) < 0.02);
});

test('validazione: pezzi senza peso, peso su un prodotto in tonnellate, unità sbagliata', () => {
  const bad = (mut, re) => { const d = structuredClone(recipesFile); mut(d); assert.ok(validateRecipes(d, ctx()).some((e) => re.test(e)), String(re)); };
  bad((d) => { delete d.recipes.find((r) => r.id === 'REC-TANK-CZE-LT35').massTonnes; }, /peso del pezzo/);
  bad((d) => { d.recipes.find((r) => r.id === 'REC-STEEL-001').massTonnes = 5; }, /massTonnes ma non produce pezzi/);
  bad((d) => { delete d.recipes.find((r) => r.id === 'REC-TANK-CZE-LT38').outputUnit; }, /pieces\/day/);
  bad((d) => { d.recipes.find((r) => r.id === 'REC-STEEL-001').outputUnit = 'pieces/day'; }, /non è a pezzi/);
});

test('la Cecoslovacchia parte con una fabbrica di carri e una di artiglieria; le ricette dei suoi due carri esistono', () => {
  const ind = json('industry/initial_industry.json');
  const c = facilityCounts(ind, 'CZE');
  assert.equal(c['FCT-TANKS'], 1);
  assert.equal(c['FCT-ARTILLERY'], 1);
  assert.equal(ind.nations.CZE.facilities.find((x) => x.factory === 'FCT-TANKS').recipeId, 'REC-TANK-CZE-LT35');
  assert.equal(facilityCounts(ind, 'DEU')['FCT-TANKS'], undefined, 'le altre nazioni non hanno ancora fabbriche di carri');
  const models = json('units/models/carri_cecoslovacchi_1935_1938.json').models;
  assert.ok(models.every((m) => rec(`REC-TANK-CZE-${m.id.split('-').pop()}`)), 'una ricetta per ogni modello cecoslovacco');
});
