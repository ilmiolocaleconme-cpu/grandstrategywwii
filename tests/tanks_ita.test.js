// Carri italiani per modello (24/11/2026, Italia passo 4; scelte dell'utente: elenco completo, battaglione L 3 d'appoggio alla fanteria,
// piano storico in catena come i carri da fanteria britannici). 8 carri sameAs delle due voci di classe (L 3, carri medi M), 4 semoventi,
// pesi per modello, composizione per anno, divisione corazzata 1942 coi semoventi da 75/18.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';
import { weaponWeight } from '../src/rules/battleV2.js';
import { designCategory, designProblems } from '../src/data/modules.js';
import { valuePerTonne, classIdsWithModels } from '../src/rules/aiProduction.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const CATALOG = mergeEquipmentCatalogs(fs.readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => /^catalog.*\.json$/.test(f)).sort().map((f) => read(`units/equipment/${f}`)));
const W = buildWeaponOf(CATALOG);
const B = read('units/battle_v2.json');
const MODS = read('units/modules/modules_ita.json');
const recipes = new Map(buildEquipmentRecipes(CATALOG, read('units/equipment/equipment_production.json')).map((r) => [r.equipmentId, r]));
const LIGHT = ['TNK-ITA-L3-33', 'TNK-ITA-L3-35', 'TNK-ITA-L6-40'];
const MEDIUM = ['TNK-ITA-M11-39', 'TNK-ITA-M13-40', 'TNK-ITA-M14-41', 'TNK-ITA-M15-42', 'TNK-ITA-P40'];
const SP = ['TD-ITA-SEM-47-32', 'TD-ITA-SEM-75-18', 'TD-ITA-SEM-75-34', 'TD-ITA-SEM-105-25'];

test('12 mezzi corazzati italiani: carri modello della loro voce di classe, semoventi per modello, tutti con peso e ricetta', () => {
  const byId = new Map(CATALOG.entries.map((e) => [e.equipment_id, e]));
  for (const [ids, cls] of [[LIGHT, 'TNK-ITA-L3-ARM-1940'], [MEDIUM, 'TNK-ITA-M13-1940'], [SP, undefined]]) {
    for (const id of ids) {
      assert.equal(byId.get(id).sameAs, cls, id);
      assert.ok(B.firepower.tankModels[id], `${id}: peso`);
      assert.ok(recipes.get(id), `${id}: ricetta`);
    }
    if (cls) assert.ok(B.firepower.fleetMix[cls]?.length, `${cls}: composizione per anno`);
  }
  assert.ok(classIdsWithModels(CATALOG, B).has('TNK-ITA-M13-1940'), 'la voce di classe non si produce');
  for (const [cls, rows] of Object.entries(B.firepower.fleetMix).filter(([k]) => k.includes('-ITA-'))) for (const r of rows) {
    assert.ok(Math.abs(Object.values(r.mix).reduce((a, b) => a + b, 0) - 1) < 1e-9, `${cls} ${r.from}: somma 1`);
    for (const id of Object.keys(r.mix)) assert.ok(byId.get(id), id);
  }
  assert.ok(weaponWeight(W('ITA', 'equipment.TNK-ITA-M13-40'), B).armor < weaponWeight(W('GBR', 'equipment.TNK-GBR-MATILDA2'), B).armor, 'corazze italiane sottili');
});

test('valore per tonnellata: M 13 meglio dell\'M 11 (l\'IA lo adotterebbe anche senza piano); il semovente da 75/18 vale più dell\'M 13/40', () => {
  const v = (id) => valuePerTonne(W('ITA', `equipment.${id}`), recipes.get(id).massTonnes, B);
  assert.ok(v('TNK-ITA-M13-40') > v('TNK-ITA-M11-39'));
  assert.ok(v('TNK-ITA-M15-42') > v('TNK-ITA-M13-40'));
  assert.ok(v('TD-ITA-SEM-75-18') > v('TNK-ITA-M13-40'));
});

test('battaglione L 3 d\'appoggio: la divisione resta di fanteria; corazzata 1942 coi semoventi nei limiti dell\'editor', () => {
  const rules = read('units/modules/editor_rules.json');
  const researched = new Set(read('research/technologies.json').technologies.map((t) => t.id));
  const bin = MODS.compositions.find((c) => c.templateId === 'TPL-ITA-INF-1940');
  const withTanks = [...bin.modules, ['MOD-ITA-CARRI-APP', 1]];
  assert.equal(designCategory(withTanks, MODS.modules), 'infantry');
  assert.deepEqual(designProblems(withTanks, { modules: MODS.modules, rules, nation: 'ITA', date: '1940-06-01', researched }), []);
  const arm42 = MODS.compositions.find((c) => c.templateId === 'TPL-ITA-ARM-1942');
  assert.equal(designCategory(arm42.modules, MODS.modules), 'armored');
  assert.deepEqual(designProblems(arm42.modules, { modules: MODS.modules, rules, nation: 'ITA', date: arm42.activeFrom, researched }), []);
});

test('fabbriche: carri in catena L 3/35 → M 11/39 → M 13/40 → M 14/41 → M 15/42; seconda linea → semoventi 75/18 e 75/34', () => {
  const tanks = read('industry/initial_industry.json').nations.ITA.facilities.filter((f) => f.factory === 'FCT-TANKS');
  const chain = (p) => (p ? [[p.recipeId, p.from], ...chain(p.then)] : []);
  assert.deepEqual(tanks.map((f) => [f.recipeId, chain(f.plannedRecipe)]), [
    ['REC-TNK-ITA-L3-35', [['REC-TNK-ITA-M11-39', '1939-01-01'], ['REC-TNK-ITA-M13-40', '1940-06-01'], ['REC-TNK-ITA-M14-41', '1941-08-01'], ['REC-TNK-ITA-M15-42', '1943-01-01']]],
    ['REC-TNK-ITA-L3-35', [['REC-TD-ITA-SEM-75-18', '1941-03-01'], ['REC-TD-ITA-SEM-75-34', '1943-03-01']]]]);
  for (const f of tanks) for (const [r, from] of chain(f.plannedRecipe)) {
    const x = recipes.get(r.replace(/^REC-/, ''));
    assert.ok(!x.requiresTech, `${r}: nessuna tecnologia richiesta (il piano non si blocca)`);
    assert.ok((x.availableFrom ?? '0') <= from && (!x.availableTo || x.availableTo >= from), `${r}: disponibile alla data del piano`);
  }
});
