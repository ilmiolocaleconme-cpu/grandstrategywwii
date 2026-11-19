// Riconversione degli impianti (20/11/2026): linee riservate ai modelli futuri (piano storico) e riconversione mensile dell'IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRetoolSystem, aiRetoolNation, equipmentNeeds, RETOOL_COOLDOWN_DAYS } from '../src/game/retoolSystem.js';
import { setFacilityRecipe } from '../src/game/facilityRecipe.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { loadIndustryCatalog } from '../src/data/industry.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const table = json('units/equipment/equipment_production.json');
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const recipes = new Map(buildEquipmentRecipes(catalog, table).map((r) => [r.id, r]));
const factories = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') }).byId;
const techsOf = (n) => new Set(n.research?.done ?? []);
const fac = (id, recipeId, extra = {}) => ({ id, type: recipes.get(recipeId).factory, recipeId, territory: 'USSR', damage: 0, priority: 1, active: true, ...extra });
const system = (divs = []) => createRetoolSystem({ recipes, factories, table, techsOf, divisionsOf: () => divs, sourcesOf: (n, item) => [item] });

test('industria iniziale URSS: linee riservate a mortai da 50 e 120, contraerea da 37 e fucili anticarro, più l\'obice da 152', () => {
  const f = json('industry/initial_industry.json').nations.USSR.facilities;
  const plans = f.filter((x) => x.plannedRecipe).map((x) => [x.recipeId, x.plannedRecipe.recipeId, x.plannedRecipe.from]);
  assert.deepEqual(plans, [
    ['REC-ART-USSR-MOR82', 'REC-ART-USSR-MOR50', '1938-01-01'],
    ['REC-ART-USSR-MOR82', 'REC-ART-USSR-MOR120', '1939-01-01'],
    ['REC-ART-USSR-AA76', 'REC-ART-USSR-AA37', '1939-01-01'],
    ['REC-ART-USSR-AT45-1939', 'REC-ART-USSR-PTRD', '1941-09-01'],
  ]);
  assert.ok(f.some((x) => x.recipeId === 'REC-ART-USSR-HOW152-1939' && !x.plannedRecipe));
});

test('piano storico: la linea si riconverte alla data, i lotti chiusi arrivano subito in magazzino; vale anche per il giocatore', () => {
  const line = fac('L1', 'REC-ART-USSR-MOR82', { plannedRecipe: { recipeId: 'REC-ART-USSR-MOR50', from: '1938-01-01' }, wip: 3.5, runDays: 4, batches: [{ qty: 15, readyOn: '1938-01-10' }] });
  const st = (date) => ({ date, player: 'USSR', nations: { USSR: { stocks: {}, facilities: [line] } } });
  assert.equal(system()(st('1937-12-31')).nations.USSR.facilities[0].recipeId, 'REC-ART-USSR-MOR82');
  const out = system()(st('1938-01-01')).nations.USSR;
  assert.equal(out.facilities[0].recipeId, 'REC-ART-USSR-MOR50');
  assert.equal(out.facilities[0].plannedRecipe, undefined);
  assert.equal(out.facilities[0].wip, undefined);
  assert.equal(out.stocks['equipment.ART-USSR-MOR82'], 15, 'il lotto chiuso non si perde e resta del vecchio modello');
});

test('piano storico: aspetta la tecnologia del modello; la scelta manuale del giocatore lo annulla', () => {
  const ppsh = fac('W1', 'REC-INW-USSR-RIFLE-1939', { plannedRecipe: { recipeId: 'REC-INW-USSR-SMG-PPSH41', from: '1941-01-01' } });
  const st = { date: '1941-06-01', player: 'DEU', nations: { USSR: { stocks: {}, facilities: [ppsh] } } };
  assert.equal(system()(st).nations.USSR.facilities[0].recipeId, 'REC-INW-USSR-RIFLE-1939', 'senza TECH-INF-EMERG resta il fucile');
  const withTech = { ...st, nations: { USSR: { ...st.nations.USSR, research: { done: ['TECH-INF-EMERG'] } } } };
  assert.equal(system()(withTech).nations.USSR.facilities[0].recipeId, 'REC-INW-USSR-SMG-PPSH41');
  const manual = setFacilityRecipe({ date: '1936-02-01', nations: { USSR: { facilities: [ppsh] } } }, 'USSR', 'W1', 'REC-INW-USSR-PISTOL-TT33', { catalog: { recipes, factories }, table });
  assert.equal(manual.nations.USSR.facilities[0].plannedRecipe, undefined);
});

test('IA: il primo del mese una linea senza fabbisogno passa al pezzo che manca alle divisioni; una linea utile resta', () => {
  const divs = [{ items: { 'equipment.MG-USSR-LMG-1939': { planned: 2000, effective: 100 }, 'equipment.INW-USSR-PISTOL-TT33': { planned: 100, effective: 100 } } }];
  const nation = { stocks: {}, facilities: [fac('P1', 'REC-INW-USSR-PISTOL-TT33'), fac('R1', 'REC-INW-USSR-RIFLE-1939')] };
  const need = equipmentNeeds({ divisions: divs, stocks: nation.stocks, sourcesOf: (i) => [i] });
  assert.equal(need.get('equipment.MG-USSR-LMG-1939'), 1900);
  const r = aiRetoolNation(nation, 'USSR', { recipes, factories, table, researched: new Set(), date: '1936-02-01', need });
  assert.deepEqual(r.changes.map((c) => [c.id, c.to]), [['P1', 'REC-MG-USSR-LMG-1939']], 'pistole senza fabbisogno → mitragliatrici; il secondo impianto non serve più (fabbisogno coperto in 90 giorni)');
  assert.equal(system(divs)({ date: '1936-02-02', player: 'DEU', nations: { USSR: nation } }).nations.USSR.facilities[0].recipeId, 'REC-INW-USSR-PISTOL-TT33', 'solo il primo del mese');
  assert.equal(system(divs)({ date: '1936-02-01', player: 'USSR', nations: { USSR: nation } }).nations.USSR.facilities[0].recipeId, 'REC-INW-USSR-PISTOL-TT33', 'mai sulla nazione del giocatore');
});

test('IA: una linea ferma (T-26 fuori produzione) passa a un altro carro; dopo una riconversione aspetta prima di cambiare ancora', () => {
  const nation = { stocks: {}, facilities: [fac('T1', 'REC-TNK-USSR-T26-1940')], research: { done: ['TECH-ARM-GUN-3750', 'TECH-ARM-GUN-75S', 'TECH-ARM-SLOPED'] } };
  const out = system([])({ date: '1941-08-01', player: 'DEU', nations: { USSR: nation } }).nations.USSR.facilities[0];
  assert.notEqual(out.recipeId, 'REC-TNK-USSR-T26-1940');
  assert.equal(recipes.get(out.recipeId).factory, 'FCT-TANKS');
  assert.equal(out.retooledOn, '1941-08-01');
  const again = system([{ items: { 'equipment.TNK-USSR-KV-1940': { planned: 50, effective: 0 } } }])({ date: '1941-09-01', player: 'DEU', nations: { USSR: { ...nation, facilities: [out] } } });
  assert.equal(again.nations.USSR.facilities[0].recipeId, out.recipeId, `nessun cambio prima di ${RETOOL_COOLDOWN_DAYS} giorni`);
});

test('illustrazioni: ogni voce ha la variante sovietica e il file esiste', () => {
  const art = json('assets/unit_illustrations.json');
  for (const it of art.items) {
    assert.ok(it.byNation?.USSR, it.id);
    assert.ok(readFileSync(new URL(`../${art.folder}/${it.byNation.USSR}`, import.meta.url)).length > 1000, it.byNation.USSR);
  }
});
