// IA passo 2 (23/11/2026): modelli scelti per valore in battaglia per tonnellata × dottrina; una linea che lavora passa al modello migliore dello
// stesso posto solo con almeno +20% (decisioni 2A e 3A dell'utente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { aiRetoolNation, RETOOL_COOLDOWN_DAYS } from '../src/game/retoolSystem.js';
import { valuePerTonne, modelScore, betterModel, productSlots, sameSlot, DOCTRINE_ROLE, UPGRADE_GAIN, classIdsWithModels } from '../src/rules/aiProduction.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquivalence } from '../src/data/equipmentEquivalence.js';
import { buildWeaponOf, buildCategoryOf } from '../src/rules/equipmentFill.js';
import { doctrinesOf } from '../src/data/doctrines.js';
import { EQUIPMENT_GROUP_LABEL } from '../src/rules/unitSheet.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const table = json('units/equipment/equipment_production.json');
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const recipes = new Map(buildEquipmentRecipes(catalog, table).map((r) => [r.id, r]));
const cfg = json('units/battle_v2.json');
const doctrines = json('ai/doctrines.json');
const WEAPON = buildWeaponOf(catalog);
const score = (nation, r) => modelScore(WEAPON(nation, `equipment.${r.equipmentId}`), r.massTonnes, cfg, doctrinesOf(doctrines, nation));
const vpt = (id) => valuePerTonne(WEAPON(id.split('-')[1], `equipment.${id}`), recipes.get(`REC-${id}`).massTonnes, cfg);
const classIds = classIdsWithModels(catalog, cfg);
const SOURCES = buildEquivalence({ catalog, upgradeMap: json('units/equipment/upgrade_map.json'), generic: { TANK: 'tanks' }, categoryOf: buildCategoryOf(catalog) });

test('valore per tonnellata: la corazza conta (Pz III oltre il doppio del Pz II per tonnellata)', () => {
  assert.ok(Math.abs(vpt('TNK-DEU-PZ-II') - 1.97) < 0.01);
  assert.ok(Math.abs(vpt('TNK-DEU-PZ-III') - 4.14) < 0.01);
  assert.ok(vpt('TNK-DEU-PZ-III') / vpt('TNK-DEU-PZ-II') > 2);
  assert.ok(vpt('TNK-DEU-PZ-IV-G') > vpt('TNK-DEU-PZ-V'), 'il Panther vale di più ma pesa il doppio');
  assert.equal(valuePerTonne(null, 10, cfg), null);
  assert.equal(valuePerTonne({ category: 'TANK', id: 'X' }, 0, cfg), null);
});

test('la dottrina moltiplica il punteggio del suo gruppo: Germania +15% sui carri', () => {
  const r = recipes.get('REC-TNK-DEU-PZ-III');
  assert.ok(Math.abs(score('DEU', r) / vpt('TNK-DEU-PZ-III') - 1.15) < 1e-9);
  for (const g of Object.values(DOCTRINE_ROLE)) assert.ok(g in EQUIPMENT_GROUP_LABEL, g);
});

test('betterModel: solo con almeno +20%, il migliore tra i candidati', () => {
  const s = { a: 10, b: 11.9, c: 12, d: 15, n: null };
  const of = (x) => s[x];
  assert.equal(UPGRADE_GAIN, 1.2);
  assert.equal(betterModel('a', ['b'], of), null, '+19%: resta');
  assert.equal(betterModel('a', ['b', 'c'], of), 'c', '+20%: passa');
  assert.equal(betterModel('a', ['c', 'd', 'n'], of), 'd');
  assert.equal(betterModel('n', ['d'], of), null, 'modello attuale non valutabile: niente cambio');
});

test('posti delle divisioni: due prodotti sono intercambiabili se riempiono la stessa voce', () => {
  const divs = [{ items: { 'equipment.T': { planned: 10, effective: 2 }, 'equipment.R': { planned: 5, effective: 5 }, 'manpower.war': { planned: 9 } } }];
  const slots = productSlots(divs, (k) => (k === 'equipment.T' ? ['equipment.A', 'equipment.B'] : [k]));
  assert.ok(sameSlot(slots, 'equipment.A', 'equipment.B'));
  assert.ok(!sameSlot(slots, 'equipment.A', 'equipment.R'));
  assert.ok(!sameSlot(slots, 'equipment.A', 'equipment.Z'));
});

// simulazione mensile della linea dei carri di una nazione, con le tecnologie alle date storiche
function simulate(nation, startRecipe, slotItems, until) {
  const hist = json('research/historical_tech_dates.json').byNation[nation];
  const initial = json('research/technologies.json').initialResearch[nation] ?? [];
  const slots = new Map();
  for (const item of [slotItems].flat()) for (const s of SOURCES(nation, item)) { if (!slots.has(s)) slots.set(s, new Set()); slots.get(s).add(item); }
  const sources = [...slots.keys()];
  let f = { id: 'T', type: recipes.get(startRecipe).factory, recipeId: startRecipe, territory: nation, damage: 0, priority: 1, active: true };
  const log = [];
  for (let y = 1936; y <= until; y++) for (let m = 1; m <= 12; m++) {
    const date = `${y}-${String(m).padStart(2, '0')}-01`;
    const researched = new Set([...initial, ...Object.entries(hist).filter(([, d]) => d <= date).map(([t]) => t)]);
    const need = new Map(sources.map((s) => [s, 5000]));
    const out = aiRetoolNation({ stocks: {}, facilities: [f] }, nation, { recipes, factories: null, table, researched, date, need, classIds, scoreOf: (r) => score(nation, r), slots });
    if (out.changes.length) { f = out.facilities[0]; log.push(`${date.slice(0, 7)} ${out.changes[0].to.replace('REC-', '')} (${out.changes[0].reason})`); }
  }
  return log;
}

test('Germania: dal Pz II passa al Pz III appena c\'è, poi al Pz IV G; mai a una voce di classe', () => {
  const log = simulate('DEU', 'REC-TNK-DEU-PZ-II', 'equipment.TNK-DEU-TANK', 1944);
  assert.ok(log.length >= 2, log.join(' | '));
  assert.match(log[0], /^1937-0[1-4] TNK-DEU-PZ-III \(migliore\)/, log.join(' | '));
  assert.ok(log.some((l) => /TNK-DEU-PZ-IV-G/.test(l)), log.join(' | '));
  assert.ok(log.every((l) => !/TNK-DEU-TANK /.test(l)));
  for (let i = 1; i < log.length; i++) { // mai due riconversioni a meno di 90 giorni (pausa della riconversione)
    const d = (s) => Date.parse(`${s.slice(0, 7)}-01`);
    assert.ok((d(log[i]) - d(log[i - 1])) / 86400000 >= RETOOL_COOLDOWN_DAYS - 3, log.join(' | '));
  }
});

test('URSS e USA: con i posti dei carri leggeri e medi, la linea arriva ai carri medi', () => {
  const su = simulate('USSR', 'REC-TNK-USSR-T26-1940', ['equipment.TNK-USSR-T26-1940', 'equipment.TNK-USSR-T34-1940'], 1944);
  assert.ok(su.some((l) => /T34/.test(l)), su.join(' | '));
  const us = simulate('USA', 'REC-TNK-USA-M2A4', ['equipment.TNK-USA-LIGHT-TANK-1940', 'equipment.TNK-USA-MEDIUM-TANK-1940'], 1944);
  assert.ok(us.some((l) => /M4/.test(l)), us.join(' | '));
});

test('voci di classe: escluse quelle senza peso proprio, non i T-26/T-34/KV sovietici (modelli veri)', () => {
  assert.ok(classIds.has('TNK-DEU-TANK') && classIds.has('TNK-USA-MEDIUM-TANK-1940'));
  for (const id of ['TNK-USSR-T34-1940', 'TNK-USSR-KV-1940', 'TNK-USSR-T26-1940']) assert.ok(!classIds.has(id), id);
});

test('stampa delle simulazioni (per il rapporto)', () => {
  console.log('DEU', simulate('DEU', 'REC-TNK-DEU-PZ-II', 'equipment.TNK-DEU-TANK', 1944).join(' | '));
  console.log('USSR', simulate('USSR', 'REC-TNK-USSR-T26-1940', ['equipment.TNK-USSR-T26-1940', 'equipment.TNK-USSR-T34-1940'], 1944).join(' | '));
  console.log('USA', simulate('USA', 'REC-TNK-USA-M2A4', ['equipment.TNK-USA-LIGHT-TANK-1940', 'equipment.TNK-USA-MEDIUM-TANK-1940'], 1944).join(' | '));
});
