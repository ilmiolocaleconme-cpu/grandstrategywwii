// Fucili, fase 2 (12/11/2026, scelta A): qualità dei fucili della nazione e bonus in battaglia. Valori DESIGN_DEFAULT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { rifleTechBonus, removeRiflePoints } from '../src/rules/rifleQuality.js';
import { equipmentLosses, EQUIPMENT_LOSS_SHARE } from '../src/rules/combat.js';
import { validateRifleQuality, bestRifleQuality, addRiflePoints, averageQuality, rifleBonus, plannedMenByNation, modelQuality } from '../src/rules/rifleQuality.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { createEconomySystem, isRifleProduct } from '../src/game/economySystem.js';
import { validateNations } from '../src/game/economyState.js';
import { newGame } from '../src/game/state.js';
import { advanceDays } from '../src/game/engine.js';
import { createTheaterSystem } from '../src/game/theaterState.js';
import { createWar, declareWar } from '../src/rules/war.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const doc = json('units/models/fucili_1930_1945.json');
const ALL = new Set(['TECH-INF-OPTICS', 'TECH-INF-SEMI1', 'TECH-INF-SEMI2', 'TECH-INF-SELECT', 'TECH-INF-EMERG']);

test('dati: configurazione valida; difetti segnalati', () => {
  assert.deepEqual(validateRifleQuality(doc), []);
  const bad = structuredClone(doc); bad.rifleQuality.bonusPerQuality = 1;
  assert.ok(validateRifleQuality(bad).some((e) => /bonusPerQuality/.test(e)));
});

test('miglior fucile producibile: ripetizione = 0, Garand = 1, G43 = 1,25, VG1-5 vale meno di un semiautomatico vero', () => {
  assert.equal(bestRifleQuality(doc, 'DEU', 1936, new Set()), 0);
  assert.equal(bestRifleQuality(doc, 'USA', 1936, new Set(['TECH-INF-SEMI1'])), 1);
  assert.equal(bestRifleQuality(doc, 'DEU', 1943, ALL), 1.25);
  assert.equal(modelQuality(doc, doc.models.find((m) => m.id === 'MDL-DEU-VG1-5')), 0.5);
  assert.equal(bestRifleQuality(doc, 'ITA', 1945, new Set()), 0, 'senza tecnologie solo Carcano');
  // modelli a produzione limitata: solo il 20% dell'eccedenza (13/11/2026)
  assert.equal(bestRifleQuality(doc, 'USSR', 1936, new Set(['TECH-INF-SELECT'])), 0.25, 'AVS-36 limitato: Mosin 0 + 0,2 × 1,25');
  assert.equal(bestRifleQuality(doc, 'USSR', 1940, new Set(['TECH-INF-SELECT', 'TECH-INF-SEMI1'])), 1.05, 'SVT-40 standard 1 + 0,2 × 0,25');
  assert.equal(bestRifleQuality(doc, 'DEU', 1941, new Set(['TECH-INF-SEMI1'])), 0.2, 'G41 limitato');
  assert.equal(bestRifleQuality(doc, 'ITA', 1939, new Set(['TECH-INF-SEMI1'])), 0.2, 'Armaguerra limitato');
});

test('punti, qualità media sugli uomini PREVISTI (con tetto) e bonus solo per le categorie che combattono col fucile', () => {
  const n = addRiflePoints({ balance: 1 }, 1000, 1);
  assert.equal(n.rifles.points, 1000);
  assert.deepEqual(n.rifles, { points: 1000, count: 1000 });
  assert.deepEqual(addRiflePoints(n, 1000, 0).rifles, { points: 1000, count: 2000 }, 'i fucili a ripetizione prodotti dopo diluiscono la media');
  const none = { balance: 1 };
  assert.equal(addRiflePoints(none, 50, 0), none, 'solo fucili a ripetizione dall\'inizio: nessun conto, stesso oggetto');
  // la media non supera mai la qualità dei fucili prodotti (13/11/2026): 868.000 Garand (qualità 1) per 45.735 uomini = 1, non 1,25
  assert.equal(averageQuality(doc, 868000, 45735, 868000), 1);
  assert.equal(averageQuality(doc, 1000, 10000, 2000), 0.1, 'denominatore: uomini, se più dei fucili');
  assert.equal(averageQuality(doc, 5000, 10000), 0.5);
  assert.equal(averageQuality(doc, 1e9, 10000), 1.25, 'tetto');
  assert.equal(averageQuality(doc, 5000, 0), 0);
  assert.equal(rifleBonus(doc, 'infantry', 1), 0.08);
  assert.equal(rifleBonus(doc, 'armored', 1), 0);
  const forces = { divisions: { A: { items: { 'manpower.war': { planned: 10000, effective: 3000 } } }, B: { items: { 'manpower.war': { planned: 5000, effective: 5000 } } } } };
  assert.deepEqual(plannedMenByNation(forces, (id) => ({ A: 'USA', B: 'USA' })[id]), { USA: 15000 });
});

test('economia: i fucili prodotti aggiungono punti alla nazione (solo con un modello migliore della ripetizione)', () => {
  assert.ok(isRifleProduct('equipment.INW-FRA-RIFLE-1939'));
  assert.ok(!isRifleProduct('equipment.INW-FRA-PISTOL-1939'));
  const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') });
  const edir = new URL('../data/units/equipment/', import.meta.url);
  const eqCatalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
  const recipes = [...json('industry/recipes.json').recipes, ...buildEquipmentRecipes(eqCatalog, json('units/equipment/equipment_production.json'))];
  const catalog = { recipes: new Map(recipes.map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json') };
  const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id); const economy = json('economy/economy.json');
  const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population: json('population/population.json') };
  // la Francia (fabbrica di armi leggere con la ricetta del fucile nei dati iniziali) non ha modelli nel catalogo: se ne aggiunge uno di prova semiautomatico
  const semi = structuredClone(doc); semi.models.push({ id: 'MDL-FRA-PROVA', nation: 'FRA', designation: 'Prova', type: 'semi', caliber: 'x', magazine: 5, parent: null, requires: null, available: 1930, productionEnd: null, status: 'standard', basis: 'ipotesi', note: 'test' });
  const base = { catalog, economy, baseline: json('resources/extraction_baseline.json'), hydro: json('resources/hydro_plants.json'), political, cash: start.cash };
  const s0 = newGame({ nation: 'FRA', political, ownersWithProvinces: nationIds, start }).state;
  const fra = s0.nations.FRA; const rich = { ...s0, nations: { ...s0.nations, FRA: { ...fra, stocks: { ...fra.stocks, steel: 5e6, components: 5e5 } } } };
  const late = advanceDays(rich, 70, [createEconomySystem({ ...base, smallArms: semi })]);
  const made = late.nations.FRA.stocks['equipment.INW-FRA-RIFLE-1939'] ?? 0;
  assert.ok(made > 0, 'la fabbrica francese consegna fucili');
  assert.equal(late.nations.FRA.rifles?.points, made, 'un punto per fucile semiautomatico');
  assert.deepEqual(validateNations(late.nations), []);
  const bolt = advanceDays(rich, 70, [createEconomySystem({ ...base, smallArms: doc })]);
  assert.equal(bolt.nations.FRA.rifles, undefined, 'senza modelli migliori della ripetizione nessun punto');
  assert.deepEqual(validateNations({ FRA: { ...late.nations.FRA, rifles: { points: -1 } } }), ['stato: FRA, punti dei fucili non validi']);
});

test('battaglia: il bonus dei fucili vale in attacco e si somma alla difesa', () => {
  const OWNERS = { X: 'GER', Y: 'FRA' };
  const net = { has: (m) => m in OWNERS, neighbors: (m) => (m === 'X' ? ['Y'] : ['X']), km: () => 100, owner: (m) => OWNERS[m], name: (m) => m };
  const UNITS = [{ id: 'G1', name: 'G1', nation: 'GER', category: 'infantry', echelon: 'division' }, { id: 'F1', name: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' }];
  const unitsById = new Map(UNITS.map((u) => [u.id, u]));
  const div = () => ({ templateId: 't', since: 'd', items: { 'manpower.war': { planned: 10000, effective: 10000, source: 'template' }, 'equipment.fucili': { planned: 8000, effective: 8000 } } });
  const entries = [{ unit: 'G1', province: 'X' }, { unit: 'F1', province: 'X' }];
  const state = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal',
    war: declareWar(createWar(), { a: 'GER', b: 'FRA', date: '1936-01-01' }),
    forces: { schema: 'forces-v1', initialized: true, divisions: { G1: div(), F1: div() } } };
  const ctx = { getNet: () => net, unitsById, deploymentDoc: { entries }, initial: new Map(entries.map((e) => [e.unit, e.province])) };
  const lossesOf = (c) => { const s = createTheaterSystem(c)({ ...state, day: 1 }); return { G1: 10000 - s.forces.divisions.G1.items['manpower.war'].effective, F1: 10000 - s.forces.divisions.F1.items['manpower.war'].effective }; };
  const plain = lossesOf(ctx);
  assert.ok(plain.G1 > 0 && plain.F1 > 0, 'battaglia avvenuta');
  const fraRifles = lossesOf({ ...ctx, rifleBonus: (_s, u) => (u.nation === 'FRA' ? 0.08 : 0) });
  assert.ok(fraRifles.G1 > plain.G1, 'l\'attaccante coi fucili migliori fa più perdite');
  assert.ok(fraRifles.F1 < plain.F1, 'e ne subisce meno');
  const seen = [];
  const after = createTheaterSystem({ ...ctx, onEquipmentLost: (st, id, lost) => { seen.push([id, lost['equipment.fucili']]); return st; } })({ ...state, day: 1 });
  assert.ok(after.forces.divisions.G1.items['equipment.fucili'].effective < 8000, 'il difensore perde anche fucili');
  assert.deepEqual(seen.map((x) => x[0]).sort(), ['F1', 'G1']);
  assert.ok(seen.every(([, n]) => n > 0));
});

test('bonus delle tecnologie: appena ricercate, solo per le categorie col fucile; 1% ciascuna, totale +5%', () => {
  assert.equal(rifleTechBonus(doc, 'infantry', new Set()), 0);
  assert.equal(rifleTechBonus(doc, 'infantry', new Set(['TECH-INF-SEMI1'])), 0.01);
  assert.equal(rifleTechBonus(doc, 'infantry', ALL), 0.05);
  assert.equal(rifleTechBonus(doc, 'armored', ALL), 0);
  const bad = structuredClone(doc); bad.rifleQuality.techBonus['TECH-NO'] = 0.01;
  assert.ok(validateRifleQuality(bad, { techIds: new Set(ALL) }).some((e) => /inesistente/.test(e)));
});

test('armi perse in battaglia: metà della quota degli uomini, voce per voce; i punti dei fucili calano', () => {
  const items = { 'manpower.war': { planned: 10000, effective: 10000 }, 'equipment.fucili': { planned: 8000, effective: 8000 }, 'equipment.mg': { planned: 100, effective: 1 }, horses: { planned: 500, effective: 500 } };
  assert.equal(EQUIPMENT_LOSS_SHARE, 0.5);
  assert.deepEqual(equipmentLosses(items, 10000, 1000), { 'equipment.fucili': 400 }, '10% degli uomini → 5% dei fucili; 1 mitragliatrice × 5% arrotondato = 0; i cavalli no');
  assert.deepEqual(equipmentLosses(items, 10000, 0), {});
  assert.deepEqual(equipmentLosses(items, 100, 1e6), { 'equipment.fucili': 4000, 'equipment.mg': 1 }, 'mai oltre metà con la divisione distrutta');
  assert.equal(removeRiflePoints({ rifles: { points: 1000 } }, 400, 0.5).rifles.points, 800);
  assert.equal(removeRiflePoints({ rifles: { points: 10 } }, 400, 1).rifles.points, 0, 'mai sotto zero');
  const none = { balance: 1 }; assert.equal(removeRiflePoints(none, 5, 1), none);
});
