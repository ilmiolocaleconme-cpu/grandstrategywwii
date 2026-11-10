// Vista di produzione degli equipaggiamenti: ricette per nazione, prova a secco, lotti, scorte separate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facilityRecipeRows, defaultEquipmentRecipe, equipmentRecipesFor, batchView, batchLine, splitStocks } from '../src/ui/recipeView.js';

const table = { groups: { light_arms: { name_it: 'Armi leggere', requires: null }, basic_artillery: { name_it: 'Artiglieria', requires: 'TECH-ART' } } };
const R = (id, eq, group, extra = {}) => [id, { id, factory: 'FCT-WEAPONS', equipmentId: eq, group, releaseEveryDays: 5, buildDays: 20, ...extra }];
const recipes = new Map([R('REC-A', 'INW-DEU-RIFLE', 'light_arms'), R('REC-B', 'INW-DEU-PISTOL', 'light_arms'), R('REC-C', 'INW-DEU-MG', 'basic_artillery'), R('REC-D', 'INW-ITA-RIFLE', 'light_arms'),
  ['REC-STEEL', { id: 'REC-STEEL', factory: 'FCT-STEEL' }]]);
const catalog = { recipes, factories: new Map([['FCT-WEAPONS', { name_it: 'Fabbrica armi leggere' }], ['FCT-STEEL', { name_it: 'Acciaieria' }]]) };
const mk = (f) => ({ nations: { DEU: { facilities: [{ id: 'F1', type: 'FCT-WEAPONS', recipeId: 'REC-A', ...f }, { id: 'S1', type: 'FCT-STEEL', recipeId: 'REC-STEEL' }] } } });
const ctx = { catalog, table, nameOf: (x) => `N:${x}`, techName: (x) => `T:${x}` };

test('solo le ricette della propria nazione; le altre nazioni non compaiono', () => {
  assert.deepEqual(equipmentRecipesFor(recipes, 'DEU', 'FCT-WEAPONS').map((r) => r.id), ['REC-A', 'REC-B', 'REC-C']);
  assert.deepEqual(equipmentRecipesFor(recipes, 'ITA', 'FCT-WEAPONS').map((r) => r.id), ['REC-D']);
});

test('righe: solo impianti con ricette di equipaggiamento; gruppo bloccato indicato con la tecnologia', () => {
  const rows = facilityRecipeRows(mk({}), 'DEU', ctx);
  assert.equal(rows.length, 1, "l'acciaieria non compare");
  assert.equal(rows[0].current.label, 'N:INW-DEU-RIFLE');
  assert.deepEqual(rows[0].options.map((o) => [o.recipeId, o.ok, o.current]), [['REC-A', true, true], ['REC-B', true, false]]);
  assert.deepEqual(rows[0].locked.map((l) => [l.recipeId, l.requires]), [['REC-C', 'T:TECH-ART']]);
  assert.equal(facilityRecipeRows(mk({}), 'DEU', { ...ctx, researched: new Set(['TECH-ART']) })[0].locked.length, 0);
});

test('con lotti in consegna il cambio è rifiutato con il motivo della regola; i pezzi in lavorazione si contano', () => {
  const rows = facilityRecipeRows(mk({ batches: [{ qty: 10, readyOn: '1936-02-01' }], wip: 7.9 }), 'DEU', ctx);
  const b = rows[0].options.find((o) => o.recipeId === 'REC-B');
  assert.equal(b.ok, false);
  assert.match(b.message, /lotti in consegna/);
  assert.equal(rows[0].lostOnChange, 7);
});

test('lotti: giorni al prossimo lotto, in consegna e data; senza campi (salvataggio vecchio) non esplode; ricetta senza lotti: nulla', () => {
  const v = batchView({ wip: 3.4, runDays: 2, batches: [{ qty: 6, readyOn: '1936-03-02' }, { qty: 4, readyOn: '1936-02-01' }] }, recipes.get('REC-A'));
  assert.deepEqual([v.wip, v.daysToBatch, v.inDelivery, v.nextDelivery, v.lastDelivery], [3, 3, 10, '1936-02-01', '1936-03-02']);
  assert.match(batchLine(v), /prossimo lotto tra 3 g · in consegna 10 pz \(dal 1936-02-01\)/);
  const old = batchView({}, recipes.get('REC-A'));
  assert.deepEqual([old.wip, old.daysToBatch, old.inDelivery], [0, 5, 0]);
  assert.equal(batchView({}, { id: 'X' }), null);
  assert.equal(batchLine(null), '');
});

test('ricetta di default per una nuova fabbrica: la prima sbloccata della nazione; nessuna → null', () => {
  assert.equal(defaultEquipmentRecipe(recipes, 'DEU', 'FCT-WEAPONS', table).id, 'REC-A');
  assert.equal(defaultEquipmentRecipe(recipes, 'FRA', 'FCT-WEAPONS', table), null);
  assert.equal(defaultEquipmentRecipe(recipes, 'DEU', 'FCT-WEAPONS', { groups: { light_arms: { requires: 'X' }, basic_artillery: { requires: 'Y' } } }), null);
});

test('scorte: risorse in tonnellate separate dagli equipaggiamenti in pezzi; voce fuori catalogo segnalata', () => {
  const s = splitStocks({ steel: 100.4, 'equipment.INW-DEU-RIFLE': 12.9, 'equipment.ZZZ': 3, coal: 0, 'equipment.INW-DEU-PISTOL': 0.5 }, { resourceLabel: (x) => `R:${x}`, nameOf: (id) => (id.startsWith('INW') ? `N:${id}` : null) });
  assert.deepEqual(s.resources, [{ id: 'steel', label: 'R:steel', tons: 100 }]);
  assert.deepEqual(s.equipment.map((e) => [e.label, e.pieces, e.unknown]), [['N:INW-DEU-RIFLE', 12, false], ['ZZZ', 3, true]], 'frazioni di pezzo non si mostrano');
});

// --- dati reali: il pannello costruzioni offre solo gli equipaggiamenti della propria nazione, una riga per tipo di fabbrica ---
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame } from '../src/game/state.js';
import { createConstruction } from '../src/game/construction.js';
import { provinceBuildOptions, economySummary } from '../src/ui/buildOptions.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';

const txt = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const js = (p) => JSON.parse(txt(p));
const eqTable = js('units/equipment/equipment_production.json');
const eqCatalog = mergeEquipmentCatalogs(['catalog', 'catalog_deu', 'catalog_fra', 'catalog_ita'].map((n) => js(`units/equipment/${n}.json`)));
const eqRecipes = buildEquipmentRecipes(eqCatalog, eqTable);
const ind = loadIndustryCatalog({ factoriesCsv: txt('industry/factories.csv'), structuresCsv: txt('infrastructure/structures.csv'), categoriesCsv: txt('industry/production_categories.csv') });
const realCatalog = { recipes: new Map([...js('industry/recipes.json').recipes, ...eqRecipes].map((r) => [r.id, r])), factories: ind.byId };
const political = js('political_1936.json'); const nationIds = js('nations.json').map((n) => n.id);
const sites = js('resources/mine_sites.json'); const economy = js('economy/economy.json'); const population = js('population/population.json');
const buildEngine = createConstruction({ catalog: realCatalog, economy, sites, hydro: js('resources/hydro_plants.json'), political, workersShare: population.workersShare.value });
const start = { nationIds, industry: js('industry/initial_industry.json'), stocks: js('industry/initial_stocks.json'), cash: js('industry/initial_cash.json'), economy, population };
const real = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const itaProv = Object.keys(sites.byProvince).find((p) => p.startsWith('P_ITA_'));

test('dati reali: nel pannello costruzioni nessuna ricetta di equipaggiamento di altre nazioni, una sola riga per tipo di fabbrica', () => {
  const o = provinceBuildOptions(real, 'ITA', itaProv, { build: buildEngine, catalog: realCatalog, sites, economy, equipmentTable: eqTable });
  const eq = o.factories.filter((f) => realCatalog.recipes.get(f.order.recipeId).equipmentId);
  for (const f of eq) assert.equal(realCatalog.recipes.get(f.order.recipeId).equipmentId.split('-')[1], 'ITA', f.order.recipeId);
  assert.equal(new Set(eq.map((f) => f.order.factoryId)).size, eq.length, 'una riga per fabbrica');
  assert.ok(eq.some((f) => f.order.factoryId === 'FCT-WEAPONS'), "l'Italia può costruire una fabbrica di armi leggere");
  assert.ok(!o.factories.some((f) => /DEU|FRA/.test(f.order.recipeId)), 'nessuna ricetta tedesca o francese');
});

test('dati reali: il riepilogo separa i pezzi in magazzino dalle tonnellate e dà il nome del catalogo', () => {
  const st = { ...real, nations: { ...real.nations, ITA: { ...real.nations.ITA, stocks: { ...real.nations.ITA.stocks, 'equipment.INW-ITA-RIFLE-1940': 40 } } } };
  const names = new Map(eqCatalog.entries.map((e) => [e.equipment_id, e.name_it]));
  const s = economySummary(st, 'ITA', { build: buildEngine, catalog: realCatalog, workersShare: population.workersShare.value, equipmentName: (id) => names.get(id) ?? null });
  assert.ok(!s.stocks.some((x) => x.id.startsWith('equipment.')), 'nessun pezzo tra le tonnellate');
  assert.deepEqual(s.equipmentStocks.map((e) => [e.pieces, e.unknown]), [[40, false]]);
});
