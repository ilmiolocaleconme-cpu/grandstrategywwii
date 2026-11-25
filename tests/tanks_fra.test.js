// Carri francesi per modello (25/11/2026, Francia passo 4; scelte dell'utente: elenco completo, catena completa).
// Voci di classe dei leggeri (R 35, H 35, H 39, FCM 36, AMR 35) e dei medi di cavalleria (SOMUA S35, D 2); B1 e B1 bis per modello.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';
import { weaponWeight } from '../src/rules/battleV2.js';
import { valuePerTonne, classIdsWithModels } from '../src/rules/aiProduction.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const CATALOG = mergeEquipmentCatalogs(fs.readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => /^catalog.*\.json$/.test(f)).sort().map((f) => read(`units/equipment/${f}`)));
const W = buildWeaponOf(CATALOG);
const B = read('units/battle_v2.json');
const recipes = new Map(buildEquipmentRecipes(CATALOG, read('units/equipment/equipment_production.json')).map((r) => [r.equipmentId, r]));
const LIGHT = ['TNK-FRA-R35', 'TNK-FRA-H35', 'TNK-FRA-H39-1940', 'TNK-FRA-FCM36', 'TNK-FRA-AMR35'];
const MEDIUM = ['TNK-FRA-SOMUA-S35', 'TNK-FRA-D2'];

test('carri francesi: modelli della loro voce di classe con peso, ricetta e composizione per anno; B1 e B1 bis per modello', () => {
  const byId = new Map(CATALOG.entries.map((e) => [e.equipment_id, e]));
  for (const [ids, cls] of [[LIGHT, 'TNK-FRA-LIGHT-TANK'], [MEDIUM, 'TNK-FRA-MEDIUM-TANK']]) {
    for (const id of ids) {
      if (id !== 'TNK-FRA-H39-1940') assert.equal(byId.get(id).sameAs, cls, id);
      assert.ok(B.firepower.tankModels[id], `${id}: peso`); assert.ok(recipes.get(id), `${id}: ricetta`);
    }
    assert.ok(classIdsWithModels(CATALOG, B).has(cls), `${cls}: la voce di classe non si produce`);
    for (const r of B.firepower.fleetMix[cls]) assert.ok(Math.abs(Object.values(r.mix).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  for (const id of ['TNK-FRA-B1', 'TNK-FRA-B1BIS-1940']) assert.ok(B.firepower.tankModels[id], id);
  const chains = new Map(read('units/equipment/replacements.json').entries.map((e) => [e.id, e.replaces]));
  assert.equal(chains.get('TNK-FRA-B1BIS-1940'), 'TNK-FRA-B1');
  const w = (id) => weaponWeight(W('FRA', `equipment.${id}`), B);
  assert.ok(w('TNK-FRA-R35').armor > weaponWeight(W('DEU', 'equipment.TNK-DEU-PZ-II'), B).armor, 'corazza francese più spessa del Pz II');
  assert.ok(w('TNK-FRA-R35').hard < w('TNK-FRA-SOMUA-S35').hard, 'il 37 corto vale poco contro i carri');
  assert.ok(w('TNK-FRA-B1BIS-1940').armor >= 1.3);
});

test('valore per tonnellata: B1 bis meglio del B1; H 39 meglio dell\'R 35', () => {
  const v = (id) => valuePerTonne(W('FRA', `equipment.${id}`), recipes.get(id).massTonnes, B);
  assert.ok(v('TNK-FRA-B1BIS-1940') > v('TNK-FRA-B1'));
  assert.ok(v('TNK-FRA-H39-1940') > v('TNK-FRA-R35'));
});

test('fabbriche: R 35 → H 39 (1/1939); SOMUA S35; B1 → B1 bis (6/1937); i piani sono disponibili alla loro data', () => {
  const tanks = read('industry/initial_industry.json').nations.FRA.facilities.filter((f) => f.factory === 'FCT-TANKS');
  assert.deepEqual(tanks.map((f) => [f.recipeId, f.plannedRecipe?.recipeId ?? null, f.plannedRecipe?.from ?? null]), [
    ['REC-TNK-FRA-R35', 'REC-TNK-FRA-H39-1940', '1939-01-01'], ['REC-TNK-FRA-SOMUA-S35', null, null], ['REC-TNK-FRA-B1', 'REC-TNK-FRA-B1BIS-1940', '1937-06-01']]);
  for (const f of tanks) {
    const base = recipes.get(f.recipeId.replace(/^REC-/, ''));
    assert.ok(!base.availableFrom || base.availableFrom <= '1936-01-01', `${f.recipeId}: producibile all'inizio`);
    if (f.plannedRecipe) { const x = recipes.get(f.plannedRecipe.recipeId.replace(/^REC-/, '')); assert.ok(x.availableFrom <= f.plannedRecipe.from && !x.requiresTech); }
  }
});
