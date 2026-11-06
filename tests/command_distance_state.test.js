// Sistema giornaliero della distanza e ordine di marcia dei comandi: stessa regola delle divisioni, posizione stimata come partenza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommandDistanceSystem, orderCommandMove } from '../src/game/commandDistanceState.js';
import { createMovementState } from '../src/rules/movement.js';

const cfg = { initial: { existing1936: { experience: 45, morale: 70, readiness: 80, moraleByNation: {} }, newUnit: { experience: 10, morale: 45, readiness: 45 } }, policy: { default: 'normal' } };
const unitsById = new Map([
  ['C1', { id: 'C1', nation: 'GER', echelon: 'command', category: 'command', commandLevel: 'corps' }],
  ['D1', { id: 'D1', nation: 'GER', echelon: 'division', category: 'infantry' }],
  ['D2', { id: 'D2', nation: 'GER', echelon: 'division', category: 'infantry' }],
]);
const orbat = { links: { D1: { parent: 'C1' }, D2: { parent: 'C1' } } };
const initial = new Map([['D1', 'A'], ['D2', 'A']]);
// rete a tre province: A-B-C; km tra A e C = 500 (lontano), A-B = 100 (vicino)
const net = {
  has: (m) => ['A', 'B', 'C'].includes(m), owner: () => 'GER', neighbors: (m) => ({ A: ['B'], B: ['A', 'C'], C: ['B'] })[m] ?? [],
  km: (a, b) => (a === b ? 0 : (new Set([a, b]).has('A') && new Set([a, b]).has('C') ? 500 : 100)),
};
const base = () => ({ date: '1936-01-01', player: 'GER', nations: {}, control: { GER: 'GER' }, war: { pairs: {} }, diplomacy: {}, forces: { divisions: { D1: {}, D2: {} } }, orbat, movement: createMovementState() });

test('sistema giornaliero: divisioni lontane dal comando perdono prontezza; vicine nulla', () => {
  const sys = createCommandDistanceSystem({ net, orbat, unitsById, initial, cfg });
  // comando nella stessa provincia delle divisioni (vicino)
  const near = sys({ ...base(), movement: { ...createMovementState(), positions: { C1: 'A' } } });
  assert.equal(near.conditions, undefined, 'vicino e senza penalità: nessuna voce');
  // comando in C, divisioni in A (lontano)
  const far = sys({ ...base(), movement: { ...createMovementState(), positions: { C1: 'C' } } });
  assert.equal(far.conditions.byUnit.D1.distancePenalty, 1);
  assert.equal(far.conditions.byUnit.D2.distancePenalty, 1);
});

test('sistema giornaliero: senza posizione del comando (né stimata) nessuna penalità', () => {
  const sys = createCommandDistanceSystem({ net, orbat, unitsById, initial: new Map(), cfg });
  const s = sys({ ...base() });
  assert.equal(s.conditions, undefined);
});

test('ordine di marcia del comando: parte dalla posizione stimata e usa il movimento esistente', () => {
  const s = base();
  const r = orderCommandMove(s, { unitId: 'C1', to: 'C', nation: 'GER', net, initial, startProvince: 'A' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.path, ['A', 'B', 'C']);
  assert.ok(r.days > 0);
  assert.equal(r.state.movement.orders.C1.path.at(-1), 'C');
});

test('ordine di marcia: senza partenza nota il comando non si muove', () => {
  const r = orderCommandMove(base(), { unitId: 'C1', to: 'C', nation: 'GER', net, initial, startProvince: null });
  assert.equal(r.ok, false);
});
