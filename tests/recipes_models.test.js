// Ricette per modello (13/11/2026): peso per modello dell'artiglieria, carri tedeschi Pz I…Tiger II, date di inizio produzione, frumento come «miniera» (azienda agricola).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalogFrom } from '../src/data/industry.js';
import { fullCapacityFlows } from '../src/data/recipes.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, recipeUnlocked, validateEquipmentProduction } from '../src/data/equipmentProduction.js';
import { buildEquivalence } from '../src/data/equipmentEquivalence.js';
import { setFacilityRecipe } from '../src/game/facilityRecipe.js';
import { defaultEquipmentRecipe } from '../src/ui/recipeView.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const industry = loadIndustryCatalogFrom(text);
const edir = new URL('../data/units/equipment/', import.meta.url);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const table = json('units/equipment/equipment_production.json');
const generated = buildEquipmentRecipes(catalog, table);
const rec = (id) => generated.find((r) => r.equipmentId === id);
const recipes = new Map(generated.map((r) => [r.id, r]));

test('artiglieria: ogni pezzo producibile ha il suo peso; l\'acciaio al giorno della fabbrica non cambia, cambiano i pezzi', () => {
  const art = generated.filter((r) => r.factory === 'FCT-ARTILLERY');
  assert.ok(art.length > 50);
  for (const r of art) assert.ok(table.overrides[r.equipmentId]?.massTonnes > 0, `${r.equipmentId} senza peso per modello`);
  const fab = industry.byId.get('FCT-ARTILLERY');
  const le = fullCapacityFlows(rec('ART-DEU-LEFH18'), fab); const s = fullCapacityFlows(rec('ART-DEU-SFH18'), fab);
  assert.ok(Math.abs(le.inputsPerDay.steel - s.inputsPerDay.steel) < 0.01, 'stessa quota della fabbrica, stesso acciaio');
  assert.ok(le.outputPerDay > 2 * s.outputPerDay, 'leFH 18 (2 t) esce più del doppio dello sFH 18 (5,5 t)');
  assert.ok(fullCapacityFlows(rec('ART-DEU-GRW36'), fab).outputPerDay <= 25, 'mortai leggeri con quota ridotta');
});

test('carri tedeschi per modello: 7 Panzer con peso, collegati alla voce dei template (carri) come la voce di classe', () => {
  const pz = generated.filter((r) => /^TNK-DEU-PZ-/.test(r.equipmentId));
  assert.equal(pz.length, 7);
  assert.deepEqual(validateEquipmentProduction(table, { factoriesById: industry.byId, catalog }), []);
  const sources = buildEquivalence({ catalog })('DEU', 'equipment.TNK-DEU-TANK');
  for (const r of pz) assert.ok(sources.includes(r.output.product), `${r.equipmentId} rifornisce le divisioni`);
});

test('date di inizio produzione: nessun modello futuro prima della sua data, stessa regola per tutte le nazioni', () => {
  assert.equal(recipeUnlocked(table, rec('TNK-DEU-PZ-V'), new Set(), '1936-01-01'), false);
  assert.equal(recipeUnlocked(table, rec('TNK-DEU-PZ-V'), new Set(), '1943-01-01'), true);
  assert.equal(recipeUnlocked(table, rec('TNK-USSR-T34-1940'), new Set(), '1939-12-31'), false);
  assert.equal(recipeUnlocked(table, rec('TNK-DEU-PZ-I'), new Set(), '1936-01-01'), true);
  assert.equal(recipeUnlocked(table, rec('TNK-DEU-PZ-V'), new Set(), null), true, 'senza data: nessun blocco (compatibilità)');
  const state = { date: '1936-01-01', nations: { DEU: { facilities: [{ id: 'T1', type: 'FCT-TANKS', recipeId: 'REC-TNK-DEU-PZ-I' }] } } };
  const cat = { recipes, factories: industry.byId };
  assert.throws(() => setFacilityRecipe(state, 'DEU', 'T1', 'REC-TNK-DEU-PZ-VI', { catalog: cat, table }), /solo dal 1942-01-01/);
  assert.ok(setFacilityRecipe(state, 'DEU', 'T1', 'REC-TNK-DEU-PZ-II', { catalog: cat, table }));
  assert.equal(defaultEquipmentRecipe(recipes, 'USA', 'FCT-ARTILLERY', table, new Set(), '1936-01-01').equipmentId, 'ART-USA-GUN75-1940');
  // le ricette iniziali di tutte le nazioni sono disponibili al 1/1/1936
  const ind = json('industry/initial_industry.json');
  for (const [n, v] of Object.entries(ind.nations)) for (const f of v.facilities ?? []) {
    const r = recipes.get(f.recipeId);
    if (r) assert.ok(recipeUnlocked(table, r, new Set(), '1936-01-01'), `${n}: ${f.recipeId} non disponibile nel 1936`);
  }
});

test('frumento: l\'azienda agricola è la miniera del frumento (3 livelli, tetto +10%) nelle province con frumento', () => {
  const sites = json('resources/mine_sites.json').byProvince;
  const wheat = Object.entries(sites).filter(([, v]) => v.wheat && !v.wheat.legacy);
  assert.ok(wheat.length > 500);
  for (const [, v] of wheat) assert.equal(v.wheat.extraPerDay.length, 3);
});
