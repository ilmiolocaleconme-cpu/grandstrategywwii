import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../src/data/retry.js';

const noSleep = { sleep: async () => {} };
test('riprova dopo un errore e restituisce il risultato', async () => {
  let n = 0;
  const r = await withRetry(async () => { if (++n < 3) throw new Error('rete'); return 'ok'; }, noSleep);
  assert.equal(r, 'ok'); assert.equal(n, 3);
});
test('dopo i tentativi propaga l\'ultimo errore, senza ripetere all\'infinito', async () => {
  let n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new Error(`e${n}`); }, { ...noSleep, tries: 3 }), /e3/);
  assert.equal(n, 3);
});
test('attese crescenti tra i tentativi', async () => {
  const waits = [];
  await assert.rejects(withRetry(async () => { throw new Error('x'); }, { tries: 3, delayMs: 100, sleep: async (ms) => waits.push(ms) }));
  assert.deepEqual(waits, [100, 200]);
});
