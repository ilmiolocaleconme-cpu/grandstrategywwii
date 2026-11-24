// Carri britannici per modello (24/11/2026, passo 4, scelte dell'utente A + B + A): 12 modelli sameAs delle tre voci di classe (leggeri, cruiser,
// carri da fanteria), pesi per modello, composizione per anno dei carri iniziali, tipo comune «carri d'appoggio alla fanteria» (la divisione resta
// di fanteria), Army Tank Regiment e Mixed Division 1942, fabbrica dei carri Mk VI → A13 e linea dei carri da fanteria Mk VI → Matilda I.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';
import { weaponWeight } from '../src/rules/battleV2.js';
import { designCategory, designProblems, designVariant } from '../src/data/modules.js';
import { valuePerTonne, classIdsWithModels } from '../src/rules/aiProduction.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const CATALOG = mergeEquipmentCatalogs(fs.readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => /^catalog.*\.json$/.test(f)).sort().map((f) => read(`units/equipment/${f}`)));
const W = buildWeaponOf(CATALOG);
const B = read('units/battle_v2.json');
const MODS = read('units/modules/modules_gbr.json');
const recipes = new Map(buildEquipmentRecipes(CATALOG, read('units/equipment/equipment_production.json')).map((r) => [r.equipmentId, r]));
const LIGHT = ['TNK-GBR-MK6', 'TNK-GBR-TETRARCH'];
const CRUISER = ['TNK-GBR-A9', 'TNK-GBR-A10', 'TNK-GBR-A13', 'TNK-GBR-CRUSADER', 'TNK-GBR-CROMWELL', 'TNK-GBR-COMET'];
const INFANTRY = ['TNK-GBR-MATILDA1', 'TNK-GBR-MATILDA2', 'TNK-GBR-VALENTINE', 'TNK-GBR-CHURCHILL'];

test('12 carri britannici, ognuno modello della sua voce di classe con peso proprio e ricetta', () => {
  const byId = new Map(CATALOG.entries.map((e) => [e.equipment_id, e]));
  for (const [ids, cls] of [[LIGHT, 'TNK-GBR-LIGHT-TANK-1939'], [CRUISER, 'TNK-GBR-CRUISER-1939'], [INFANTRY, 'TNK-GBR-INFANTRY-TANK']]) {
    for (const id of ids) {
      assert.equal(byId.get(id).sameAs, cls, id);
      assert.ok(B.firepower.tankModels[id], `${id}: peso`);
      assert.ok(recipes.get(id), `${id}: ricetta`);
    }
    assert.ok(B.firepower.fleetMix[cls]?.length, `${cls}: composizione per anno`);
  }
  assert.ok(classIdsWithModels(CATALOG, B).has('TNK-GBR-INFANTRY-TANK'), 'la voce di classe non si produce');
  assert.equal(weaponWeight(W('GBR', 'equipment.TNK-GBR-CHURCHILL'), B).armor, 1.4);
});

test('valore per tonnellata: ogni carro cruiser successivo vale almeno il 20% in più (l\'IA lo adotta); Churchill sopra il Valentine', () => {
  const v = (id) => valuePerTonne(W('GBR', `equipment.${id}`), recipes.get(id).massTonnes, B);
  assert.ok(v('TNK-GBR-CRUSADER') / v('TNK-GBR-A13') >= 1.2);
  assert.ok(v('TNK-GBR-CROMWELL') / v('TNK-GBR-CRUSADER') >= 1.2);
  assert.ok(v('TNK-GBR-COMET') / v('TNK-GBR-CROMWELL') >= 1.2);
  assert.ok(v('TNK-GBR-CHURCHILL') > v('TNK-GBR-VALENTINE'));
});

test('tipo comune «carri d\'appoggio»: la Mixed Division resta di fanteria e rispetta i limiti; un vero battaglione carri la renderebbe corazzata', () => {
  const mixed = MODS.compositions.find((c) => c.templateId === 'TPL-GBR-MIXED-1942');
  assert.equal(designCategory(mixed.modules, MODS.modules), 'infantry');
  assert.equal(designVariant(mixed.modules, MODS.modules), null);
  assert.equal(mixed.variant, 'mixed', 'il template non viene assegnato da solo alle divisioni di fanteria esistenti');
  const rules = read('units/modules/editor_rules.json');
  const researched = new Set(read('research/technologies.json').technologies.map((t) => t.id));
  assert.deepEqual(designProblems(mixed.modules, { modules: MODS.modules, rules, nation: 'GBR', date: mixed.activeFrom, researched }), []);
  assert.equal(designCategory([...mixed.modules, ['MOD-GBR-ARMD-REGT', 1]], MODS.modules), 'armored');
  assert.ok(designProblems([['MOD-GBR-INF-1938', 6], ['MOD-GBR-ARMY-TANK-REGT', 4], ['MOD-GBR-SVC', 1]], { modules: MODS.modules, rules, nation: 'GBR', date: '1942-06-01', researched }).some((x) => /infantry_tank: 4 \(massimo 3\)/.test(x)));
});

test('fabbriche: carri Mk VI → A13 (6/1938), linea dei carri da fanteria Mk VI → Matilda I (6/1937)', () => {
  const tanks = read('industry/initial_industry.json').nations.GBR.facilities.filter((f) => f.factory === 'FCT-TANKS').map((f) => [f.recipeId, f.plannedRecipe?.recipeId, f.plannedRecipe?.from]);
  assert.deepEqual(tanks, [['REC-TNK-GBR-MK6', 'REC-TNK-GBR-A13', '1938-06-01'], ['REC-TNK-GBR-MK6', 'REC-TNK-GBR-MATILDA1', '1937-06-01']]);
});
