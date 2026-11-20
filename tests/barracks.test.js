// Caserme (20/11/2026). Decisioni dell'utente: prima Germania e URSS; tutti e quattro gli effetti (capacità di addestramento, luogo di nascita,
// qualità e livelli, rimpiazzi dalla caserma più vicina); una caserma per distretto all'inizio; 1 divisione per caserma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBarracksData, barracksEnabled, barracksBuildCost, maxBarracksLevel } from '../src/data/barracks.js';
import { barracksOf, barracksRows, pickBarracks, barracksOrigins, validateBarracksState, barracksBuildOption, completeBarracks } from '../src/game/barracksState.js';
import { raisePreview, raiseDivision } from '../src/game/raiseState.js';
import { createDesign } from '../src/game/designsState.js';
import { depotRoute } from '../src/game/reinforcementSystem.js';
import { validateState } from '../src/game/state.js';
import conditionCfg from '../data/units/condition_config.json' with { type: 'json' };

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('military/barracks.json');
const clone = (x) => JSON.parse(JSON.stringify(x));

test('dati: validi; 13 Wehrkreise tedeschi e 12 distretti sovietici, nelle province dei comandi; solo DEU e URSS', () => {
  const ids = new Set(json('citta_grandi.json').features.map((f) => f.properties.parentProvince));
  for (const f of JSON.parse(readFileSync(new URL('../data/provinces/USSR.json', import.meta.url), 'utf8')).features) ids.add(f.properties.parentProvince ?? f.properties.id);
  for (const f of JSON.parse(readFileSync(new URL('../data/provinces/DEU.json', import.meta.url), 'utf8')).features) ids.add(f.properties.parentProvince ?? f.properties.id);
  assert.deepEqual(validateBarracksData(doc, { provinceExists: (id) => ids.has(id) }), []);
  assert.deepEqual(doc.nations, ['DEU', 'USSR']);
  assert.equal(doc.initial.DEU.length, 13);
  assert.equal(doc.initial.USSR.length, 12);
  assert.equal(doc.capacityDivisions, 1);
  const dep = new Map(json('units/deployment_1936.json').entries.map((e) => [e.unit, e.province]));
  for (const b of [...doc.initial.DEU, ...doc.initial.USSR]) if (dep.has(b.district)) assert.equal(b.province, dep.get(b.district), `${b.id} nella provincia del comando`);
  assert.ok(doc.initial.USSR.filter((b) => !dep.has(b.district)).every((b) => b.basis.startsWith('ESTIMATED')), 'le sedi non presenti nella dislocazione sono stime dichiarate');
  assert.equal(barracksEnabled(doc, 'DEU'), true); assert.equal(barracksEnabled(doc, 'ITA'), false);
  assert.equal(maxBarracksLevel(doc), 3);
});

test('dati sbagliati: errori leggibili', () => {
  const bad = clone(doc);
  bad.levels[1].trainingFactor = 1.5; bad.build['3'] = null; bad.initial.DEU.push({ ...bad.initial.DEU[0] }); bad.initial.ITA = [];
  const e = validateBarracksData(bad, { provinceExists: () => true });
  assert.ok(e.some((x) => x.includes('trainingFactor')));
  assert.ok(e.some((x) => x.includes('livello 3')));
  assert.ok(e.some((x) => x.includes('doppio')));
  assert.ok(e.some((x) => x.includes('ITA')));
  assert.ok(validateBarracksData(doc, { provinceExists: () => false }).length > 0);
});

// ---- formazione nelle caserme ----
const modules = json('units/modules/modules_deu.json').modules;
const editorRules = json('units/modules/editor_rules.json');
const rules = json('units/modules/raise_rules.json');
const INF = [['MOD-DEU-INF', 9], ['MOD-DEU-REGT-HVY', 3], ['MOD-DEU-ART', 3], ['MOD-DEU-ART-HVY', 1], ['MOD-DEU-PIONIER', 1], ['MOD-DEU-SUPPORT', 1]];
const LOST = 'P_DEU_OSTPREUSSEN';
const controllerOf = (state, p) => (p === LOST ? 'POL' : 'DEU');
function game() {
  let s = { date: '1936-03-01', startDate: '1936-01-01', player: 'DEU', forces: { schema: 'forces-v1', initialized: true, divisions: {} }, nations: { DEU: { stocks: {} }, ITA: { stocks: {} } } };
  s = createDesign(s, { nation: 'DEU', name: 'Fanteria', modules: INF }, { modules, rules: editorRules, researched: new Set() }).state;
  return s;
}
const ctx = { modules, rules, pool: 1e6, units: [], conditionCfg, barracks: { params: doc, controllerOf } };

test('caserme iniziali dallo stato o dal file; righe con controllo e posti liberi', () => {
  const s = game();
  const rows = barracksRows(s, doc, 'DEU', controllerOf);
  assert.equal(rows.length, 13);
  assert.equal(rows.find((r) => r.provinceId === LOST).free, 0, 'provincia persa: inutilizzabile');
  assert.equal(rows.filter((r) => r.free === 1).length, 12);
  assert.deepEqual(barracksRows(s, doc, 'ITA', controllerOf), [], 'nazioni senza caserme: nessuna riga');
  assert.equal(barracksOrigins(s, doc, 'DEU', controllerOf).length, 12);
  assert.deepEqual(validateBarracksState(undefined), []);
  assert.ok(validateBarracksState({ schema: 'x' }).length > 0);
});

test('formazione: nasce nella caserma, la occupa fino alla fine dell\'addestramento; senza caserma libera non si forma', () => {
  const s0 = game();
  const r = raiseDivision(s0, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P_DEU_BERLIN' }, ctx);
  const d = r.state.forces.divisions[r.id];
  assert.equal(d.training.barracksId, 'DEU-WK-03');
  assert.equal(r.state.movement.positions[r.id], 'P_DEU_BERLIN');
  assert.throws(() => raiseDivision(r.state, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P_DEU_BERLIN' }, ctx), /caserma libera/, '1 divisione per caserma');
  assert.throws(() => raiseDivision(s0, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P_DEU_TEST' }, ctx), /caserma libera/, 'nessuna caserma nella provincia');
  assert.throws(() => raiseDivision(s0, { nation: 'DEU', designId: 'DSG-DEU-001', province: LOST }, ctx), /caserma libera/, 'caserma in provincia persa');
  // finito l'addestramento la caserma torna libera
  const later = { ...r.state, date: d.training.until };
  assert.equal(pickBarracks(barracksRows(later, doc, 'DEU', controllerOf), 'P_DEU_BERLIN')?.id, 'DEU-WK-03');
  // tutte occupate: l'anteprima lo dice
  let s = s0;
  for (const b of barracksOf(s0, doc, 'DEU')) if (b.provinceId !== LOST) s = raiseDivision(s, { nation: 'DEU', designId: 'DSG-DEU-001', province: b.provinceId }, ctx).state;
  const p = raisePreview(s, { nation: 'DEU', designId: 'DSG-DEU-001' }, ctx);
  assert.equal(p.ok, false); assert.match(p.reason, /nessuna caserma libera/); assert.equal(p.barracks.free, 0);
});

test('livello: la caserma migliore addestra in meno giorni e con più esperienza (entro il tetto delle unità nuove)', () => {
  const s0 = game();
  const base = raiseDivision(s0, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P_DEU_BERLIN' }, ctx);
  assert.equal(base.state.forces.divisions[base.id].training.until, '1936-05-30', 'livello 1: 90 giorni');
  assert.equal(base.state.conditions.byUnit[base.id].experience, conditionCfg.initial.newUnit.experience);
  const lv3 = barracksOf(s0, doc, 'DEU').map((b) => (b.provinceId === 'P_DEU_BERLIN' ? { ...b, level: 3 } : b));
  const s1 = { ...s0, barracks: { schema: 'barracks-v1', byNation: { DEU: lv3 } } };
  assert.deepEqual(validateBarracksState(s1.barracks), []);
  const pre = raisePreview(s1, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P_DEU_BERLIN' }, ctx);
  assert.equal(pre.trainingDays, 72, '90 × 0,8');
  const r = raiseDivision(s1, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P_DEU_BERLIN' }, ctx);
  assert.equal(r.state.conditions.byUnit[r.id].experience, conditionCfg.initial.newUnit.experience + 10);
  assert.ok(r.state.conditions.byUnit[r.id].experience <= conditionCfg.training.newUnitCap);
});

test('nazioni senza caserme: si forma come prima, ovunque', () => {
  let s = { date: '1936-03-01', startDate: '1936-01-01', player: 'ITA', forces: { schema: 'forces-v1', initialized: true, divisions: {} }, nations: { ITA: { stocks: {} } } };
  const itMods = modules.map((m) => ({ ...m, nation: 'ITA' }));
  s = createDesign(s, { nation: 'ITA', name: 'Fanteria', modules: INF }, { modules: itMods, rules: editorRules, researched: new Set() }).state;
  const r = raiseDivision(s, { nation: 'ITA', designId: Object.keys(s.designs.byId)[0], province: 'P_ITA_ROMA' }, { ...ctx, modules: itMods });
  assert.equal(r.state.forces.divisions[r.id].training.barracksId, undefined);
  assert.equal(r.state.movement.positions[r.id], 'P_ITA_ROMA');
});

// ---- costruzione: nuova caserma e miglioramenti ----
import { createConstruction } from '../src/game/construction.js';
import { newGame } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { loadIndustryCatalogFrom } from '../src/data/industry.js';
import { allRecipeList } from './_equipment_recipes.js';
import { provinceBuildOptions } from '../src/ui/buildOptions.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const cat = loadIndustryCatalogFrom(text);
const catalog = { recipes: new Map(allRecipeList().map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const pop = json('population/population.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy: json('economy/economy.json'), population: pop };
const build = createConstruction({ catalog, economy: start.economy, sites: { byProvince: {} }, hydro: json('resources/hydro_plants.json'), political, workersShare: pop.workersShare.value, barracks: { params: doc, provinceName: (id) => id.replace('P_DEU_', '') } });
const full = () => newGame({ nation: 'DEU', political, ownersWithProvinces: nationIds, start }).state;

test('costruzione: caserma nuova (60 giorni), poi si migliora fino al livello 3; un lavoro per provincia; Italia no', () => {
  const s0 = full();
  assert.deepEqual(barracksBuildCost(doc, 1), { ecv: 20, steel: 10, days: 60 });
  const r = build.start(s0, 'DEU', { kind: 'barracks', provinceId: 'P_DEU_KOELN_AACHEN' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.state.nations.DEU.balance, s0.nations.DEU.balance - 20);
  assert.equal(build.start(r.state, 'DEU', { kind: 'barracks', provinceId: 'P_DEU_KOELN_AACHEN' }).reason, 'already_building');
  let s = r.state;
  for (let i = 0; i < 60; i += 1) s = advanceDay(s, [build.constructionDay]);
  const list = barracksOf(s, doc, 'DEU');
  assert.equal(list.length, 14, '13 iniziali + 1');
  const nuova = list.find((b) => b.provinceId === 'P_DEU_KOELN_AACHEN');
  assert.deepEqual({ level: nuova.level, name: nuova.name }, { level: 1, name: 'Caserma di KOELN_AACHEN' });
  assert.deepEqual(validateState(s), [], 'lo stato con le caserme resta valido');
  // miglioramento della caserma di Berlino: 2 poi 3, poi basta
  let u = build.start(s, 'DEU', { kind: 'barracks', provinceId: 'P_DEU_BERLIN' });
  assert.equal(u.ok, true); assert.equal(u.entry.level, 2);
  s = u.state; for (let i = 0; i < 45; i += 1) s = advanceDay(s, [build.constructionDay]);
  u = build.start(s, 'DEU', { kind: 'barracks', provinceId: 'P_DEU_BERLIN' });
  s = u.state; for (let i = 0; i < 60; i += 1) s = advanceDay(s, [build.constructionDay]);
  assert.equal(barracksOf(s, doc, 'DEU').find((b) => b.provinceId === 'P_DEU_BERLIN').level, 3);
  assert.equal(build.start(s, 'DEU', { kind: 'barracks', provinceId: 'P_DEU_BERLIN' }).reason, 'max_level');
  assert.equal(barracksBuildOption(s, doc, 'DEU', 'P_DEU_BERLIN'), null);
  const ita = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
  assert.equal(build.start(ita, 'ITA', { kind: 'barracks', provinceId: 'P_ITA_ROMA' }).reason, 'barracks_disabled');
});

test('pannello Costruzioni: voce caserma nuova o miglioramento', () => {
  const s = full();
  const bctx = { build, catalog, sites: { byProvince: {} }, economy: start.economy, barracks: { enabled: (n) => barracksEnabled(doc, n), option: (st, n, p) => barracksBuildOption(st, doc, n, p) } };
  const berlin = provinceBuildOptions(s, 'DEU', 'P_DEU_BERLIN', bctx).barracks;
  assert.equal(berlin.length, 1); assert.match(berlin[0].label, /Wehrkreis III → Caserma ampliata \(livello 2\)/); assert.equal(berlin[0].ok, true);
  assert.equal(provinceBuildOptions(s, 'DEU', 'P_DEU_KOELN_AACHEN', bctx).barracks[0].label, 'Caserma nuova');
  assert.equal(completeBarracks(s, doc, [], s.date), s);
});

// ---- rinforzi dalla caserma più vicina ----
test('rinforzi: partono dal punto più vicino fra deposito della capitale e caserme controllate', () => {
  const adj = { CAP: ['B'], B: ['CAP', 'C'], C: ['B', 'D'], D: ['C', 'K'], K: ['D'] };
  const net = { has: (m) => m in adj, neighbors: (m) => adj[m], km: () => 100 };
  const base = { net, depots: { nations: { DEU: { province: 'CAP' } } }, positionOf: () => 'D', canEnter: () => () => true };
  assert.deepEqual(depotRoute(base, 'DEU', 'x'), { landKm: 300 }, 'senza caserme: dalla capitale');
  assert.deepEqual(depotRoute({ ...base, originsOf: () => ['K'] }, 'DEU', 'x'), { landKm: 100 }, 'caserma a un passo');
  assert.deepEqual(depotRoute({ ...base, originsOf: () => ['D'] }, 'DEU', 'x'), { landKm: 0 }, 'caserma nella stessa provincia');
  assert.deepEqual(depotRoute({ ...base, originsOf: () => ['B'], positionOf: () => 'CAP' }, 'DEU', 'x'), { landKm: 0 }, 'la capitale resta un punto di partenza');
  assert.deepEqual(depotRoute({ ...base, depots: { nations: {} }, originsOf: () => ['K'] }, 'DEU', 'x'), { landKm: 100 }, 'anche senza deposito della capitale');
});
