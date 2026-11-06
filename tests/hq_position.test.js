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

import { commandsByProvince } from '../src/rules/hqPosition.js';

test('comandi per provincia: un comando mosso compare dove si trova, uno fermo con la stima, uno senza posizione non compare', () => {
  const cmds = [
    { id: 'C1', name: 'I Corpo', echelon: 'command', commandLevel: 'corps' },
    { id: 'C2', name: 'II Corpo', echelon: 'command', commandLevel: 'corps' },
    { id: 'C3', name: 'III Corpo', echelon: 'command', commandLevel: 'corps' },
  ];
  const byId = new Map([...cmds, ...['D1', 'D2'].map((id) => ({ id, echelon: 'division', category: 'infantry' }))].map((u) => [u.id, u]));
  const orbat = { links: { D1: { parent: 'C2' }, D2: { parent: 'C2' } } };
  const pos = { C1: 'P_MOVED', D1: 'P_X', D2: 'P_X' }; // C1 mosso; C2 stimata in P_X; C3 senza divisioni
  const out = commandsByProvince({ commands: cmds, orbat, unitsById: byId, positionOf: (id) => pos[id] ?? null, isActive: () => true });
  assert.deepEqual(out.get('P_MOVED'), [{ id: 'C1', name: 'I Corpo', estimated: false }]);
  assert.equal(out.get('P_X')[0].id, 'C2');
  assert.equal(out.get('P_X')[0].estimated, true);
  assert.equal([...out.values()].flat().some((r) => r.id === 'C3'), false, 'senza posizione non compare');
});

test('comandi per provincia: i comandi non attivi non compaiono', () => {
  const cmds = [{ id: 'C1', name: 'I Corpo', echelon: 'command', commandLevel: 'corps' }];
  const out = commandsByProvince({ commands: cmds, orbat: { links: {} }, unitsById: new Map(), positionOf: () => 'P_X', isActive: () => false });
  assert.equal(out.size, 0);
});

import { mergeCommandsIntoProvinceUnits } from '../src/rules/hqPosition.js';

test('mappa: un comando stimato o mosso entra nel gruppo della sua provincia come gli altri; nessun doppione', () => {
  const units = new Map([
    ['D1', { id: 'D1', name: 'Div 1', nation: 'GER', echelon: 'division', category: 'infantry' }],
    ['C1', { id: 'C1', name: 'I Corpo', nation: 'GER', echelon: 'command', category: 'command', commandLevel: 'corps' }],
    ['C9', { id: 'C9', name: 'Corpo francese', nation: 'FRA', echelon: 'command', category: 'command', commandLevel: 'army' }],
  ]);
  const base = { P_X: [{ nation: 'GER', divisions: 1, commands: 0, units: [{ id: 'D1', name: 'Div 1', echelon: 'division', category: 'infantry', commandLevel: null }] }] };
  const byProv = new Map([['P_X', [{ id: 'C1', name: 'I Corpo', estimated: true }, { id: 'C9', name: 'Corpo francese', estimated: false }]]]);
  const m = mergeCommandsIntoProvinceUnits(base, byProv, units);
  const ger = m.P_X.find((g) => g.nation === 'GER');
  assert.equal(ger.divisions, 1, 'le divisioni restano');
  assert.equal(ger.commands, 1, 'il corpo conta come comando');
  assert.ok(ger.units.some((u) => u.id === 'C1' && u.commandLevel === 'corps'));
  assert.equal(m.P_X.find((g) => g.nation === 'FRA').commands, 1, 'nazione diversa: gruppo a parte');
  // doppione: C1 già nella dislocazione
  const dup = mergeCommandsIntoProvinceUnits({ P_X: [{ nation: 'GER', divisions: 0, commands: 1, units: [{ id: 'C1', name: 'I Corpo', echelon: 'command', category: 'command', commandLevel: 'corps' }] }] }, byProv, units);
  assert.equal(dup.P_X.find((g) => g.nation === 'GER').commands, 1, 'nessun doppione');
  assert.equal(base.P_X[0].commands, 0, 'la base non cambia');
});
