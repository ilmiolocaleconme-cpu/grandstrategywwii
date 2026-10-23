// Controllo del tempo a tre pulsanti (indietro, pausa, avanti): src/game/speed.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SPEED, MIN_SPEED, SPEEDS, initialClock, msPerDay, pressBack, pressForward, pressPause } from '../src/game/speed.js';

const times = (n, f, s) => { let c = s; for (let i = 0; i < n; i += 1) c = f(c); return c; };

test('si parte in pausa a 1×', () => {
  assert.deepEqual(initialClock(), { running: false, speed: 1 });
});

test('avanti: la prima pressione riprende a 1×, la seconda 2×, la terza 3×, poi resta 3×', () => {
  assert.deepEqual(pressForward(initialClock()), { running: true, speed: 1 });
  assert.deepEqual(times(2, pressForward, initialClock()), { running: true, speed: 2 });
  assert.deepEqual(times(3, pressForward, initialClock()), { running: true, speed: 3 });
  assert.deepEqual(times(9, pressForward, initialClock()), { running: true, speed: MAX_SPEED });
});

test('pausa: ferma senza perdere la velocità; premuta di nuovo riprende alla stessa velocità', () => {
  const at3 = times(3, pressForward, initialClock());
  const paused = pressPause(at3);
  assert.deepEqual(paused, { running: false, speed: 3 });
  assert.deepEqual(pressPause(paused), { running: true, speed: 3 });
  assert.deepEqual(pressForward(paused), { running: true, speed: 3 }, 'avanti in pausa riprende, non accelera');
});

test('indietro: scende di una velocità, a 1× mette in pausa, in pausa non fa nulla', () => {
  const at3 = times(3, pressForward, initialClock());
  assert.deepEqual(pressBack(at3), { running: true, speed: 2 });
  assert.deepEqual(times(2, pressBack, at3), { running: true, speed: 1 });
  assert.deepEqual(times(3, pressBack, at3), { running: false, speed: 1 });
  const paused = { running: false, speed: 2 };
  assert.deepEqual(pressBack(paused), paused);
});

test('velocità: tre gradini crescenti, intervallo più corto a velocità più alta', () => {
  assert.equal(MIN_SPEED, 1);
  assert.equal(MAX_SPEED, 3);
  assert.deepEqual(SPEEDS.map((s) => s.id), [1, 2, 3]);
  assert.ok(msPerDay(1) > msPerDay(2) && msPerDay(2) > msPerDay(3));
  assert.throws(() => msPerDay(4), /sconosciuta/);
});
