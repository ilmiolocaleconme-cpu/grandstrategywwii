// Battaglioni francesi (25/11/2026, schema unico, Francia passo 2; scelte dell'utente: truppe coloniali come variante,
// elenco completo di divisioni, divisioni di fortezza rimandate).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateModules, sumComposition, templateFromComposition, designProblems, designVariant } from '../src/data/modules.js';
import { divisionName, raisePreview, validateRaiseRules, variantRule } from '../src/game/raiseState.js';
import { templateFor } from '../src/rules/forces.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const DOC = read('units/modules/modules_fra.json');
const comp = (id) => DOC.compositions.find((c) => c.templateId === id);
const sum = (id) => sumComposition(DOC.modules, comp(id).modules);
const IDS = ['TPL-FRA-INF-1936', 'TPL-FRA-INF-1939', 'TPL-FRA-MOT-1936', 'TPL-FRA-DLM-1936', 'TPL-FRA-ARM-1940', 'TPL-FRA-CAV-1936', 'TPL-FRA-DLC-1940', 'TPL-FRA-ALP-1936', 'TPL-FRA-COL-1936'];

test('modules_fra.json è valido, 9 modelli di divisione, i template generati coincidono con i file, solo armi francesi', () => {
  assert.deepEqual(validateModules(DOC), []);
  assert.deepEqual(DOC.compositions.map((c) => c.templateId), IDS);
  for (const c of DOC.compositions) assert.deepEqual(read(`units/templates/${c.file}`), JSON.parse(JSON.stringify(templateFromComposition(DOC, c))), c.file);
  for (const m of DOC.modules) for (const k of Object.keys(m.equipment)) assert.ok(k.includes('-FRA-'), `${m.id}: ${k} non francese`);
});

test("ogni modello di divisione rispetta i limiti dell'editor alla sua data (con le tecnologie ricercate)", () => {
  const rules = read('units/modules/editor_rules.json');
  const researched = new Set(read('research/technologies.json').technologies.map((t) => t.id));
  for (const c of DOC.compositions) assert.deepEqual(designProblems(c.modules, { modules: DOC.modules, rules, nation: 'FRA', date: c.activeFrom, researched }), [], c.templateId);
});

test('organici: fanteria 1936 come quadro al 30%; 1939 vicina alle cifre di prima (16.400 uomini); DCr vicina a 6.500 con 68 B1 bis', () => {
  const t36 = read('units/templates/divisione_fanteria_francia_1936.json');
  assert.equal(t36.initialFillRatio.value, 0.3); assert.equal(t36.startsAsCadre, true);
  assert.ok(Math.abs(sum('TPL-FRA-INF-1939').men - 16400) / 16400 < 0.05);
  const dcr = sum('TPL-FRA-ARM-1940');
  assert.ok(Math.abs(dcr.men - 6500) / 6500 < 0.05);
  assert.equal(dcr.equipment['TNK-FRA-B1BIS-1940'], 68);
  assert.equal(sum('TPL-FRA-INF-1936').equipment['INW-FRA-MAS36'], undefined, 'nel 1936 il MAS 36 non c\'è');
});

test('varianti e scelta per data: coloniali col loro modello; fanteria 1936 → 1939; cavalleria 1936 → DLC 1940', () => {
  assert.equal(designVariant(comp('TPL-FRA-COL-1936').modules, DOC.modules), 'colonial');
  const tpls = DOC.compositions.map((c) => templateFromComposition(DOC, c));
  const unit = { nation: 'FRA', category: 'infantry', echelon: 'division', variant: null };
  assert.equal(templateFor(unit, tpls, '1936-06-01').id, 'TPL-FRA-INF-1936');
  assert.equal(templateFor(unit, tpls, '1939-10-01').id, 'TPL-FRA-INF-1939');
  assert.equal(templateFor({ ...unit, variant: 'colonial' }, tpls, '1936-06-01').id, 'TPL-FRA-COL-1936');
  assert.equal(templateFor({ ...unit, category: 'cavalry' }, tpls, '1936-06-01').id, 'TPL-FRA-CAV-1936');
  assert.equal(templateFor({ ...unit, category: 'cavalry' }, tpls, '1940-03-01').id, 'TPL-FRA-DLC-1940');
  assert.equal(templateFor({ ...unit, category: 'mechanized' }, tpls, '1936-06-01').id, 'TPL-FRA-DLM-1936');
});

test('formazione: nomi francesi con ordinale (1re, 2e), numeri già usati saltati; coloniali solo in Nordafrica e Senegal', () => {
  const rules = read('units/modules/raise_rules.json');
  assert.deepEqual(validateRaiseRules(rules), []);
  const units = read('units/units.json').units;
  assert.equal(divisionName(rules, 'FRA', 'armored', []), '1re Division Cuirassée');
  assert.equal(divisionName(rules, 'FRA', 'armored', units), '4e Division Cuirassée', 'la 1re, 2e e 3e DCr esistono');
  const inf = divisionName(rules, 'FRA', 'infantry', units);
  assert.ok(!units.some((u) => u.nation === 'FRA' && u.name.toLowerCase() === inf.toLowerCase()), `${inf}: numero già usato`);
  assert.equal(variantRule(rules, 'FRA', 'colonial').depot, 'P_ALG_ALGER');
  assert.equal(variantRule(rules, 'ITA', 'colonial').depot, 'P_LBA_TRIPOLI', 'ogni nazione la sua regola');
  const col = comp('TPL-FRA-COL-1936');
  const state = { date: '1937-01-01', designs: { byId: { 'DSG-FRA-001': { id: 'DSG-FRA-001', nation: 'FRA', name: 'X', category: 'infantry', variant: 'colonial', modules: col.modules, createdOn: '1937-01-01' } } }, nations: { FRA: { stocks: {} } } };
  const at = (province) => raisePreview(state, { nation: 'FRA', designId: 'DSG-FRA-001', province }, { modules: DOC.modules, rules, pool: 1e6 });
  assert.equal(at('P_FRA_PARIS').ok, false);
  assert.equal(at('P_ALG_ALGER').ok, true);
  assert.equal(at('P_SEN_DAKAR').ok, true);
});
