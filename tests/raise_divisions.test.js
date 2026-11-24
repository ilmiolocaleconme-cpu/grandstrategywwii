// Formazione di divisioni nuove (19/11/2026). Decisioni dell'utente: nasce come quadro, stesse regole per le storiche, addestramento per tipo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRaiseRules, divisionName, raisePreview, raiseDivision, inTraining, drawOnActivation } from '../src/game/raiseState.js';
import { createDesign } from '../src/game/designsState.js';
import { isFighter } from '../src/game/warCommon.js';
import { createForcesActivationSystem, validateForcesShape } from '../src/game/forcesState.js';
import { initForces } from '../src/rules/forces.js';
import { unitOf, validateUnitRegistry } from '../src/rules/unitRegistry.js';
import conditionCfg from '../data/units/condition_config.json' with { type: 'json' };

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const modules = json('units/modules/modules_deu.json').modules;
const editorRules = json('units/modules/editor_rules.json');
const rules = json('units/modules/raise_rules.json');
const tplInf = json('units/templates/divisione_fanteria_germania_1936.json');
const INF = [['MOD-DEU-INF', 9], ['MOD-DEU-REGT-HVY', 3], ['MOD-DEU-ART', 3], ['MOD-DEU-ART-HVY', 1], ['MOD-DEU-PIONIER', 1], ['MOD-DEU-SUPPORT', 1]];
const units = [{ id: 'U1', nation: 'DEU', echelon: 'division', category: 'infantry', name: '1. Infanterie-Division', startYear: 1935, endYear: null },
  { id: 'U2', nation: 'DEU', echelon: 'division', category: 'infantry', name: '2. Infanterie-Division', startYear: 1935, endYear: null },
  { id: 'U4', nation: 'DEU', echelon: 'division', category: 'infantry', name: '4. Infanterie-Division', startYear: 1935, endYear: null }];

function game(stocks = {}) {
  let s = { date: '1936-03-01', startDate: '1936-01-01', player: 'DEU', forces: { schema: 'forces-v1', initialized: true, divisions: {} }, nations: { DEU: { stocks } } };
  s = createDesign(s, { nation: 'DEU', name: 'Fanteria', modules: INF }, { modules, rules: editorRules, researched: new Set() }).state;
  return s;
}
const ctx = (pool) => ({ modules, rules, pool, units, conditionCfg });

test('regole valide; nomi tedeschi col primo numero libero', () => {
  assert.deepEqual(validateRaiseRules(rules), []);
  assert.equal(divisionName(rules, 'DEU', 'infantry', units), '3. Infanterie-Division');
  assert.equal(divisionName(rules, 'DEU', 'armored', units), '1. Panzer-Division');
  assert.equal(divisionName(rules, 'FRA', 'infantry', []), '1ª Divisione', 'nazione senza schema di nomi');
  assert.equal(divisionName(rules, 'ITA', 'infantry', []), '1ª Divisione fanteria');
  assert.equal(divisionName(rules, 'ITA', 'infantry', [{ nation: 'ITA', name: "1ª Divisione fanteria 'Superga'" }]), '2ª Divisione fanteria', 'il numero di una divisione col nome proprio è occupato (24/11/2026)');
  assert.equal(divisionName(rules, 'ITA', 'infantry', [], 'colonial'), '1ª Divisione libica');
  assert.ok(validateRaiseRules({ ...rules, trainingDays: { infantry: 90 } }).length > 0);
});

test('anteprima: servono almeno il 30% degli uomini liberi', () => {
  const s = game({ 'equipment.INW-DEU-RIFLE-1939': 4000 });
  const p = raisePreview(s, { nation: 'DEU', designId: 'DSG-DEU-001' }, ctx(1000));
  assert.equal(p.ok, false); assert.match(p.reason, /uomini liberi/);
  const ok = raisePreview(s, { nation: 'DEU', designId: 'DSG-DEU-001' }, ctx(50000));
  assert.equal(ok.ok, true); assert.equal(ok.trainingDays, 90);
  const rifle = ok.equipment.find((e) => e.item === 'equipment.INW-DEU-RIFLE-1939');
  assert.equal(rifle.stock, 4000); assert.ok(rifle.need > 4000);
});

test('formazione: nasce come quadro con gli uomini, senza armi gratis, nella provincia, in addestramento e non combatte', () => {
  const s0 = game({ 'equipment.INW-DEU-RIFLE-1939': 4000 });
  const r = raiseDivision(s0, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P_DEU_TEST' }, ctx(8000));
  assert.equal(r.id, 'X00001'); assert.equal(r.name, '3. Infanterie-Division');
  const d = r.state.forces.divisions[r.id];
  assert.equal(d.templateId, 'DSG-DEU-001');
  assert.equal(d.items['manpower.war'].effective, 8000, 'uomini fino a quelli liberi');
  for (const [k, it] of Object.entries(d.items)) if (k !== 'manpower.war') assert.equal(it.effective, 0, `${k} non gratis`);
  assert.equal(r.state.nations.DEU.stocks['equipment.INW-DEU-RIFLE-1939'], 4000, 'il magazzino lo svuotano i rinforzi, non la formazione');
  assert.equal(d.training.until, '1936-05-30');
  assert.equal(r.state.movement.positions[r.id], 'P_DEU_TEST');
  assert.equal(r.state.conditions.byUnit[r.id].isNew, true);
  const u = unitOf(r.state, r.id, new Map());
  assert.deepEqual([u.nation, u.echelon, u.category, u.origin], ['DEU', 'division', 'infantry', 'player']);
  assert.deepEqual(validateUnitRegistry(r.state.unitRegistry), []);
  assert.deepEqual(validateForcesShape(r.state.forces), []);
  assert.equal(inTraining(r.state, r.id), true);
  assert.equal(isFighter(r.state, u), false, 'in addestramento non combatte');
  const later = { ...r.state, date: '1936-05-30' };
  assert.equal(inTraining(later, r.id), false); assert.equal(isFighter(later, u), true);
  assert.throws(() => raiseDivision(s0, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P' }, ctx(100)), /uomini/);
  assert.throws(() => raiseDivision(s0, { nation: 'DEU', designId: 'DSG-DEU-001', province: null }, ctx(9000)), /provincia/);
  const r2 = raiseDivision(r.state, { nation: 'DEU', designId: 'DSG-DEU-001', province: 'P' }, { ...ctx(9000), units: [...units, u] });
  assert.equal(r2.id, 'X00002'); assert.equal(r2.name, '5. Infanterie-Division');
  assert.ok(validateForcesShape({ ...r.state.forces, divisions: { ...r.state.forces.divisions, Z: { ...d, training: { until: 'domani' } } } }).some((e) => /addestramento/.test(e)));
});

test('stesse regole per le storiche: si prende quanto c\'è nel magazzino e nel bacino', () => {
  const items = { 'manpower.war': { planned: 100, effective: 80, source: 'ratio' }, 'equipment.A': { planned: 50, effective: 40, source: 'ratio' }, horses: { planned: 10, effective: 8, source: 'ratio' }, 'other.x': { planned: 5, effective: 4, source: 'ratio' } };
  const r = drawOnActivation(items, 'DEU', { DEU: { stocks: { 'equipment.A': 25, horses: 100 } } }, 60);
  assert.deepEqual([r.items['manpower.war'].effective, r.items['equipment.A'].effective, r.items.horses.effective, r.items['other.x'].effective], [60, 25, 8, 4]);
  assert.deepEqual(r.nations.DEU.stocks, { 'equipment.A': 0, horses: 92 });
  assert.equal(r.pool, 0);
});

test('sistema di attivazione: una divisione storica formata dopo l\'inizio non arriva più armata gratis; quelle già esistenti sì', () => {
  const old = { id: 'U00010', nation: 'DEU', echelon: 'division', category: 'infantry', name: 'vecchia', startYear: 1935, endYear: null };
  const neu = { id: 'U00011', nation: 'DEU', echelon: 'division', category: 'infantry', name: 'nuova', startYear: 1937, endYear: null };
  const tpl = { ...tplInf, appliesTo: { ...tplInf.appliesTo, activeFrom: '1936-01-01' } };
  const sys = createForcesActivationSystem({ units: [old, neu], templates: [tpl], ratio: 0.8, poolOf: () => 3000 });
  const start = { date: '1937-01-01', startDate: '1936-01-01', forces: { schema: 6, initialized: true, divisions: {} }, nations: { DEU: { stocks: {} } } };
  const s = sys(start);
  const ref = initForces({ divisions: {} }, { units: [old], templates: [tpl], ratio: 0.8, date: '1937-01-01' }).state.divisions.U00010;
  assert.deepEqual(s.forces.divisions.U00010.items, ref.items, 'esistente all\'inizio: come prima');
  const n = s.forces.divisions.U00011.items;
  assert.equal(n['manpower.war'].effective, 3000, 'uomini dal bacino');
  for (const [k, it] of Object.entries(n)) if (k.startsWith('equipment.')) assert.equal(it.effective, 0, `${k}: magazzino vuoto, niente gratis`);
  const noPool = createForcesActivationSystem({ units: [old, neu], templates: [tpl], ratio: 0.8 })(start);
  assert.ok(noPool.forces.divisions.U00011.items['manpower.war'].effective > 3000, 'senza bacino nel contesto: comportamento di prima');
});
