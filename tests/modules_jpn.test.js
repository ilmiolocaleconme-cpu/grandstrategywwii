// Battaglioni giapponesi (25/11/2026, schema unico, Giappone passo 2; scelte dell'utente: elenco completo, Guardia con modello proprio,
// battaglione SNLF solo nell'editor come il Commando britannico, brigate rimandate per tutti).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateModules, sumComposition, templateFromComposition, designProblems, designVariant } from '../src/data/modules.js';
import { divisionName, raisePreview, validateRaiseRules, variantRule } from '../src/game/raiseState.js';
import { templateFor } from '../src/rules/forces.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const DOC = read('units/modules/modules_jpn.json');
const comp = (id) => DOC.compositions.find((c) => c.templateId === id);
const sum = (id) => sumComposition(DOC.modules, comp(id).modules);
const IDS = ['TPL-JPN-INF-1936', 'TPL-JPN-INF-1939', 'TPL-JPN-SEC-1939', 'TPL-JPN-GUARD-1936', 'TPL-JPN-ARM-1942', 'TPL-JPN-PAR-1944'];

test('modules_jpn.json è valido, 6 modelli di divisione, i template generati coincidono con i file, solo armi giapponesi', () => {
  assert.deepEqual(validateModules(DOC), []);
  assert.deepEqual(DOC.compositions.map((c) => c.templateId), IDS);
  for (const c of DOC.compositions) assert.deepEqual(read(`units/templates/${c.file}`), JSON.parse(JSON.stringify(templateFromComposition(DOC, c))), c.file);
  for (const m of DOC.modules) for (const k of Object.keys(m.equipment)) assert.ok(k.includes('-JPN-'), `${m.id}: ${k} non giapponese`);
  assert.ok(DOC.modules.some((m) => m.id === 'MOD-JPN-SNLF' && m.variant === 'marine'), 'battaglione SNLF nell\'editor');
  assert.ok(!DOC.compositions.some((c) => c.variant === 'marine'), 'nessuna divisione SNLF');
});

test("ogni modello di divisione rispetta i limiti dell'editor alla sua data (con le tecnologie ricercate)", () => {
  const rules = read('units/modules/editor_rules.json');
  const researched = new Set(read('research/technologies.json').technologies.map((t) => t.id));
  // la quadrata 1936, la triangolare (20.000, cifra del CSV) e la Guardia superano il massimo di uomini dell'editor (18.000), come la quadrata americana del 1936: modelli storici,
  // nell'editor compaiono «da sistemare» (decisione sul limite da prendere con l'utente)
  for (const c of DOC.compositions) {
    const probs = designProblems(c.modules, { modules: DOC.modules, rules, nation: 'JPN', date: c.activeFrom, researched });
    assert.deepEqual(probs.filter((p) => !/^troppi uomini/.test(p)), [], c.templateId);
    if (probs.length) assert.ok(['TPL-JPN-INF-1936', 'TPL-JPN-INF-1939', 'TPL-JPN-GUARD-1936'].includes(c.templateId), c.templateId);
  }
});

test('organici: quadrata 1936 più grande della triangolare; triangolare e corazzata allineate alle cifre del CSV', () => {
  const sq = sum('TPL-JPN-INF-1936'), tri = sum('TPL-JPN-INF-1939'), arm = sum('TPL-JPN-ARM-1942');
  assert.ok(sq.men > tri.men);
  assert.equal(tri.men, 20000);
  assert.deepEqual(['ART-JPN-GUN75-T38', 'ART-JPN-GUN75-REG-1939', 'ART-JPN-AT37-1939', 'MG-JPN-T92'].map((k) => tri.equipment[k]), [36, 12, 22, 112]);
  assert.ok(Math.abs(tri.equipment['MG-JPN-T96'] + tri.equipment['MG-JPN-T11'] - 382) <= 5, 'circa 382 fucili mitragliatori');
  assert.equal(arm.men, 10000);
  assert.deepEqual(['TNK-JPN-TYPE97-1942', 'TNK-JPN-TYPE95-1942', 'ART-JPN-GUN75-ARM-1942', 'ART-JPN-AT47-ARM-1942'].map((k) => arm.equipment[k]), [148, 80, 24, 18]);
});

test('varianti e scelta per data: Guardia e presidio col loro modello; quadrata 1936 → triangolare 1939', () => {
  assert.equal(designVariant(comp('TPL-JPN-GUARD-1936').modules, DOC.modules), 'guards');
  assert.equal(designVariant(comp('TPL-JPN-SEC-1939').modules, DOC.modules), 'garrison');
  const tpls = DOC.compositions.map((c) => templateFromComposition(DOC, c));
  const unit = { nation: 'JPN', category: 'infantry', echelon: 'division', variant: null };
  assert.equal(templateFor(unit, tpls, '1936-06-01').id, 'TPL-JPN-INF-1936');
  assert.equal(templateFor(unit, tpls, '1940-01-01').id, 'TPL-JPN-INF-1939');
  assert.equal(templateFor({ ...unit, variant: 'guards' }, tpls, '1940-01-01').id, 'TPL-JPN-GUARD-1936');
});

test('formazione: nomi giapponesi con ordinale inglese, numeri già usati saltati; Guardia solo in Giappone', () => {
  const rules = read('units/modules/raise_rules.json');
  assert.deepEqual(validateRaiseRules(rules), []);
  const units = read('units/units.json').units;
  assert.equal(divisionName(rules, 'JPN', 'armored', units), '5th Tank Division', 'le 4 divisioni corazzate esistono');
  assert.equal(divisionName(rules, 'JPN', 'infantry', units, 'guards'), '4th Guards Division');
  assert.equal(variantRule(rules, 'JPN', 'guards').depot, 'P_JPN_TOKYO');
  const g = comp('TPL-JPN-GUARD-1936');
  const state = { date: '1937-01-01', designs: { byId: { 'DSG-JPN-001': { id: 'DSG-JPN-001', nation: 'JPN', name: 'X', category: 'infantry', variant: 'guards', modules: g.modules, createdOn: '1937-01-01' } } }, nations: { JPN: { stocks: {} } } };
  const at = (province) => raisePreview(state, { nation: 'JPN', designId: 'DSG-JPN-001', province }, { modules: DOC.modules, rules, pool: 1e6 });
  assert.equal(at('P_JPN_TOKYO').ok, true);
  assert.equal(at('P_KOR_SEOUL').ok, false);
});
