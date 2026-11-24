// Battaglioni britannici (24/11/2026, schema unico, Regno Unito passo 2, scelta A dell'utente: 8 modelli di divisione).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateModules, sumComposition, templateFromComposition, targetVersions } from '../src/data/modules.js';
import { divisionName } from '../src/game/raiseState.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const DOC = read('units/modules/modules_gbr.json');
const comp = (id) => DOC.compositions.find((c) => c.templateId === id);
const sum = (id) => sumComposition(DOC.modules, comp(id).modules);

test('modules_gbr.json è valido, 8 modelli di divisione, i template generati coincidono con i file', () => {
  assert.deepEqual(validateModules(DOC), []);
  assert.deepEqual(DOC.compositions.map((c) => c.templateId), ['TPL-GBR-INF-1936', 'TPL-GBR-INF-1939', 'TPL-GBR-INF-1944', 'TPL-GBR-MOB-1937', 'TPL-GBR-ARM-1939', 'TPL-GBR-ARM-1942', 'TPL-GBR-ARM-1944', 'TPL-GBR-ABN-1942']);
  for (const c of DOC.compositions) assert.deepEqual(read(`units/templates/${c.file}`), JSON.parse(JSON.stringify(templateFromComposition(DOC, c))), c.file);
  for (const m of DOC.modules) for (const k of Object.keys(m.equipment)) assert.ok(!/USA/.test(k), `${m.id}: niente Lend-Lease (scelta 1A)`);
});

test('organici: fanteria 1939 vicina alle cifre 1939-40 (13.863), corazzata 1939 con 48 anticarro da 2 libbre come il CSV', () => {
  const inf = sum('TPL-GBR-INF-1939');
  assert.ok(Math.abs(inf.men - 13863) / 13863 < 0.05, String(inf.men));
  assert.equal(inf.equipment['MG-GBR-BREN'], 9 * 50 + 44);
  assert.equal(inf.equipment['ART-GBR-2PDR-ARM-1939'], 48);
  const arm = sum('TPL-GBR-ARM-1939');
  assert.equal(arm.equipment['ART-GBR-2PDR-ARM-1939'], 48);
  assert.equal(arm.equipment['TNK-GBR-CRUISER-1939'], 156);
  assert.equal(sum('TPL-GBR-INF-1944').equipment['ART-GBR-17PDR'], 16);
  assert.equal(sum('TPL-GBR-INF-1944').equipment['ART-GBR-25PDR-ARM-1939'], 72);
});

test('modernizzazione: il battaglione 1938 passa alla versione 1943 solo con la data e le armi nuove producibili', () => {
  const composition = comp('TPL-GBR-INF-1939').modules.map(([id, count]) => ({ id, count }));
  const early = targetVersions({ composition, modules: DOC.modules, nation: 'GBR', date: '1942-06-01', researched: new Set(['TECH-MOT-INF']) });
  assert.equal(early['MOD-GBR-FIELD-1938'], 'MOD-GBR-FIELD-1940', '25 libbre dal 1940');
  assert.equal(early['MOD-GBR-INF-1938'], undefined, 'PIAT solo dal 1943');
  const late = targetVersions({ composition, modules: DOC.modules, nation: 'GBR', date: '1944-01-01', researched: new Set(['TECH-MOT-INF']) });
  assert.equal(late['MOD-GBR-INF-1938'], 'MOD-GBR-INF-1943');
  assert.equal(late['MOD-GBR-AT-1938'], 'MOD-GBR-AT-1943');
});

test('nomi delle divisioni nuove: ordinali inglesi e «Armoured»', () => {
  const rules = read('units/modules/raise_rules.json');
  const units = [{ nation: 'GBR', name: '1st Infantry Division' }, { nation: 'GBR', name: '2nd Infantry Division' }];
  assert.equal(divisionName(rules, 'GBR', 'infantry', units), '3rd Infantry Division');
  assert.equal(divisionName(rules, 'GBR', 'armored', [{ nation: 'GBR', name: '1st Armoured Division' }]), '2nd Armoured Division');
});

test('ogni modello di divisione britannico rispetta i limiti dell\'editor alla sua data (6 reggimenti di carri solo per il Regno Unito)', async () => {
  const { designProblems } = await import('../src/data/modules.js');
  const rules = read('units/modules/editor_rules.json');
  const researched = new Set(read('research/technologies.json').technologies.map((t) => t.id));
  for (const c of DOC.compositions) assert.deepEqual(designProblems(c.modules, { modules: DOC.modules, rules, nation: 'GBR', date: c.activeFrom, researched }), [], c.templateId);
  const six = [['MOD-GBR-LT-REGT', 6], ['MOD-GBR-MOT-INF', 2], ['MOD-GBR-SVC', 1]];
  assert.ok(designProblems(six.map(([id, n]) => [id.replace('GBR', 'GBR'), n]), { modules: DOC.modules, rules, nation: 'DEU', date: '1940-01-01', researched }).some((x) => /tank: 6 \(massimo 4\)/.test(x)), 'le altre nazioni restano a 4');
});
