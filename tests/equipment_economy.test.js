// Produzione di equipaggiamenti dentro il ciclo economico reale (Fase 4, 03/11/2026): ricetta scelta dal giocatore, lotti nello stato dell'impianto, scorta equipment.<id>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { createEconomySystem } from '../src/game/economySystem.js';
import { setFacilityRecipe } from '../src/game/facilityRecipe.js';
import { validateNations } from '../src/game/economyState.js';
import { newGame } from '../src/game/state.js';
import { advanceDays } from '../src/game/engine.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const edir = new URL('../data/units/equipment/', import.meta.url);
const eqCatalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const table = json('units/equipment/equipment_production.json');
const recipes = [...json('industry/recipes.json').recipes, ...buildEquipmentRecipes(eqCatalog, table)];
const catalog = { recipes: new Map(recipes.map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json') };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population: json('population/population.json') };
const eco = createEconomySystem({ catalog, economy, baseline: json('resources/extraction_baseline.json'), hydro: json('resources/hydro_plants.json'), political, cash: start.cash });
// ATTENZIONE: nei dati iniziali (initial_industry.json) le grandi potenze NON hanno fabbriche di artiglieria né di armi leggere (solo CZE e la fascia C): qui se ne dà una alla
// Francia come se il giocatore l'avesse costruita (la costruzione è già coperta da construction_game.test.js).
const fresh = () => {
  const s = newGame({ nation: 'FRA', political, ownersWithProvinces: nationIds, start }).state;
  const fra = s.nations.FRA;
  const extra = ['FCT-ARTILLERY', 'FCT-WEAPONS'].map((type, i) => ({ id: `FRA:FRA:${type}:test:1`, type, recipeId: type === 'FCT-ARTILLERY' ? 'REC-ARTILLERY-001' : 'REC-MG-FRA-FM2429', territory: 'FRA', damage: 0, priority: 900 + i, active: true }));
  return { ...s, nations: { ...s.nations, FRA: { ...fra, facilities: [...fra.facilities, ...extra], stocks: { ...fra.stocks, steel: 5e6, components: 5e5 } } } };
};
const ctx = { catalog, table };
const HOW = 'REC-ART-FRA-HOW155C';

test('la fabbrica di artiglieria francese, con la ricetta dell\'obice 155 mm, consegna lotti interi nella scorta equipment.<id>', () => {
  const s0 = fresh();
  const fac = s0.nations.FRA.facilities.find((f) => f.type === 'FCT-ARTILLERY');
  assert.ok(fac);
  const s1 = setFacilityRecipe(s0, 'FRA', fac.id, HOW, ctx);
  assert.equal(s1.nations.FRA.facilities.find((f) => f.id === fac.id).recipeId, HOW);
  assert.equal(s0.nations.FRA.facilities.find((f) => f.id === fac.id).recipeId, 'REC-ARTILLERY-001', 'lo stato di partenza non è modificato');
  const key = 'equipment.ART-FRA-HOW155C';
  const early = advanceDays(s1, 20, [eco]);
  assert.equal(early.nations.FRA.stocks[key] ?? 0, 0, 'costruzione 56 giorni: nulla dopo 20');
  const late = advanceDays(s1, 70, [eco]);
  const made = late.nations.FRA.stocks[key];
  assert.ok(made >= 1 && Number.isInteger(made), `pezzi interi in scorta (${made})`);
  assert.deepEqual(validateNations(late.nations), []);
  const f = late.nations.FRA.facilities.find((x) => x.id === fac.id);
  assert.ok(f.wip >= 0 && Number.isInteger(f.runDays), 'lo stato dei lotti è nell\'impianto');
  assert.deepEqual(advanceDays(s1, 70, [eco]), late, 'deterministico');
});

test('setFacilityRecipe rifiuta ciò che non è valido, con il motivo', () => {
  const s = fresh();
  const art = s.nations.FRA.facilities.find((f) => f.type === 'FCT-ARTILLERY');
  const err = (id, re, st = s, nation = 'FRA') => assert.throws(() => setFacilityRecipe(st, nation, id, ...[re[0]], ctx), re[1]);
  err(art.id, ['REC-MG-FRA-FM2429', /è di FCT-WEAPONS, non di FCT-ARTILLERY/]);
  err(art.id, ['REC-ART-DEU-MOR-81', /un'altra nazione/]);
  err(art.id, ['REC-NESSUNA', /ricetta sconosciuta/]);
  err('FRA:X', [HOW, /impianto sconosciuto/]);
  assert.throws(() => setFacilityRecipe(s, 'ZZZ', art.id, HOW, ctx), /nazione sconosciuta/);
  const locked = structuredClone(table); locked.groups.basic_artillery.requires = 'TECH-X';
  assert.throws(() => setFacilityRecipe(s, 'FRA', art.id, HOW, { catalog, table: locked }), /non ancora sbloccato/);
  assert.doesNotThrow(() => setFacilityRecipe(s, 'FRA', art.id, HOW, { catalog, table: locked, researched: new Set(['TECH-X']) }));
  const withBatch = structuredClone(setFacilityRecipe(s, 'FRA', art.id, HOW, ctx));
  withBatch.nations.FRA.facilities.find((f) => f.id === art.id).batches = [{ qty: 5, readyOn: '1936-03-01' }];
  assert.throws(() => setFacilityRecipe(withBatch, 'FRA', art.id, 'REC-ARTILLERY-001', ctx), /lotti in consegna/);
});
