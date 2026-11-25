// Carri giapponesi per modello (25/11/2026, Giappone passo 4; scelte dell'utente: elenco completo, catena).
// Voci di classe dei leggeri (Tipo 94, Te-Ke, Ha-Go) e dei medi (Tipo 89, Chi-Ha, Shinhoto, Chi-He, Chi-Nu).
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
const LIGHT = ['TNK-JPN-T94TK', 'TNK-JPN-T97TK', 'TNK-JPN-TYPE95-1942'];
const MEDIUM = ['TNK-JPN-T89', 'TNK-JPN-TYPE97-1942', 'TNK-JPN-SHINHOTO', 'TNK-JPN-CHIHE', 'TNK-JPN-CHINU'];
const EXISTING = ['TNK-JPN-TYPE95-1942', 'TNK-JPN-TYPE97-1942'];

test('carri giapponesi: modelli della loro voce di classe con peso, ricetta e composizione per anno; catene', () => {
  const byId = new Map(CATALOG.entries.map((e) => [e.equipment_id, e]));
  for (const [ids, cls] of [[LIGHT, 'TNK-JPN-LIGHT-TANK'], [MEDIUM, 'TNK-JPN-MEDIUM-TANK']]) {
    for (const id of ids) {
      if (!EXISTING.includes(id)) assert.equal(byId.get(id).sameAs, cls, id);
      assert.ok(B.firepower.tankModels[id], `${id}: peso`); assert.ok(recipes.get(id), `${id}: ricetta`);
    }
    assert.ok(classIdsWithModels(CATALOG, B).has(cls), `${cls}: la voce di classe non si produce`);
    for (const r of B.firepower.fleetMix[cls]) assert.ok(Math.abs(Object.values(r.mix).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  const chains = new Map(read('units/equipment/replacements.json').entries.map((e) => [e.id, e.replaces]));
  assert.equal(chains.get('TNK-JPN-SHINHOTO'), 'TNK-JPN-TYPE97-1942');
  assert.equal(chains.get('TNK-JPN-TYPE97-1942'), 'TNK-JPN-T89');
  const w = (id) => weaponWeight(W('JPN', `equipment.${id}`), B);
  assert.ok(w('TNK-JPN-TYPE97-1942').armor < weaponWeight(W('USA', 'equipment.TNK-USA-M4-75'), B).armor, 'corazza giapponese sottile');
  assert.ok(w('TNK-JPN-SHINHOTO').hard > w('TNK-JPN-TYPE97-1942').hard, 'il 47 ad alta velocità vale di più contro i carri');
});

test('valore per tonnellata: Shinhoto meglio del Chi-Ha, Chi-He meglio dello Shinhoto', () => {
  const v = (id) => valuePerTonne(W('JPN', `equipment.${id}`), recipes.get(id).massTonnes, B);
  assert.ok(v('TNK-JPN-SHINHOTO') > v('TNK-JPN-TYPE97-1942'));
  assert.ok(v('TNK-JPN-CHIHE') > v('TNK-JPN-SHINHOTO'));
});

test('fabbriche: Ha-Go; seconda linea Tipo 89 → Chi-Ha (1/1938) → Shinhoto (1/1942) → Chi-He (1/1943), disponibili alla loro data', () => {
  const tanks = read('industry/initial_industry.json').nations.JPN.facilities.filter((f) => f.factory === 'FCT-TANKS');
  const chain = (p) => (p ? [[p.recipeId, p.from], ...chain(p.then)] : []);
  assert.deepEqual(tanks.map((f) => [f.recipeId, chain(f.plannedRecipe)]), [
    ['REC-TNK-JPN-TYPE95-1942', []],
    ['REC-TNK-JPN-T89', [['REC-TNK-JPN-TYPE97-1942', '1938-01-01'], ['REC-TNK-JPN-SHINHOTO', '1942-01-01'], ['REC-TNK-JPN-CHIHE', '1943-01-01']]]]);
  for (const f of tanks) for (const [r, from] of chain(f.plannedRecipe)) {
    const x = recipes.get(r.replace(/^REC-/, ''));
    assert.ok(!x.requiresTech && (x.availableFrom ?? '0') <= from && (!x.availableTo || x.availableTo >= from), r);
  }
});
