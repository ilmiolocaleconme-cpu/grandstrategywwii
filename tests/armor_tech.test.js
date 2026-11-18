// Ramo Corazzati (18/11/2026, decisioni dell'utente: ricerca + data minima, versioni separate, prima la Germania). Dati reali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateTechnologies, consumersOf, techBattleBonus, battleBonusOf, techIndex } from '../src/data/technologies.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, recipeUnlocked, recipeLockReasons, recipeLockReason, validateEquipmentProduction } from '../src/data/equipmentProduction.js';
import { facilityRecipeRows } from '../src/ui/recipeView.js';
import { setFacilityRecipe } from '../src/game/facilityRecipe.js';
import { weaponWeight } from '../src/rules/battleV2.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const techs = json('research/technologies.json');
const table = json('units/equipment/equipment_production.json');
const edir = new URL('../data/units/equipment/', import.meta.url);
const eqCatalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const recipes = buildEquipmentRecipes(eqCatalog, table);
const rec = (eq) => recipes.find((r) => r.equipmentId === eq);
const armor = techs.technologies.filter((t) => t.branch === 'armor');
const cfg = json('units/battle_v2.json');
const ids = (...xs) => new Set(xs);

test('ramo Corazzati: 10 tecnologie valide, senza cicli, ognuna con un uso reale', () => {
  assert.equal(armor.length, 10);
  assert.ok(techs.branches.some((b) => b.id === 'armor'));
  assert.deepEqual(validateTechnologies(techs), [], 'albero valido (l’uso di tutte le tecnologie lo controlla tests/research.test.js)');
  const used = consumersOf({ equipment: table, technologies: techs });
  for (const t of armor) assert.ok(used.has(t.id), `${t.id} senza uso`);
  assert.ok(validateTechnologies({ ...techs, technologies: [...techs.technologies, { ...armor[0], id: 'TECH-X', unlocks: [{ kind: 'battle_bonus', categories: [], value: 0.1 }] }] }).some((e) => /TECH-X/.test(e)));
  assert.ok(validateEquipmentProduction({ ...table, overrides: { ...table.overrides, 'TNK-DEU-PZ-V': { ...table.overrides['TNK-DEU-PZ-V'], requiresTech: 'TECH-NONE' } } }, { techIds: new Set(techs.technologies.map((t) => t.id)) }).some((e) => /TECH-NONE/.test(e)));
});

test('ogni carro tedesco oltre il Pz I e II richiede la sua tecnologia; Pz I, Pz II, 35(t) no', () => {
  const need = { 'TNK-DEU-PZ-III': 'TECH-ARM-GUN-3750', 'TNK-DEU-PZ-38T': 'TECH-ARM-GUN-3750', 'TNK-DEU-PZ-IV': 'TECH-ARM-GUN-75S', 'TNK-DEU-PZ-III-J': 'TECH-ARM-GUN-50L', 'TNK-DEU-PZ-IV-G': 'TECH-ARM-GUN-75L', 'TNK-DEU-PZ-V': 'TECH-ARM-SLOPED', 'TNK-DEU-PZ-VI': 'TECH-ARM-HEAVY', 'TNK-DEU-PZ-VIB': 'TECH-ARM-GUN-88L' };
  for (const [eq, t] of Object.entries(need)) assert.equal(rec(eq).requiresTech, t, eq);
  for (const eq of ['TNK-DEU-PZ-I', 'TNK-DEU-PZ-II', 'TNK-DEU-PZ-35T', 'TNK-DEU-TANK']) assert.equal(rec(eq).requiresTech, undefined, eq);
});

test('ricerca + data minima: il Panther serve la corazza inclinata E il 1943', () => {
  const p = rec('TNK-DEU-PZ-V');
  assert.equal(recipeUnlocked(table, p, ids(), '1943-06-01'), false, 'senza ricerca nemmeno nel 1943');
  assert.equal(recipeUnlocked(table, p, ids('TECH-ARM-SLOPED'), '1940-01-01'), false, 'con la ricerca non prima della data storica');
  assert.equal(recipeUnlocked(table, p, ids('TECH-ARM-SLOPED'), '1943-01-01'), true);
  assert.deepEqual(recipeLockReasons(p, { date: '1940-01-01', researched: ids() }).map((r) => r.kind), ['tech', 'from'], 'entrambi i motivi');
  assert.equal(recipeLockReason(p, '1940-01-01', null, null).kind, 'from', 'senza elenco delle ricerche la tecnologia non si controlla');
  assert.equal(recipeLockReasons(rec('TNK-DEU-PZ-IV'), { date: '1936-06-01', researched: ids('TECH-ARM-GUN-75S') })[0].text, 'dal 01/10/1937', 'il Pz IV non è più disponibile nel 1936');
});

test('pannello: il motivo mostra il nome della tecnologia e la data; la scelta senza ricerca è rifiutata', () => {
  const name = techIndex(techs);
  const catalog = { recipes: new Map(recipes.map((r) => [r.id, r])), factories: new Map([['FCT-TANKS', { id: 'FCT-TANKS', name_it: 'Fabbrica carri armati' }]]) };
  const state = { date: '1940-01-01', nations: { DEU: { facilities: [{ id: 'T1', type: 'FCT-TANKS', recipeId: 'REC-TNK-DEU-PZ-I', count: 1 }] } } };
  const rows = facilityRecipeRows(state, 'DEU', { catalog, table, researched: ids('TECH-ARM-GUN-3750'), techName: (id) => name.get(id)?.name_it ?? id, placeName: () => 'Boemia', controllerOf: () => 'DEU' });
  const locked = Object.fromEntries(rows[0].locked.map((l) => [l.recipeId, l.requires]));
  assert.equal(locked['REC-TNK-DEU-PZ-V'], 'richiede Corazza inclinata · dal 01/01/1943');
  assert.equal(locked['REC-TNK-DEU-PZ-IV'], 'richiede Cannone corto da 75 mm per carri');
  assert.equal(locked['REC-TNK-DEU-PZ-III'], undefined, 'il Pz III con la ricerca e dopo il 1937 si sceglie');
  assert.throws(() => setFacilityRecipe(state, 'DEU', 'T1', 'REC-TNK-DEU-PZ-IV', { catalog, table, researched: ids() }), /richiede la tecnologia TECH-ARM-GUN-75S/);
});

test('versioni separate: Pz III e Pz IV col cannone lungo sono voci nuove, più forti contro i carri, che riforniscono la voce «carri»', () => {
  const W = buildWeaponOf(eqCatalog);
  const w = (id) => weaponWeight(W('DEU', `equipment.${id}`), cfg);
  assert.ok(w('TNK-DEU-PZ-IV-G').hard > w('TNK-DEU-PZ-IV').hard * 2.5, 'il 75 lungo quasi triplica il fuoco anticarro');
  assert.ok(w('TNK-DEU-PZ-III-J').hard > w('TNK-DEU-PZ-III').hard);
  for (const id of ['TNK-DEU-PZ-III-J', 'TNK-DEU-PZ-IV-G']) assert.equal(eqCatalog.entries.find((e) => e.equipment_id === id).sameAs, 'TNK-DEU-TANK');
  assert.equal(rec('TNK-DEU-PZ-IV').availableTo, undefined, 'la versione corta resta producibile: si sostituisce per scelta');
});

test('bonus in battaglia: radio, ottiche e infrarossi solo per le divisioni corazzate', () => {
  const all = ids('TECH-ARM-RADIO', 'TECH-ARM-OPTICS', 'TECH-ARM-IR');
  assert.equal(techBattleBonus(techs, 'armored', all), 0.1);
  assert.equal(techBattleBonus(techs, 'infantry', all), 0);
  assert.equal(techBattleBonus(techs, 'armored', ids('TECH-ARM-RADIO')), 0.05);
  assert.equal(techBattleBonus(techs, 'armored', ids()), 0);
  assert.deepEqual(battleBonusOf(techIndex(techs).get('TECH-ARM-OPTICS')), { value: 0.03, categories: ['armored'] });
  assert.equal(battleBonusOf(techIndex(techs).get('TECH-ARM-SLOPED')), null);
});

test('ricerca iniziale 1936: cannoni da carro alle potenze che li avevano; nessun Panther in partenza', () => {
  assert.ok(techs.initialResearch.DEU.includes('TECH-ARM-GUN-3750'));
  assert.ok(techs.initialResearch.FRA.includes('TECH-ARM-GUN-75S') && techs.initialResearch.USSR.includes('TECH-ARM-GUN-75S'));
  for (const list of Object.values(techs.initialResearch)) for (const t of ['TECH-ARM-SLOPED', 'TECH-ARM-HEAVY', 'TECH-ARM-GUN-75L']) assert.ok(!list.includes(t));
});
