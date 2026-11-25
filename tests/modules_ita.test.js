// Battaglioni italiani (24/11/2026, schema unico, Italia passo 2; scelte dell'utente: Camicie Nere come battaglione e divisione,
// truppe coloniali come variante, elenco completo di divisioni).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateModules, sumComposition, templateFromComposition, designProblems, designVariant } from '../src/data/modules.js';
import { divisionName, raisePreview, validateRaiseRules, variantRule } from '../src/game/raiseState.js';
import { templateFor } from '../src/rules/forces.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const DOC = read('units/modules/modules_ita.json');
const comp = (id) => DOC.compositions.find((c) => c.templateId === id);
const sum = (id) => sumComposition(DOC.modules, comp(id).modules);
const IDS = ['TPL-ITA-INF-1936', 'TPL-ITA-INF-1940', 'TPL-ITA-INF-1943', 'TPL-ITA-AUTOTRASP-1939', 'TPL-ITA-MOT-1939', 'TPL-ITA-CEL-1938', 'TPL-ITA-ALP-1936',
  'TPL-ITA-ARM-1939', 'TPL-ITA-ARM-1940', 'TPL-ITA-ARM-1942', 'TPL-ITA-PAR-1942', 'TPL-ITA-CCNN-1936', 'TPL-ITA-LIB-1940'];

test('modules_ita.json è valido, 13 modelli di divisione, i template generati coincidono con i file, solo armi italiane', () => {
  assert.deepEqual(validateModules(DOC), []);
  assert.deepEqual(DOC.compositions.map((c) => c.templateId), IDS);
  for (const c of DOC.compositions) assert.deepEqual(read(`units/templates/${c.file}`), JSON.parse(JSON.stringify(templateFromComposition(DOC, c))), c.file);
  for (const m of DOC.modules) for (const k of Object.keys(m.equipment)) assert.ok(k.includes('-ITA-'), `${m.id}: ${k} non italiano`);
});

test('ogni modello di divisione rispetta i limiti dell\'editor alla sua data (con le tecnologie ricercate)', () => {
  const rules = read('units/modules/editor_rules.json');
  const researched = new Set(['TECH-MOT-INF', 'TECH-INF-AIRBORNE']);
  for (const c of DOC.compositions) assert.deepEqual(designProblems(c.modules, { modules: DOC.modules, rules, nation: 'ITA', date: c.activeFrom, researched }), [], c.templateId);
});

test('organici: ternaria 1936 più grande della binaria; binaria vicina alle cifre del CSV del 1940 (12.979 uomini)', () => {
  const t36 = sum('TPL-ITA-INF-1936'), b = sum('TPL-ITA-INF-1940');
  assert.ok(t36.men > b.men);
  assert.ok(Math.abs(b.men - 12979) / 12979 < 0.1, String(b.men));
  assert.equal(b.equipment['INW-ITA-CARCANO-9138'] > 0, true, 'la binaria ha il 91/38');
  assert.equal(t36.equipment['INW-ITA-CARCANO-9138'], undefined, 'nel 1936 il 91/38 non c\'è ancora');
  assert.equal(sum('TPL-ITA-ARM-1940').equipment['TNK-ITA-M13-1940'], 3 * 49);
});

test('varianti: divisione Camicie Nere e divisione libica; la binaria con la legione CC.NN. resta fanteria normale', () => {
  assert.equal(designVariant(comp('TPL-ITA-CCNN-1936').modules, DOC.modules), 'blackshirt');
  assert.equal(designVariant(comp('TPL-ITA-LIB-1940').modules, DOC.modules), 'colonial');
  assert.equal(designVariant(comp('TPL-ITA-INF-1940').modules, DOC.modules), null, '2 battaglioni CC.NN. su 8');
  const tpls = DOC.compositions.map((c) => templateFromComposition(DOC, c));
  const unit = { nation: 'ITA', category: 'infantry', echelon: 'division', variant: null };
  assert.equal(templateFor(unit, tpls, '1936-06-01').id, 'TPL-ITA-INF-1936');
  assert.equal(templateFor(unit, tpls, '1940-06-01').id, 'TPL-ITA-INF-1940');
  assert.equal(templateFor({ ...unit, variant: 'colonial' }, tpls, '1940-06-01').id, 'TPL-ITA-LIB-1940');
  assert.equal(templateFor({ ...unit, variant: 'blackshirt' }, tpls, '1937-01-01').id, 'TPL-ITA-CCNN-1936');
  assert.equal(designVariant(comp('TPL-ITA-AUTOTRASP-1939').modules, DOC.modules), 'transportable', "l'autotrasportabile non sostituisce la binaria");
});

test('formazione: nomi italiani; le divisioni coloniali solo in Libia, Eritrea o Etiopia (chiave «ITA:colonial», più territori)', () => {
  const rules = read('units/modules/raise_rules.json');
  assert.deepEqual(validateRaiseRules(rules), []);
  assert.equal(divisionName(rules, 'ITA', 'infantry', [], 'blackshirt'), '1ª Divisione Camicie Nere');
  assert.equal(divisionName(rules, 'ITA', 'mountain', [{ nation: 'ITA', name: "1ª Divisione alpina 'Taurinense'" }]), '2ª Divisione alpina');
  assert.equal(variantRule(rules, 'ITA', 'colonial').depot, 'P_LBA_TRIPOLI');
  assert.equal(variantRule(rules, 'GBR', 'colonial'), null, 'la regola coloniale italiana non vale per le altre nazioni');
  const lib = comp('TPL-ITA-LIB-1940');
  const state = { date: '1940-06-01', designs: { byId: { 'DSG-ITA-001': { id: 'DSG-ITA-001', nation: 'ITA', name: 'X', category: 'infantry', variant: 'colonial', modules: lib.modules, createdOn: '1940-06-01' } } }, nations: { ITA: { stocks: {} } } };
  const ctx = { modules: DOC.modules, rules, pool: 1e6 };
  const at = (province) => raisePreview(state, { nation: 'ITA', designId: 'DSG-ITA-001', province }, ctx);
  assert.equal(at('P_ITA_ROMA').ok, false);
  assert.match(at('P_ITA_ROMA').reason, /Libia/);
  assert.equal(at('P_LBA_TRIPOLI').ok, true);
  assert.equal(at('P_ERI_ANSEBA').ok, true);
  assert.ok(validateRaiseRules({ ...rules, variants: { 'ITA:colonial': { nation: 'FRA', territories: ['LBA'], depot: 'P_LBA_TRIPOLI' } } }).length > 0, 'nazione della chiave diversa');
});
