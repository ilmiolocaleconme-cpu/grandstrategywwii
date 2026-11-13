// Proiettili perforanti al tungsteno (decisione dell'utente 13/11/2026, opzione B): tecnologia, ingresso facoltativo nelle munizioni, bonus contro i carri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apRoundsBonus } from '../src/rules/combat.js';
import { produceDay } from '../src/rules/production.js';
import { fullCapacityFlows, validateRecipes } from '../src/data/recipes.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const recipes = json('industry/recipes.json').recipes;
const muni = recipes.find((r) => r.id === 'REC-MUNITIONS-001');
const factory = { factory_id: 'FCT-MUNITIONS', base_capacity_per_day: 100, energy_consumption: 0, factory_class: 'industry' };

test('tecnologia TECH-AMMO-AP: ramo Munizioni, +15% al massimo contro un nemico tutto corazzato', () => {
  const t = json('research/technologies.json');
  const ap = t.technologies.find((x) => x.id === 'TECH-AMMO-AP');
  assert.equal(ap.branch, 'ammunition');
  assert.deepEqual(ap.unlocks, [{ kind: 'ap_rounds', vsArmorMax: 0.15 }]);
  assert.ok(t.branches.some((b) => b.id === 'ammunition'));
});

test('bonus: cresce con la quota di corazzati nemici e con il tungsteno ricevuto', () => {
  const tanks = { category: 'armored', effective: 10000 }; const inf = { category: 'infantry', effective: 10000 };
  assert.equal(apRoundsBonus([tanks], 0.15), 0.15);
  assert.equal(apRoundsBonus([tanks, inf], 0.15), 0.075);
  assert.equal(apRoundsBonus([inf], 0.15), 0, 'contro la sola fanteria nessun bonus');
  assert.equal(apRoundsBonus([tanks], 0.15, 0.5), 0.075, 'metà del tungsteno, metà del bonus');
  assert.equal(apRoundsBonus([tanks], 0.15, 0), 0);
  assert.equal(apRoundsBonus([], 0.15), 0);
});

test('ricetta: il tungsteno conta solo con la tecnologia ed è facoltativo', () => {
  const t = muni.inputs.find((i) => i.resource === 'tungsten');
  assert.deepEqual(t, { resource: 'tungsten', perUnit: 0.005, requiresTech: 'TECH-AMMO-AP', optional: true });
  const without = fullCapacityFlows(muni, factory);
  assert.equal(without.inputsPerDay.tungsten, undefined); assert.equal(without.optionalPerDay, undefined, 'senza tecnologia la ricetta resta quella di prima');
  const withTech = fullCapacityFlows(muni, factory, null, new Set(['TECH-AMMO-AP']));
  assert.equal(withTech.inputsPerDay.tungsten, undefined, 'non fa da collo di bottiglia');
  assert.equal(withTech.optionalPerDay.tungsten, 0.5);
  const bad = { schema: json('industry/recipes.json').schema, recipes: [{ ...muni, inputs: [...muni.inputs.slice(0, -1), { resource: 'tungsten', perUnit: 0.005, optional: true }] }] };
  assert.ok(validateRecipes(bad, { factoriesById: new Map([['FCT-MUNITIONS', factory]]), resources: json('resources.json') }).some((e) => /facoltativo deve dipendere/.test(e)));
});

test('produzione: senza tungsteno le munizioni escono lo stesso; ne prende quanto c\'è', () => {
  const catalog = { recipes: new Map([[muni.id, muni]]), factories: new Map([['FCT-MUNITIONS', factory]]), techs: new Set(['TECH-AMMO-AP']) };
  const stock = { steel: 1e6, chemicals: 1e6, copper: 1e6, sulphur: 1e6, tin: 1e6 };
  const f = [{ id: 'm1', type: 'FCT-MUNITIONS', recipeId: muni.id }];
  const none = produceDay({ facilities: f, stock }, catalog);
  assert.equal(none.facilities[0].efficiency, 1);
  assert.deepEqual(none.facilities[0].optional, { tungsten: { need: 0.5, got: 0 } });
  const half = produceDay({ facilities: f, stock: { ...stock, tungsten: 0.25 } }, catalog);
  assert.deepEqual(half.facilities[0].optional, { tungsten: { need: 0.5, got: 0.25 } });
  assert.equal(half.stock.tungsten, 0);
  const noTech = produceDay({ facilities: f, stock: { ...stock, tungsten: 5 } }, { ...catalog, techs: new Set() });
  assert.equal(noTech.stock.tungsten, 5, 'senza la tecnologia il tungsteno non si consuma');
});

test('estrazione 1936: i sei produttori del BGS e 20 miniere costruibili', () => {
  const b = json('resources/extraction_baseline.json').byTerritory;
  for (const t of ['CHN', 'BUR', 'USA', 'BOL', 'KOR', 'PRT']) assert.ok(b[t].tungsten > 0, t);
  assert.ok(b.CHN.tungsten > b.BUR.tungsten);
  assert.equal(json('resources/extraction_scale.json').unitsPerPoint.tungsten, 0.06);
  const sites = json('resources/mine_sites.json').byProvince;
  assert.ok(Object.values(sites).filter((x) => x.tungsten && !x.tungsten.legacy).length >= 15);
});
