// Battaglioni USA (21/11/2026, schema unico «come Germania e URSS»): validità, taratura sul vecchio CSV, versioni 1942-43, nomi inglesi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateModules, sumComposition, templateFromComposition, targetVersions } from '../src/data/modules.js';
import { divisionName, englishOrdinal } from '../src/game/raiseState.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
const DOC = read('units/modules/modules_usa.json');
const comp = (id) => DOC.compositions.find((c) => c.templateId === id);
const sum = (id) => sumComposition(DOC.modules, comp(id).modules);

test('modules_usa.json è valido e i template generati coincidono con i file', () => {
  assert.deepEqual(validateModules(DOC), []);
  for (const c of DOC.compositions) {
    const file = read(`units/templates/${c.file}`);
    assert.deepEqual(file, JSON.parse(JSON.stringify(templateFromComposition(DOC, c))), c.file);
  }
});

test('divisione triangolare 1940 e corazzata 1940 tarate sui numeri del vecchio CSV (stessi id dei template)', () => {
  const inf = sum('TPL-USA-INF-1940');
  assert.equal(inf.men, 15245);
  assert.equal(inf.equipment['ART-USA-HOW105-1940'], 36);
  assert.equal(inf.equipment['ART-USA-HOW155-1940'], 12);
  assert.equal(inf.equipment['ART-USA-AT37-1940'], 60);
  assert.equal(inf.equipment['ART-USA-MORTAR81-1940'], 36);
  const arm = sum('TPL-USA-ARM-1940');
  assert.equal(arm.men, 12697);
  assert.equal(arm.equipment['TNK-USA-LIGHT-TANK-1940'], 273);
  assert.equal(arm.equipment['TNK-USA-MEDIUM-TANK-1940'], 108);
  assert.equal(arm.equipment['ART-USA-HOW105-ARM-1940'], 24);
  assert.equal(arm.equipment['ART-USA-AT37-ARM-1940'], 68);
});

test('la divisione quaternaria del 1936 ha il fucile M1903, quella del 1940 il Garand', () => {
  assert.ok(sum('TPL-USA-INF-1936').equipment['INW-USA-RIFLE-1940'] > 10000);
  assert.equal(sum('TPL-USA-INF-1936').equipment['INW-USA-GARAND'], undefined);
  assert.ok(sum('TPL-USA-INF-1940').equipment['INW-USA-GARAND'] > 6000);
});

test('versioni 1942-43: arrivano solo con data, tecnologia e armi producibili', () => {
  const c = comp('TPL-USA-INF-1940').modules.map(([id, count]) => ({ id, count }));
  const techs = new Set(['TECH-MOT-INF', 'TECH-INF-SEMI1', 'TECH-INF-SELECT', 'TECH-INF-ATROCKET']);
  const v = (date, producible = () => true) => targetVersions({ composition: c, modules: DOC.modules, nation: 'USA', date, researched: techs, producible });
  assert.deepEqual(v('1942-05-31'), {});
  assert.deepEqual(Object.keys(v('1942-06-01')).sort(), ['MOD-USA-ENG-1940', 'MOD-USA-FA105', 'MOD-USA-FA155', 'MOD-USA-SVC-1940']);
  assert.equal(v('1943-03-01')['MOD-USA-INF-1940'], 'MOD-USA-INF-1943');
  assert.equal(v('1943-03-01', (id) => id !== 'GL-USA-BAZOOKA')['MOD-USA-INF-1940'], undefined, 'senza bazooka producibile il battaglione resta del 1940');
});

test('nomi delle divisioni nuove: ordinali inglesi', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(englishOrdinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  const rules = read('units/modules/raise_rules.json');
  const units = [{ nation: 'USA', name: '1st Infantry Division' }, { nation: 'USA', name: '2nd Infantry Division' }, { nation: 'USA', name: '3rd Infantry Division' }];
  assert.equal(divisionName(rules, 'USA', 'infantry', units), '4th Infantry Division');
  assert.equal(divisionName(rules, 'DEU', 'infantry', []), '1. Infanterie-Division', 'le altre nazioni non cambiano');
});
