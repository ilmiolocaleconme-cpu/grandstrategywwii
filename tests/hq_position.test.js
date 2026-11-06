// Posizione stimata dei comandi senza posizione (decisione B): maggioranza delle divisioni sottostanti, mai presentata come dato certo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatedHqProvince } from '../src/rules/hqPosition.js';

const unitsById = new Map([
  ['C1', { id: 'C1', echelon: 'command', category: 'command', commandLevel: 'corps' }],
  ['D1', { id: 'D1', echelon: 'division', category: 'infantry' }],
  ['D2', { id: 'D2', echelon: 'division', category: 'infantry' }],
  ['D3', { id: 'D3', echelon: 'division', category: 'armored' }],
  ['S1', { id: 'S1', echelon: 'command', category: 'support' }],
]);
const orbat = { links: { D1: { parent: 'C1' }, D2: { parent: 'C1' }, D3: { parent: 'C1' }, S1: { parent: 'C1' } } };
const posOf = (pos) => (id) => pos[id] ?? null;

test('stima: la provincia con più divisioni sottostanti, etichettata come stimata', () => {
  const e = estimatedHqProvince({ hqId: 'C1', orbat, unitsById, positionOf: posOf({ D1: 'P_B', D2: 'P_A', D3: 'P_B' }) });
  assert.deepEqual(e, { province: 'P_B', inProvince: 2, basedOn: 3, source: 'stimata' });
});

test('parità: vince l\'id più piccolo, deterministico', () => {
  const e = estimatedHqProvince({ hqId: 'C1', orbat, unitsById, positionOf: posOf({ D1: 'P_Z', D2: 'P_A' }) });
  assert.equal(e.province, 'P_A');
});

test('nessuna divisione con posizione: nessuna stima', () => {
  assert.equal(estimatedHqProvince({ hqId: 'C1', orbat, unitsById, positionOf: posOf({}) }), null);
});

test('sottoposti che non sono divisioni (es. supporto) non contano', () => {
  const e = estimatedHqProvince({ hqId: 'C1', orbat, unitsById, positionOf: posOf({ S1: 'P_X' }) });
  assert.equal(e, null);
});
