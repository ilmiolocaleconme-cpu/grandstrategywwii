// Qualità degli equipaggi per nazione e periodo (23/11/2026, scelta A dell'utente): fattore di potenza in battaglia, anche negativo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCrewQuality, crewQualityBonus } from '../src/rules/crewQuality.js';
import { powerOfUnit } from '../src/game/theaterPlan.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/crew_quality.json');
const nationIds = json('nations.json').map((n) => n.id);

test('file valido; il validatore trova periodi fuori ordine e valori eccessivi', () => {
  assert.deepEqual(validateCrewQuality(doc, nationIds), []);
  const bad = structuredClone(doc);
  bad.nations.DEU[1].from = '1935-01-01';
  bad.nations.USSR[0].value = -0.3;
  bad.nations.XXX = [{ from: '1936-01-01', value: 0 }];
  const e = validateCrewQuality(bad, nationIds);
  assert.ok(e.some((x) => /DEU periodi non in ordine/.test(x)));
  assert.ok(e.some((x) => /USSR 1936-01-01 valore -0.3/.test(x)));
  assert.ok(e.some((x) => /XXX non è una nazione/.test(x)));
});

test('valori per periodo: Germania +15% e URSS −10% nel 1941 per i corazzati; metà per la fanteria; 0 per chi non è nel file', () => {
  assert.equal(crewQualityBonus(doc, 'DEU', '1941-06-22', 'armored'), 0.15);
  assert.equal(crewQualityBonus(doc, 'USSR', '1941-06-22', 'armored'), -0.1);
  assert.equal(crewQualityBonus(doc, 'DEU', '1941-06-22', 'infantry'), 0.075);
  assert.equal(crewQualityBonus(doc, 'DEU', '1941-06-22', 'motorized'), 0.1125);
  assert.equal(crewQualityBonus(doc, 'USSR', '1943-08-01', 'armored'), 0, 'l\'Armata Rossa recupera');
  assert.equal(crewQualityBonus(doc, 'DEU', '1944-08-01', 'armored'), 0.05);
  assert.equal(crewQualityBonus(doc, 'POL', '1939-09-01', 'armored'), 0);
  assert.equal(crewQualityBonus(doc, 'DEU', null, 'armored'), 0);
});

test('in battaglia è un fattore della potenza, anche negativo (a differenza del bonus dei fucili)', () => {
  const state = { date: '1941-07-01', forces: { divisions: { A: { items: { 'manpower.war': { planned: 10000, effective: 10000 } } } } } };
  const unit = { id: 'A', nation: 'USSR', category: 'armored' };
  const ctx = { battleCfg: json('units/battle_v2.json'), conditionOf: () => ({ experience: 50 }) };
  const base = powerOfUnit(state, unit, ctx);
  const weak = powerOfUnit(state, unit, { ...ctx, crewFactor: (s, u) => 1 + crewQualityBonus(doc, u.nation, s.date, u.category) });
  assert.ok(base > 0);
  assert.ok(Math.abs(weak / base - 0.9) < 1e-9, `${weak} / ${base}`);
});
