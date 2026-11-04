// Combattimento urbano: difesa rafforzata, mezzi penalizzati, imboscate anche quando l'attaccante vince la giornata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBattleDay, resolveUrbanBattleDay, divisionPower, urbanFactor, URBAN_AMBUSH_ATTACKER, URBAN_DEFENSE } from '../src/rules/combat.js';

const inf = (id, effective = 10000, planned = 10000) => ({ id, category: 'infantry', effective, planned });
const arm = (id, effective = 10000, planned = 10000) => ({ id, category: 'armored', effective, planned });

test('in città la difesa vale più che in campo aperto: l\'attaccante perde di più, il difensore meno', () => {
  const A = [inf('a')]; const D = [inf('d')];
  const open = resolveBattleDay({ attackers: A, defenders: D });
  const urban = resolveUrbanBattleDay({ attackers: A, defenders: D });
  assert.ok(urban.attackerLoss.a > open.attackerLoss.a, 'attaccante: più perdite in città');
  assert.ok(urban.defenderLoss.d < open.defenderLoss.d + Math.round(10000 * URBAN_AMBUSH_ATTACKER), 'difensore: lo scontro pesa meno, a parte le imboscate');
  assert.ok(urban.attackerPower < open.attackerPower || urban.defenderPower > open.defenderPower, 'la difesa sale di potenza');
});

test('i mezzi corazzati perdono potenza in città: il fattore urbano è sotto quello di campo', () => {
  assert.ok(urbanFactor('armored') < divisionPower({ category: 'armored', effective: 1 }));
  assert.ok(divisionPower({ category: 'armored', effective: 1000, factor: urbanFactor('armored') }) < divisionPower({ category: 'armored', effective: 1000 }));
  assert.equal(divisionPower({ category: 'infantry', effective: 500 }), divisionPower({ category: 'infantry', effective: 500, factor: 1 }));
});

test('imboscate: l\'attaccante perde uomini anche quando vince la giornata, con forze molto superiori', () => {
  const r = resolveUrbanBattleDay({ attackers: [inf('a', 50000, 50000)], defenders: [inf('d', 100, 100)] });
  assert.ok(r.attackerLoss.a >= Math.round(50000 * URBAN_AMBUSH_ATTACKER), 'quota di imboscata minima');
  assert.ok(r.defenderLoss.d <= 100, 'il difensore non perde più di quanto ha');
});

test('le perdite non superano mai gli effettivi e il risultato è deterministico', () => {
  const A = [arm('a', 3, 3), inf('b', 0, 10)]; const D = [inf('d', 7, 7)];
  const r1 = resolveUrbanBattleDay({ attackers: A, defenders: D, defenseMultiplier: 1.5 });
  const r2 = resolveUrbanBattleDay({ attackers: A, defenders: D, defenseMultiplier: 1.5 });
  assert.deepEqual(r1, r2);
  assert.ok(r1.attackerLoss.a <= 3 && r1.attackerLoss.b === 0);
  assert.ok(r1.defenderLoss.d <= 7);
});

test('una parte ridotta sotto la soglia si ritira anche dopo l\'imboscata', () => {
  const r = resolveUrbanBattleDay({ attackers: [inf('a', 2600, 10000)], defenders: [inf('d', 10000, 10000)] });
  assert.equal(r.attackerRetreats, true);
  assert.ok(URBAN_DEFENSE > 1);
});
