// Carri USA per modello (21/11/2026, passo 4, scelte dell'utente A): modelli sameAs delle due voci di classe, pesi per modello, composizione
// per anno dei pezzi iniziali, cacciacarri e M7 Priest, fabbrica dei carri M2A2 → M2A4.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeEquipmentCatalogs, buildPredecessors } from '../src/data/equipmentCatalog.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';
import { weaponWeight, tankParts } from '../src/rules/battleV2.js';
import { validateModules } from '../src/data/modules.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const CATALOG = mergeEquipmentCatalogs(fs.readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((f) => /^catalog.*\.json$/.test(f)).sort().map((f) => read(`units/equipment/${f}`)));
const W = buildWeaponOf(CATALOG);
const B = read('units/battle_v2.json');
const PROD = read('units/equipment/equipment_production.json').overrides;
const w = (id) => weaponWeight(W('USA', `equipment.${id}`), B);

test('ogni carro USA è un modello della propria voce di classe, con data e ricerca', () => {
  const byId = new Map(CATALOG.entries.map((e) => [e.equipment_id, e]));
  for (const id of ['TNK-USA-M2A2', 'TNK-USA-M2A4', 'TNK-USA-M3-STUART', 'TNK-USA-M5-STUART', 'TNK-USA-M24']) assert.equal(byId.get(id).sameAs, 'TNK-USA-LIGHT-TANK-1940', id);
  for (const id of ['TNK-USA-M2-MEDIUM', 'TNK-USA-M3-LEE', 'TNK-USA-M4-75', 'TNK-USA-M4-76', 'TNK-USA-M26']) assert.equal(byId.get(id).sameAs, 'TNK-USA-MEDIUM-TANK-1940', id);
  assert.equal(PROD['TNK-USA-M4-75'].requiresTech, 'TECH-ARM-GUN-75S');
  assert.equal(PROD['TNK-USA-M4-76'].requiresTech, 'TECH-ARM-GUN-75L');
  assert.equal(PROD['TNK-USA-M26'].requiresTech, 'TECH-ARM-HEAVY');
});

test('pesi: lo Sherman da 75 vale più del Lee contro i corazzati, quello da 76 ancora di più; il Pershing è il più forte', () => {
  assert.ok(w('TNK-USA-M4-75').hard > w('TNK-USA-M3-LEE').hard);
  assert.ok(w('TNK-USA-M4-76').hard > w('TNK-USA-M4-75').hard);
  assert.ok(w('TNK-USA-M26').hard > w('TNK-USA-M4-76').hard);
  assert.ok(w('TNK-USA-M2A2').hard < w('TNK-USA-M2A4').hard, 'M2A2 solo mitragliatrici');
  assert.ok(w('TD-USA-M36').hard > w('TD-USA-M10').hard);
});

test('pezzi iniziali delle voci di classe: composizione per anno (M2A2 nel 1936, Sherman nel 1944)', () => {
  const lt = W('USA', 'equipment.TNK-USA-LIGHT-TANK-1940');
  const mt = W('USA', 'equipment.TNK-USA-MEDIUM-TANK-1940');
  const resolve = (id) => W('USA', `equipment.${id}`);
  assert.deepEqual(tankParts({ planned: 10, effective: 10 }, lt, 10, 1936, B, resolve).map((p) => [p.weapon.id, p.n]), [['TNK-USA-M2A2', 10]]);
  const parts = tankParts({ planned: 100, effective: 100 }, mt, 100, 1944, B, resolve);
  assert.deepEqual(parts.map((p) => [p.weapon.id, Math.round(p.n)]), [['TNK-USA-M4-75', 85], ['TNK-USA-M4-76', 15]]);
});

test('cacciacarri e M7: catene, battaglioni dell\'editor validi e versione 1942 dell\'artiglieria corazzata', () => {
  const pred = buildPredecessors(CATALOG, read('units/equipment/replacements.json'));
  assert.deepEqual(pred('USA', 'equipment.TD-USA-M36'), ['equipment.TD-USA-M10']);
  assert.deepEqual(pred('USA', 'equipment.ART-USA-M7-PRIEST'), ['equipment.ART-USA-HOW105-ARM-1940']);
  const doc = read('units/modules/modules_usa.json');
  assert.deepEqual(validateModules(doc), []);
  assert.equal(doc.modules.find((m) => m.id === 'MOD-USA-FA-ARM-1942').supersedes, 'MOD-USA-FA-ARM');
  for (const id of ['MOD-USA-TD-M10', 'MOD-USA-TD-M18', 'MOD-USA-TD-M36']) assert.ok(!doc.compositions.some((c) => c.modules.some(([m]) => m === id)), `${id} solo nell'editor`);
});

test('fabbrica dei carri USA: M2A2, poi M2A4 dal 5/1939', () => {
  const f = read('industry/initial_industry.json').nations.USA.facilities.find((x) => x.factory === 'FCT-TANKS');
  assert.equal(f.recipeId, 'REC-TNK-USA-M2A2');
  assert.deepEqual(f.plannedRecipe, { recipeId: 'REC-TNK-USA-M2A4', from: '1939-05-01' });
});
