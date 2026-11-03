// Produzione degli equipaggiamenti e rinforzi (Fasi 4-5, 03/11/2026): ricette generate dal catalogo, catena fabbrica → scorta → rinforzi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalogFrom } from '../src/data/industry.js';
import { validateRecipes } from '../src/data/recipes.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { validateEquipmentProduction, buildEquipmentRecipes, withEquipmentRecipes, groupUnlocked, recipesAvailable, isProducible } from '../src/data/equipmentProduction.js';
import { produceDay, checkBalance } from '../src/rules/production.js';
import { planReinforcements, dispatch, applyArrivals } from '../src/rules/reinforcements.js';
import { transitDaysFromRoute, makeTransitDays, seaDaysOf } from '../src/rules/reinforcementTransit.js';
import { buildDivisionSet, buildNationCatalog, csvRows } from '../src/data/templateBuilder.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const industry = loadIndustryCatalogFrom(text);
const edir = new URL('../data/units/equipment/', import.meta.url);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const table = json('units/equipment/equipment_production.json');
const recipesDoc = json('industry/recipes.json');
const generated = buildEquipmentRecipes(catalog, table);
const equipmentIds = new Set(catalog.entries.map((e) => e.equipment_id));
const ctx = () => ({ factoriesById: industry.byId, resources: json('resources.json'), equipmentIds });

test('tabella e ricette generate sono valide; il generatore non tocca le ricette scritte a mano', () => {
  assert.deepEqual(validateEquipmentProduction(table, { factoriesById: industry.byId, catalog }), []);
  assert.deepEqual(validateRecipes(withEquipmentRecipes(recipesDoc, generated), ctx()), []);
  assert.ok(recipesDoc.recipes.some((r) => r.id === 'REC-ARTILLERY-001'), 'il prodotto legacy artillery resta');
  assert.equal(new Set(generated.map((r) => r.id)).size, generated.length);
});

test('una ricetta per ogni equipaggiamento producibile, di ogni nazione, con la stessa procedura', () => {
  const producible = catalog.entries.filter((e) => isProducible(e, table));
  assert.equal(generated.length, producible.length);
  for (const n of ['DEU', 'GBR', 'FRA']) assert.ok(generated.some((r) => r.equipmentId.split('-')[1] === n), n);
  const ids = generated.map((r) => r.equipmentId);
  assert.ok(!ids.includes('ART-FRA-AT47M1937'), 'variante datata: nessuna produzione');
  assert.ok(!catalog.entries.some((e) => ['TANK', 'ANTI_AIRCRAFT_GUN'].includes(e.category) && ids.includes(e.equipment_id)), 'categorie fuori tabella: MISSING_DATA, non producibili');
  const how = generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C');
  assert.deepEqual([how.factory, how.massTonnes, how.output.product], ['FCT-ARTILLERY', 2.5, 'equipment.ART-FRA-HOW155C']);
  assert.deepEqual(how.inputs, [{ resource: 'steel', perUnit: 3 }, { resource: 'components', perUnit: 0.25 }]);
});

test('errori espliciti: prodotto fuori catalogo, categoria o gruppo sconosciuti, override orfano', () => {
  const bad = structuredClone(withEquipmentRecipes(recipesDoc, generated));
  bad.recipes.at(-1).output.product = 'equipment.ART-XXX-NONE';
  assert.ok(validateRecipes(bad, ctx()).some((e) => /non è nel catalogo equipaggiamenti/.test(e)));
  const t = structuredClone(table);
  t.categories.ARMA = { factory: 'FCT-ARTILLERY', massTonnes: 1, group: 'light_arms' };
  t.categories.MORTAR.group = 'inesistente'; t.overrides['ART-XXX-NONE'] = { massTonnes: 1 };
  const errs = validateEquipmentProduction(t, { factoriesById: industry.byId, catalog });
  for (const re of [/categoria sconosciuta ARMA/, /gruppo sconosciuto inesistente/, /override per ART-XXX-NONE/]) assert.ok(errs.some((e) => re.test(e)), String(re));
});

test('scalabile: una nazione nuova nel catalogo ha subito le sue ricette, nessun codice per nazione; un peso storico si inserisce come override', () => {
  const T = 'template_id,nation,category,echelon,series,division_name,reference_date,formation,infantry_regiments,manpower_initial_estimate,manpower_organic_max,horses_organic,status,source_quality,note\n';
  const C = 'equipment_id,nation,designation,family,class,caliber_mm,role,quantity_planned,quantity_effective,quantity_basis,reference_date,confidence,source_note\n';
  const L = 'template_id,subunit_id,equipment_id,quantity,quantity_status,basis,effective_quantity,mechanics_profile_id,source_note\n';
  const set = buildDivisionSet({
    template: csvRows(`${T}TPL-ITA-INF-9DI-1940,ITA,infantry,division,B,9a,1940-06,t,3,10000,12000,3000,S,Q,n\n`, 't'),
    lines: csvRows(`${L}TPL-ITA-INF-9DI-1940,RGT,ITA-MORT45,30,STANDARD_TOE,x,,,n\n`, 'l'),
    catalog: csvRows(`${C}ITA-MORT45,ITA,Mortaio di prova,f,light_mortar,45,close,30,,x,1940-06,STANDARD_TOE,n\n`, 'c'),
  });
  const merged = mergeEquipmentCatalogs([catalog, buildNationCatalog('ITA', [set], [])]);
  const t = structuredClone(table); t.overrides['ART-ITA-MORT45'] = { massTonnes: 0.04 };
  const gen = buildEquipmentRecipes(merged, t);
  const r = gen.find((x) => x.equipmentId === 'ART-ITA-MORT45');
  assert.deepEqual([r.factory, r.massTonnes, r.inputs[0].perUnit], ['FCT-ARTILLERY', 0.04, 0.048]);
  assert.deepEqual(validateRecipes(withEquipmentRecipes(recipesDoc, gen), { ...ctx(), equipmentIds: new Set(merged.entries.map((e) => e.equipment_id)) }), []);
});

test('tecnologie di partenza: i gruppi di base li conoscono tutte le nazioni; un gruppo con requires serve la ricerca', () => {
  const researched = new Set();
  assert.ok(['light_arms', 'mortars', 'basic_artillery'].every((g) => groupUnlocked(table, g, researched)));
  const t = structuredClone(table); t.groups.heavy = { name_it: 'x', requires: 'TECH-X' };
  assert.equal(groupUnlocked(t, 'heavy', researched), false);
  assert.equal(groupUnlocked(t, 'heavy', new Set(['TECH-X'])), true);
  assert.equal(groupUnlocked(t, 'sconosciuto'), false);
  const fra = recipesAvailable(generated, table, 'FRA');
  assert.ok(fra.length > 0 && fra.every((r) => r.equipmentId.includes('-FRA-')));
});

test('giorni di trasferimento: via terra km/velocità; la traversata si aggiunge solo se si attraversa il mare', () => {
  assert.equal(transitDaysFromRoute({ landKm: 250 }), 3);
  assert.equal(transitDaysFromRoute({ landKm: 250, seaDays: 0 }), 3);
  assert.equal(transitDaysFromRoute({ landKm: 250, seaDays: 4 }), 7);
  assert.equal(seaDaysOf({ ok: true, days: 5 }), 5);
  assert.throws(() => seaDaysOf({ ok: false, reason: 'nessuna rotta' }), /non disponibile/);
  assert.throws(() => transitDaysFromRoute({ landKm: -1 }), RangeError);
  assert.throws(() => transitDaysFromRoute({ landKm: 10, seaDays: 1.5 }), RangeError);
  assert.throws(() => makeTransitDays(() => { throw new Error('nessun percorso'); })('X'), /nessun percorso/);
});

test('catena completa: fabbrica → scorta equipment.<id> → rinforzi → arrivo (terra e mare)', () => {
  const rec = generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C');
  const cat = { recipes: new Map([rec].map((r) => [r.id, r])), factories: industry.byId, levels: json('industry/factory_levels.json') };
  const day = produceDay({ facilities: [{ id: 'F1', type: 'FCT-ARTILLERY', recipeId: rec.id }], stock: { steel: 1000, components: 100 }, hydroMw: 100 }, cat);
  assert.deepEqual(checkBalance(day.balance), []);
  const made = day.stock['equipment.ART-FRA-HOW155C'];
  assert.ok(made > 0, 'la fabbrica produce pezzi');
  assert.equal(made, 28, '70 t/giorno / 2,5 t per pezzo');
  const units = [{ id: 'FRA-1', nation: 'FRA' }, { id: 'FRA-2', nation: 'FRA' }];
  const item = 'equipment.ART-FRA-HOW155C';
  let forces = { divisions: { 'FRA-1': { items: { [item]: { planned: 24, effective: 4 } } }, 'FRA-2': { items: { [item]: { planned: 24, effective: 0 } } } } };
  const route = { 'FRA-1': { landKm: 250 }, 'FRA-2': { landKm: 250, seaDays: 4 } };
  const plan = planReinforcements(forces, { units, nation: 'FRA', date: '1939-09-10', poolAvailable: 0, stocks: { [item]: Math.floor(made) }, transitDays: makeTransitDays((id) => route[id]) });
  const by = Object.fromEntries(plan.transfers.map((t) => [t.divisionId, t]));
  assert.deepEqual([by['FRA-2'].qty, by['FRA-1'].qty], [24, 4], 'la più scoperta prima; il resto delle 28 non basta per tutti i 20+24');
  assert.deepEqual([by['FRA-1'].arrivesOn, by['FRA-2'].arrivesOn], ['1939-09-13', '1939-09-17']);
  assert.equal(plan.remaining.stocks[item], 0);
  forces = dispatch(forces, plan.transfers);
  const a = applyArrivals(forces, '1939-09-13');
  assert.equal(a.forces.divisions['FRA-1'].items[item].effective, 8);
  assert.equal(a.forces.divisions['FRA-2'].items[item].effective, 0, 'via mare arriva dopo');
  const b = applyArrivals(a.forces, '1939-09-17');
  assert.equal(b.forces.divisions['FRA-2'].items[item].effective, 24);
  assert.equal(b.forces.transfers.length, 0);
});
