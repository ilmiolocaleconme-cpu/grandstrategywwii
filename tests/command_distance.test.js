// Distanza dal comando (ipotesi di bilanciamento approvate: 300 km, -1/giorno, tetto 20, recupero di 1/giorno).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextPenalty, applyDistancePenalties, isFarFromCommand, COMMAND_PENALTY_CAP } from '../src/rules/commandDistance.js';
import { conditionOf, validateConditionState, createConditionState } from '../src/rules/divisionCondition.js';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../data/units/condition_config.json', import.meta.url), 'utf8'));

test('soglia: oltre 300 km è lontano, a 300 no', () => {
  assert.equal(isFarFromCommand(300), false);
  assert.equal(isFarFromCommand(300.1), true);
});

test('penalità: sale di 1 al giorno lontano, tetto 20; scende di 1 al giorno vicino (recupero)', () => {
  assert.equal(nextPenalty(0, true), 1);
  assert.equal(nextPenalty(COMMAND_PENALTY_CAP, true), COMMAND_PENALTY_CAP);
  assert.equal(nextPenalty(5, false), 4);
  assert.equal(nextPenalty(0, false), 0);
});

test('effetto sulla prontezza: la penalità si sottrae e si recupera, senza toccare il valore memorizzato', () => {
  const conditions = applyDistancePenalties(createConditionState(), [{ unitId: 'D1', far: true, base: { experience: 45, morale: 70, readiness: 80, policy: 'normal', isNew: false } }]);
  assert.equal(conditions.byUnit.D1.distancePenalty, 1);
  assert.equal(conditionOf(conditions, 'D1', cfg, 'ITA').readiness, conditionOf(createConditionState(), 'D1', cfg, 'ITA').readiness - 1);
  const back = applyDistancePenalties(conditions, [{ unitId: 'D1', far: false }]);
  assert.equal(back.byUnit.D1.distancePenalty, 0, 'recupero');
});

test('validazione: la penalità deve essere un intero 0–20', () => {
  const ok = { schema: 'conditions-v1', byUnit: { D1: { experience: 45, morale: 70, readiness: 80, policy: 'normal', isNew: false, distancePenalty: 3 } } };
  assert.deepEqual(validateConditionState(ok), []);
  const bad = structuredClone(ok); bad.byUnit.D1.distancePenalty = 25;
  assert.ok(validateConditionState(bad).some((e) => /distancePenalty/.test(e)));
});

test('applicare senza cambiamenti non modifica lo stato', () => {
  const c = createConditionState();
  const r = applyDistancePenalties(c, [{ unitId: 'D9', far: false }]);
  assert.deepEqual(r.byUnit, {}, 'nessuna voce creata per una divisione già a 0 e vicina');
});
