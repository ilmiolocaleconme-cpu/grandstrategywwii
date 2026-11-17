// Carri cechi in versione tedesca (17/11/2026): Pz.Kpfw. 35(t) e 38(t). Si producono solo controllando la Boemia (dove stavano Škoda e ČKD) e fra la
// data d'inizio e quella di fine produzione; in battaglia hanno il loro peso e stanno nel parco tedesco dal 1939. Dati reali e sistema economico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, recipeUnlocked, recipeLockReason, ownerFromPlaceId, validateEquipmentProduction } from '../src/data/equipmentProduction.js';
import { setFacilityRecipe } from '../src/game/facilityRecipe.js';
import { facilityRecipeRows, defaultEquipmentRecipe } from '../src/ui/recipeView.js';
import { createEconomySystem } from '../src/game/economySystem.js';
import { newGame } from '../src/game/state.js';
import { advanceDays } from '../src/game/engine.js';
import { weaponWeight, tankParts, validateBattleV2 } from '../src/rules/battleV2.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const edir = new URL('../data/units/equipment/', import.meta.url);
const eqCatalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const table = json('units/equipment/equipment_production.json');
const generated = buildEquipmentRecipes(eqCatalog, table);
const rec = (id) => generated.find((r) => r.id === id);
const P35 = rec('REC-TNK-DEU-PZ-35T'); const P38 = rec('REC-TNK-DEU-PZ-38T');
const cfg = json('units/battle_v2.json');
const all = new Set(); // tecnologie: tutte, per isolare data e controllo
for (const g of Object.values(table.groups)) if (g.requires) all.add(g.requires);

test('ricette generate: fabbrica di carri, date di inizio e fine, Boemia richiesta', () => {
  assert.deepEqual([P35.factory, P35.availableFrom, P35.availableTo, P35.requiresControl], ['FCT-TANKS', '1936-12-01', '1940-06-30', 'P_CZE_BOHEMIA']);
  assert.deepEqual([P38.factory, P38.availableFrom, P38.availableTo, P38.requiresControl], ['FCT-TANKS', '1938-10-01', '1942-06-30', 'P_CZE_BOHEMIA']);
  assert.equal(P38.output.product, 'equipment.TNK-DEU-PZ-38T');
  assert.equal(eqCatalog.entries.find((e) => e.equipment_id === 'TNK-DEU-PZ-38T').sameAs, 'TNK-DEU-TANK', 'riforniscono la voce «carri» delle Panzer-Division');
  assert.equal(rec('REC-TNK-DEU-PZ-IV').requiresControl, undefined, 'gli altri carri non cambiano');
});

test('blocchi: controllo della Boemia, inizio e fine produzione', () => {
  const ger = () => 'DEU'; const cze = () => 'CZE';
  assert.equal(recipeLockReason(P38, '1939-04-01', ger), null);
  assert.deepEqual(recipeLockReason(P38, '1939-04-01', cze), { kind: 'control', text: 'serve il controllo di P_CZE_BOHEMIA' });
  assert.equal(recipeLockReason(P38, '1938-01-01', ger).kind, 'from');
  assert.equal(recipeLockReason(P35, '1940-07-01', ger).kind, 'to');
  assert.equal(recipeLockReason(P35, '1940-06-30', ger), null, 'l’ultimo giorno si produce ancora');
  assert.deepEqual(recipeLockReason(P38, '1939-04-01'), recipeLockReason(P38, '1939-04-01', cze), 'senza funzione di controllo vale il proprietario del 1936');
  assert.equal(ownerFromPlaceId('P_CZE_BOHEMIA'), 'CZE');
  assert.equal(recipeUnlocked(table, P38, all, '1939-04-01', ger), true);
  assert.equal(recipeUnlocked(table, P38, all, '1939-04-01', cze), false);
  assert.equal(recipeLockReason(rec('REC-TNK-DEU-PZ-IV'), '1939-04-01', cze), null);
});

test('validazione: fine prima dell’inizio, provincia malformata o inesistente', () => {
  const bad = (ov, extra = {}) => validateEquipmentProduction({ ...table, overrides: { ...table.overrides, 'TNK-DEU-PZ-38T': { ...table.overrides['TNK-DEU-PZ-38T'], ...ov } } }, extra);
  assert.deepEqual(validateEquipmentProduction(table, { catalog: eqCatalog }), []);
  assert.ok(bad({ availableTo: '1937-01-01' }).some((e) => /fine prima/.test(e)));
  assert.ok(bad({ requiresControl: 'Boemia' }).some((e) => /requiresControl/.test(e)));
  assert.ok(bad({}, { provinceIds: new Set(['P_DEU_X']) }).some((e) => /inesistente/.test(e)));
});

// ---- partita vera: la Germania con la sua fabbrica di carri ----
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') });
const recipes = [...json('industry/recipes.json').recipes, ...generated];
const catalog = { recipes: new Map(recipes.map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json') };
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id); const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population: json('population/population.json') };
const s0 = newGame({ nation: 'DEU', political, ownersWithProvinces: nationIds, start }).state;
const tankLine = s0.nations.DEU.facilities.find((f) => f.type === 'FCT-TANKS');
const at = (date) => ({ ...s0, date, nations: { ...s0.nations, DEU: { ...s0.nations.DEU, stocks: { ...s0.nations.DEU.stocks, steel: 5e6, components: 5e5, engines: 5e5 } } } });

test('scelta della ricetta: senza la Boemia la Germania non può produrre il Pz 38(t)', () => {
  assert.ok(tankLine, 'la Germania parte con una fabbrica di carri');
  const ctx = (who) => ({ catalog, table, researched: all, controllerOf: () => who });
  assert.throws(() => setFacilityRecipe(at('1939-04-01'), 'DEU', tankLine.id, P38.id, ctx('CZE')), /serve il controllo di P_CZE_BOHEMIA/);
  assert.throws(() => setFacilityRecipe(at('1938-01-01'), 'DEU', tankLine.id, P38.id, ctx('DEU')), /solo dal 1938-10-01/);
  const ok = setFacilityRecipe(at('1939-04-01'), 'DEU', tankLine.id, P38.id, ctx('DEU'));
  assert.equal(ok.nations.DEU.facilities.find((f) => f.id === tankLine.id).recipeId, P38.id);
  const rows = facilityRecipeRows(at('1939-04-01'), 'DEU', { catalog, table, researched: all, controllerOf: () => 'CZE', placeName: () => 'Boemia' });
  const locked = rows.find((r) => r.facilityId === tankLine.id).locked.find((l) => l.recipeId === P38.id);
  assert.equal(locked.requires, 'serve il controllo di Boemia');
  assert.notEqual(defaultEquipmentRecipe(catalog.recipes, 'DEU', 'FCT-TANKS', table, all, '1939-04-01', () => 'CZE')?.id, P38.id);
});

test('produzione giornaliera: la linea si ferma se la Boemia viene persa o il modello esce di produzione, e riprende', () => {
  const base = { catalog, economy, baseline: json('resources/extraction_baseline.json'), hydro: json('resources/hydro_plants.json'), political, cash: start.cash };
  const set = (date) => setFacilityRecipe(at(date), 'DEU', tankLine.id, P38.id, { catalog, table, researched: all, controllerOf: () => 'DEU' });
  const made = (s) => s.nations.DEU.stocks['equipment.TNK-DEU-PZ-38T'] ?? 0;
  const run = (s, who, days) => advanceDays(s, days, [createEconomySystem({ ...base, controllerOf: () => who })]);
  const held = run(set('1939-04-01'), 'DEU', 90);
  assert.ok(made(held) > 0, 'con la Boemia la fabbrica consegna Pz 38(t)');
  const lost = run(set('1939-04-01'), 'CZE', 90);
  assert.equal(made(lost), 0, 'senza la Boemia nessun carro');
  assert.equal(lost.nations.DEU.facilities.find((f) => f.id === tankLine.id).recipeId, P38.id, 'la ricetta resta: riprende se la provincia torna');
  assert.ok(made(run(lost, 'DEU', 90)) > 0);
  const ended = run(set('1942-05-01'), 'DEU', 120);
  const ended2 = run(ended, 'DEU', 60);
  assert.equal(made(ended2), made(ended), 'dopo il 30/6/1942 non arrivano più carri nuovi');
});

test('battaglia: pesi del 35(t) e 38(t) fra il Panzer II e il Panzer III; parco tedesco con i carri cechi dal 1939', () => {
  const W = buildWeaponOf(eqCatalog);
  const w = (id) => weaponWeight(W('DEU', `equipment.${id}`), cfg);
  for (const id of ['TNK-DEU-PZ-35T', 'TNK-DEU-PZ-38T']) {
    assert.ok(w(id).hard > w('TNK-DEU-PZ-II').hard && w(id).hard < w('TNK-DEU-PZ-III').hard);
    assert.ok(w(id).armor > w('TNK-DEU-PZ-II').armor && w(id).armor < w('TNK-DEU-PZ-III').armor);
  }
  assert.deepEqual(validateBattleV2(cfg, { catalogIds: new Set(eqCatalog.entries.map((e) => e.equipment_id)) }), []);
  const mix = (year) => Object.fromEntries(tankParts({ planned: 100, effective: 100 }, W('DEU', 'equipment.carri'), 100, year, cfg, (id) => W('DEU', `equipment.${id}`)).map((p) => [p.weapon.id, Math.round(p.n * 100) / 100]));
  assert.equal(mix(1938)['TNK-DEU-PZ-38T'], undefined);
  assert.equal(mix(1940)['TNK-DEU-PZ-38T'], 9);
  assert.equal(mix(1942)['TNK-DEU-PZ-38T'], 15);
  assert.equal(mix(1944)['TNK-DEU-PZ-38T'], undefined);
});
