// Vista degli incarichi: segni sulla mappa e schede (funzioni pure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { theaterMarks, describeAssignment, MARK_STYLES } from '../src/ui/theaterView.js';
import { createTheaters, createAssignment } from '../src/rules/theater.js';

const colorOf = (n) => `c-${n}`;

test('segni: occupate < incarichi del giocatore < province in scelta; incarichi altrui ignorati', () => {
  let th = createAssignment(createTheaters(), { nation: 'GER', kind: 'attack', provinces: ['B', 'C'], units: ['G1'], date: 'd' }).state;
  th = createAssignment(th, { nation: 'FRA', kind: 'defend', provinces: ['Z'], units: ['F1'], date: 'd' }).state;
  const state = { player: 'GER', theaters: th, provinces: { C: { controller: 'GER', occupation: 'occupied' }, Q: { controller: 'FRA', occupation: 'occupied' }, W: { controller: null } } };
  const m = theaterMarks({ state, pick: ['C', 'D'], colorOf });
  assert.equal(m.B, MARK_STYLES.attack);
  assert.equal(m.C, MARK_STYLES.pick, 'la scelta in corso vince');
  assert.equal(m.D, MARK_STYLES.pick);
  assert.equal(m.Q.color, 'c-FRA');
  assert.equal(m.Z, undefined, 'incarico di un\'altra nazione non segnato');
  assert.equal(m.W, undefined);
  assert.deepEqual(theaterMarks({ state: { player: 'GER' }, colorOf }), {});
});

test('scheda incarico: obiettivi con stato, unità con posizione e uomini', () => {
  const a = createAssignment(createTheaters(), { nation: 'GER', kind: 'attack', provinces: ['B', 'C'], units: ['G1'], date: '1936-01-01' }).state.list['TH-0001'];
  const card = describeAssignment(a, {
    net: { name: (p) => `P${p}` }, positionOf: () => 'A', controllerOf: (p) => (p === 'B' ? 'GER' : 'FRA'),
    unitName: (u) => `U${u}`, effectiveOf: () => 9000,
  });
  assert.equal(card.kindLabel, 'Attacco');
  assert.equal(card.taken, 1);
  assert.deepEqual(card.objectives.map((o) => o.done), [true, false]);
  assert.deepEqual(card.units, [{ id: 'G1', name: 'UG1', at: 'PA', effective: 9000 }]);
  const d = describeAssignment({ ...a, kind: 'defend' }, { net: { name: (p) => p }, positionOf: () => null, controllerOf: () => 'GER', unitName: (u) => u, effectiveOf: () => null });
  assert.equal(d.units[0].at, null);
  assert.equal(d.taken, 2);
});
