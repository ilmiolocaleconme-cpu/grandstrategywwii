// Carri e artiglieria a PEZZI (non in tonnellate): capacità = t di lavorazione della fabbrica / peso del pezzo; Cecoslovacchia con le due fabbriche.
import { allRecipeList, EQUIPMENT_RECIPE_LIST } from './_equipment_recipes.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalogFrom } from '../src/data/industry.js';
import { validateRecipes, fullCapacityFlows } from '../src/data/recipes.js';
import { produceDay, checkBalance } from '../src/rules/production.js';
import { facilityCounts } from '../src/data/initialIndustry.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalogFrom(text); // Pack + fabbriche del repository (factories_extra.csv)
const recipesFile = json('industry/recipes.json');
const resources = json('resources.json');
const ctx = () => ({ factoriesById: cat.byId, resources });
const rec = (id) => recipesFile.recipes.find((r) => r.id === id);
const catalog = { recipes: new Map([...recipesFile.recipes, ...EQUIPMENT_RECIPE_LIST].map((r) => [r.id, r])), factories: cat.byId };

test('i prodotti tanks e artillery sono a pezzi e le ricette passano la validazione', () => {
  assert.deepEqual(validateRecipes(recipesFile, ctx()), []);
  for (const id of ['tanks', 'artillery']) assert.equal(resources.find((r) => r.id === id).unit, 'pezzi');
  assert.ok(recipesFile.recipes.filter((r) => r.output.product === 'tanks').length >= 2);
});

test('capacità in pezzi al giorno: 45 t × 25% di lavorazione / peso del modello (LT vz. 35 10,5 t → 4,286 pezzi al giorno)', () => {
  const f = cat.byId.get('FCT-TANKS');
  assert.equal(f.base_capacity_per_day, 45);
  const a = fullCapacityFlows(rec('REC-TANK-CZE-LT35'), f);
  assert.equal(a.outputUnit, 'pieces/day');
  assert.equal(a.outputPerDay, 1.071);
  const b = fullCapacityFlows(rec('REC-TANK-CZE-LT38'), f);
  assert.ok(b.outputPerDay > a.outputPerDay, 'un modello più leggero si produce in più pezzi');
  // acciaio per pezzo = 1,2 × peso: 12,6 t × 4,286 pezzi/giorno
  assert.ok(Math.abs(a.inputsPerDay.steel - 12.6 * 1.071) < 0.01);
});

test('produzione di un giorno: i carri escono a pezzi e il bilancio torna; con metà acciaio, metà produzione', () => {
  const f = [{ id: 'T1', type: 'FCT-TANKS', recipeId: 'REC-TANK-CZE-LT35' }];
  const fl = fullCapacityFlows(rec('REC-TANK-CZE-LT35'), cat.byId.get('FCT-TANKS'));
  const full = produceDay({ facilities: f, stock: { ...fl.inputsPerDay }, hydroMw: 100 }, catalog);
  assert.equal(full.facilities[0].efficiency, 1);
  assert.ok(Math.abs(full.stock.tanks - 1.071) < 0.01);
  assert.deepEqual(checkBalance(full.balance), []);
  const half = produceDay({ facilities: f, stock: { ...fl.inputsPerDay, steel: fl.inputsPerDay.steel / 2 }, hydroMw: 100 }, catalog);
  assert.equal(half.facilities[0].bottleneck, 'steel');
  assert.ok(Math.abs(half.stock.tanks - 1.071 / 2) < 0.02);
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
  // dal 12/11/2026 (decisione dell'utente): una fabbrica di carri anche per DEU, FRA, GBR, ITA, JPN, USA, col carro del proprio catalogo; la URSS col T-26 (stesso giorno)
  for (const [n, r] of [['DEU', 'REC-TNK-DEU-PZ-I'], ['FRA', 'REC-TNK-FRA-H39-1940'], ['GBR', 'REC-TNK-GBR-LIGHT-TANK-1939'], ['ITA', 'REC-TNK-ITA-L3-ARM-1940'], ['JPN', 'REC-TNK-JPN-TYPE95-1942'], ['USA', 'REC-TNK-USA-LIGHT-TANK-1940'], ['USSR', 'REC-TNK-USSR-T26-1940']]) {
    assert.equal(facilityCounts(ind, n)['FCT-TANKS'], 1, n);
    assert.equal(ind.nations[n].facilities.find((x) => x.factory === 'FCT-TANKS').recipeId, r, n);
  }
  const models = json('units/models/carri_cecoslovacchi_1935_1938.json').models;
  assert.ok(models.every((m) => rec(`REC-TANK-CZE-${m.id.split('-').pop()}`)), 'una ricetta per ogni modello cecoslovacco');
});

// ---- paesi minori (fascia C): minimo di produzione di artiglieria, con scorta iniziale (29/10/2026) ----
import { buildNations } from '../src/game/economyState.js';
import { validateInitialIndustry } from '../src/data/initialIndustry.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, withEquipmentRecipes } from '../src/data/equipmentProduction.js';

test('fascia C: una fabbrica di artiglieria limitata al 5% con 760 t di acciaio e 65 t di componenti in più della riserva; le altre fasce non cambiano', () => {
  const industry = json('industry/initial_industry.json');
  const nationIds = json('nations.json').map((n) => n.id);
  const political = json('political_1936.json');
  const n = buildNations({ political, nationIds, industry, stocks: json('industry/initial_stocks.json') });
  const c = industry.tierC[0];
  assert.equal(n[c].facilities.length, 1);
  assert.equal(n[c].facilities[0].type, 'FCT-ARTILLERY');
  assert.equal(n[c].facilities[0].throttle, 0.05);
  assert.equal(n[c].stocks.components, 65);
  assert.equal(n[c].stocks.steel, 1260, 'riserva minima di costruzione 500 t + scorta dell\'artiglieria 760 t, in aggiunta');
  assert.equal(n.DEU.facilities.filter((f) => f.type === 'FCT-ARTILLERY' && f.recipeId === 'REC-ARTILLERY-001').length, 0, 'le grandi potenze non usano la ricetta generica delle minori');
  assert.ok(industry.tierC.every((id) => n[id].facilities.length === 1), 'tutte e 51');
  // un giorno di produzione: 5% di 1,4 pezzi (quota 6% di 70 t / 3 t) = 0,07 pezzi, 0,252 t di acciaio, 0,021 t di componenti
  const r = produceDay({ facilities: n[c].facilities, stock: n[c].stocks, hydroMw: n[c].baseGridMw }, catalog);
  assert.ok(Math.abs(r.stock.artillery - 0.07) < 0.001);
  assert.ok(Math.abs(n[c].stocks.steel - r.stock.steel - 0.252) < 0.005);
  assert.deepEqual(checkBalance(r.balance), []);
});

test('limitazione della produzione: valore fuori da 0-1 rifiutato; 0 = fermo; la domanda di energia scala', () => {
  const f = { id: 'A1', type: 'FCT-ARTILLERY', recipeId: 'REC-ARTILLERY-001' };
  const stock = { steel: 500, components: 40 };
  assert.throws(() => produceDay({ facilities: [{ ...f, throttle: 1.5 }], stock }, catalog), /limitazione/);
  const off = produceDay({ facilities: [{ ...f, throttle: 0 }], stock }, catalog);
  assert.equal(off.facilities[0].state, 'fermo');
  assert.equal(off.stock.artillery ?? 0, 0);
  const t = produceDay({ facilities: [{ ...f, throttle: 0.05 }], stock, hydroMw: 40 }, catalog);
  assert.ok(Math.abs(t.powerMw.demand - 0.75) < 0.01, 'domanda energetica = 15 MW × 5%');
  assert.equal(t.facilities[0].state, 'operativo');
});

test('validazione di minorArtillery: ricetta di un\'altra fabbrica, limitazione non valida', () => {
  const industry = json('industry/initial_industry.json');
  const vctx = { factoriesById: cat.byId, recipes: withEquipmentRecipes(recipesFile, buildEquipmentRecipes(mergeEquipmentCatalogs(['catalog', 'catalog_deu', 'catalog_fra', 'catalog_gbr', 'catalog_ita', 'catalog_ussr', 'catalog_jpn', 'catalog_usa'].map((n) => json(`units/equipment/${n}.json`))), json('units/equipment/equipment_production.json'))), entityIds: new Set(json('political_1936.json').map((e) => e.id)), nationIds: json('nations.json').map((x) => x.id) };
  assert.deepEqual(validateInitialIndustry(industry, vctx), []);
  const bad = (mut, re) => { const d = structuredClone(industry); mut(d.minorArtillery); assert.ok(validateInitialIndustry(d, vctx).some((e) => re.test(e)), String(re)); };
  bad((m) => { m.recipeId = 'REC-STEEL-001'; }, /non è di FCT-ARTILLERY/);
  bad((m) => { m.throttle = 0; }, /limitazione/);
  bad((m) => { m.startStock = { components: -1 }; }, /scorta non valida/);
});
