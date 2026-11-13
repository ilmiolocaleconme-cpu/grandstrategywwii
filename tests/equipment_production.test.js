// Produzione degli equipaggiamenti e rinforzi (Fasi 4-5, 03/11/2026): ricette generate dal catalogo, catena fabbrica → scorta → rinforzi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalogFrom } from '../src/data/industry.js';
import { validateRecipes, fullCapacityFlows } from '../src/data/recipes.js';
import { dailyIncome } from '../src/rules/treasury.js';
import { createTradeState, tradableGoods, openContract } from '../src/rules/trade.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { validateEquipmentProduction, buildEquipmentRecipes, withEquipmentRecipes, equipmentPrices, withEquipmentPrices, groupUnlocked, recipesAvailable, isProducible } from '../src/data/equipmentProduction.js';
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
  assert.ok(!catalog.entries.some((e) => e.category === 'ANTI_AIRCRAFT_GUN' && ids.includes(e.equipment_id)), 'categorie fuori tabella: MISSING_DATA, non producibili');
  // carri (12/11/2026): prodotti nella fabbrica carri con i motori, peso per modello
  const b1 = generated.find((r) => r.equipmentId === 'TNK-FRA-B1BIS-1940');
  assert.deepEqual([b1.factory, b1.massTonnes, b1.output.product], ['FCT-TANKS', 31.5, 'equipment.TNK-FRA-B1BIS-1940']);
  assert.deepEqual(b1.inputs, [{ resource: 'steel', perUnit: 37.8 }, { resource: 'components', perUnit: 3.15 }, { resource: 'engines', perUnit: 2.52 }]);
  for (const n of ['DEU', 'FRA', 'GBR', 'ITA', 'USA', 'JPN', 'USSR']) assert.ok(generated.some((r) => r.factory === 'FCT-TANKS' && r.equipmentId.split('-')[1] === n), `carri di ${n}`);
  const how = generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C');
  assert.deepEqual([how.factory, how.massTonnes, how.output.product], ['FCT-ARTILLERY', 3.3, 'equipment.ART-FRA-HOW155C']);
  assert.deepEqual(how.inputs, [{ resource: 'steel', perUnit: 3.96 }, { resource: 'components', perUnit: 0.33 }]);
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

// simula giorni di produzione di UN impianto (stato dell'impianto portato avanti come fa il ciclo economico)
const run = (rec, days, from = '1939-09-01', stock0 = { steel: 1e6, components: 1e5 }) => {
  const cat = { recipes: new Map([[rec.id, rec]]), factories: industry.byId, levels: json('industry/factory_levels.json') };
  let f = { id: 'F1', type: rec.factory, recipeId: rec.id }; let stock = stock0; const delivered = [];
  for (let d = 0; d < days; d += 1) {
    const date = new Date(Date.parse(from) + d * 86400000).toISOString().slice(0, 10);
    const r = produceDay({ facilities: [f], stock, hydroMw: 1000, date }, cat);
    assert.deepEqual(checkBalance(r.balance), []);
    f = { ...f, ...r.facilities[0].progress }; stock = r.stock; delivered.push(r.facilities[0].produced[rec.output.product]);
  }
  return { f, stock, delivered };
};

test('lotti: armi leggere costruzione 14 giorni, consegna settimanale — nulla nei primi 13 giorni, poi un lotto a settimana, solo pezzi interi', () => {
  const rec = generated.find((r) => r.equipmentId === 'INW-FRA-RIFLE-1939');
  assert.deepEqual([rec.buildDays, rec.releaseEveryDays], [14, 7]);
  const { delivered, f } = run(rec, 22);
  assert.deepEqual(delivered.slice(0, 13), new Array(13).fill(0), 'i primi pezzi arrivano dopo 14 giorni');
  assert.equal(delivered[13], 7 * 800, 'giorno 14: primo lotto chiuso al giorno 7 (7 giorni di lavoro)');
  assert.deepEqual(delivered.slice(14, 20), new Array(6).fill(0));
  assert.equal(delivered[20], 7 * 800, 'poi un lotto a settimana');
  assert.ok(delivered.every(Number.isInteger));
  assert.equal(f.batches.length, 1, 'un lotto chiuso e in costruzione');
  assert.equal(delivered.reduce((a, b) => a + b, 0) + f.batches.reduce((t, b) => t + b.qty, 0) + f.wip, 22 * 800, 'nessun pezzo perso né creato');
});

test('lotti: il volume non cambia (solo ritardo) e senza data è un errore, non un lotto che sparisce', () => {
  const rec = generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C');
  const { delivered, f } = run(rec, 70);
  const total = delivered.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total + f.batches.reduce((t, b) => t + b.qty, 0) + f.wip - 70 * 1.485) < 0.01, '1,485 pezzi/giorno (obice da 3,3 t) anche con i lotti: consegnato + in lavorazione = lavoro svolto');
  assert.equal(delivered.findIndex((x) => x > 0), 55, 'obice: primo lotto chiuso al giorno 14, consegnato dopo altri 42 giorni');
  const cat = { recipes: new Map([[rec.id, rec]]), factories: industry.byId, levels: json('industry/factory_levels.json') };
  assert.throws(() => produceDay({ facilities: [{ id: 'F1', type: rec.factory, recipeId: rec.id }], stock: { steel: 100, components: 100 }, hydroMw: 100 }, cat), /manca la data/);
  const legacy = recipesDoc.recipes.find((r) => r.id === 'REC-ARTILLERY-001');
  const out = produceDay({ facilities: [{ id: 'A', type: legacy.factory, recipeId: legacy.id }], stock: { steel: 1000, components: 100 }, hydroMw: 100 }, { recipes: new Map([[legacy.id, legacy]]), factories: industry.byId, levels: json('industry/factory_levels.json') });
  assert.ok(out.facilities[0].produced.artillery > 0 && !out.facilities[0].progress, 'le ricette senza lotti restano immediate (compatibilità)');
});

test('catena completa: fabbrica a lotti → scorta equipment.<id> → rinforzi → arrivo (terra e mare)', () => {
  const rec = generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C');
  const { stock, delivered } = run(rec, 60);
  const item = 'equipment.ART-FRA-HOW155C';
  const made = stock[item];
  assert.equal(made, 20, 'primo lotto: 14 giorni × 1,485 obici = 20,79 → 20 pezzi interi');
  assert.equal(delivered.filter((x) => x > 0).length, 1);
  const units = [{ id: 'FRA-1', nation: 'FRA' }, { id: 'FRA-2', nation: 'FRA' }];
  let forces = { divisions: { 'FRA-1': { items: { [item]: { planned: 24, effective: 4 } } }, 'FRA-2': { items: { [item]: { planned: 17, effective: 0 } } } } };
  const route = { 'FRA-1': { landKm: 250 }, 'FRA-2': { landKm: 250, seaDays: 4 } };
  const plan = planReinforcements(forces, { units, nation: 'FRA', date: '1939-09-10', poolAvailable: 0, stocks: { [item]: made }, transitDays: makeTransitDays((id) => route[id]) });
  const by = Object.fromEntries(plan.transfers.map((t) => [t.divisionId, t]));
  assert.deepEqual([by['FRA-2'].qty, by['FRA-1'].qty], [17, 3], 'la più scoperta prima; i 20 pezzi non bastano per tutti');
  assert.deepEqual([by['FRA-1'].arrivesOn, by['FRA-2'].arrivesOn], ['1939-09-13', '1939-09-17']);
  assert.equal(plan.remaining.stocks[item], 0);
  forces = dispatch(forces, plan.transfers);
  const a = applyArrivals(forces, '1939-09-13');
  assert.equal(a.forces.divisions['FRA-1'].items[item].effective, 7);
  assert.equal(a.forces.divisions['FRA-2'].items[item].effective, 0, 'via mare arriva dopo');
  const b = applyArrivals(a.forces, '1939-09-17');
  assert.equal(b.forces.divisions['FRA-2'].items[item].effective, 17);
  assert.equal(b.forces.transfers.length, 0);
});

test('capacityShare: i fucili usano il 4% della fabbrica — 4,8 t di acciaio e 800 pezzi al giorno; ogni categoria ha la sua quota (armi leggere e artiglieria <= 7%)', () => {
  const rifle = generated.find((r) => r.equipmentId === 'INW-FRA-RIFLE-1939');
  assert.equal(rifle.capacityShare, 0.04);
  assert.equal(generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C').capacityShare, 0.07);
  const f = fullCapacityFlows(rifle, industry.byId.get('FCT-WEAPONS'));
  assert.equal(f.outputPerDay, 800);
  assert.equal(f.inputsPerDay.steel, 4.8);
  assert.equal(fullCapacityFlows(generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C'), industry.byId.get('FCT-ARTILLERY')).inputsPerDay.steel, 5.881, 'obici: 70 t × 7% × 1,2 (5,88; arrotondamento dei pezzi al giorno)');
  const bad = structuredClone(withEquipmentRecipes(recipesDoc, generated)); bad.recipes.find((r) => r.id === rifle.id).capacityShare = 1.5;
  assert.ok(validateRecipes(bad, ctx()).some((e) => /capacityShare non valido/.test(e)));
});

// ---- prezzi (opzione D, 03/11/2026) e vendita ad altre nazioni ----
const economyFile = json('economy/economy.json');
const priced = withEquipmentPrices(economyFile, generated, table.priceFactor);

test('prezzi: 1,25 × costo dei materiali, stessa regola di carri e artiglieria; i prezzi esistenti non cambiano', () => {
  const how = generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C');
  const mat = 3.96 * economyFile.prices.steel + 0.33 * economyFile.prices.components;
  assert.equal(priced.prices['equipment.ART-FRA-HOW155C'], Math.round(mat * 1.25 * 1e6) / 1e6);
  assert.ok(priced.prices['equipment.INW-FRA-RIFLE-1939'] > 0);
  for (const [k, v] of Object.entries(economyFile.prices)) assert.equal(priced.prices[k], v, k);
  assert.ok(generated.every((r) => priced.prices[r.output.product] > 0));
  assert.ok(priced.prices[how.output.product] > mat, 'un pezzo vale più dei suoi materiali');
  assert.throws(() => equipmentPrices([{ ...how, inputs: [{ resource: 'unobtainium', perUnit: 1 }] }], economyFile.prices, 1.25), /senza prezzo/);
  assert.ok(validateEquipmentProduction({ ...table, priceFactor: 0.9 }).some((e) => /priceFactor/.test(e)));
});

test('un obice produce valore aggiunto positivo: l\'entrata giornaliera non cala più producendo armi', () => {
  const how = generated.find((r) => r.equipmentId === 'ART-FRA-HOW155C');
  const f = fullCapacityFlows(how, industry.byId.get('FCT-ARTILLERY'));
  const goods = { [how.output.product]: f.outputPerDay };
  const inputs = Object.fromEntries(Object.entries(f.inputsPerDay));
  const inc = dailyIncome({ goods, inputs }, priced, 'media');
  assert.ok(inc.valueAdded > 0 && Math.abs(inc.goods / inc.inputs - 1.25) < 0.01, `ricavo/costo = ${inc.goods / inc.inputs}`);
  assert.equal(dailyIncome({ goods, inputs }, economyFile, 'media').goods, 0, 'prima: i pezzi non valevano nulla');
});

test('vendita: gli equipaggiamenti sono commerciabili a pezzi interi, consegnati dopo il transito dalla scorta del venditore', () => {
  const good = 'equipment.ART-FRA-HOW155C';
  assert.ok(tradableGoods(priced).includes(good));
  assert.ok(!tradableGoods(economyFile).includes(good));
  const nations = { FRA: { balance: 0, stocks: { [good]: 10 } }, POL: { balance: 5, stocks: {} } };
  const route = { ok: true, kind: 'land', km: 250, via: [] };
  const o = (perDay) => openContract(createTradeState(), { seller: 'FRA', buyer: 'POL', good, perDay, days: 3 }, { economy: priced, resources: json('resources.json'), nations, route, day: 0, date: '1939-09-01' });
  assert.deepEqual([o(1.5).ok, o(1.5).reason], [false, 'invalid_quantity']);
  const c = o(2);
  assert.equal(c.ok, true);
  assert.equal(c.contract.unitPrice, priced.prices[good]);
  assert.equal(c.contract.transitDays, 3);
});
