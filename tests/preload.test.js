import test from 'node:test';
import assert from 'node:assert/strict';
import { preloadProgress, preloadComplete, layerNeedsCover, PRELOAD_GIVE_UP_MS } from '../src/ui/preload.js';

const items = (flags) => flags.map((done, i) => ({ label: `x${i}`, done }));

test('barra: conta i file delle province e i dati delle mappe; totale ignoto finché le province non lo dicono', () => {
  assert.deepEqual(preloadProgress({ done: 0, total: 0 }, items([false, false])), { done: 0, total: 0 });
  assert.deepEqual(preloadProgress({ done: 100, total: 175 }, items([true, false, true, false, false, false, false])), { done: 102, total: 182 });
  assert.deepEqual(preloadProgress({ done: 175, total: 175 }, items([true, true, true, true, true, true, true])), { done: 182, total: 182 });
});

test('apertura: serve tutto, oppure scade il tempo massimo; mai prima delle province', () => {
  assert.equal(preloadComplete({ provincesReady: true, items: items([true, true]), gaveUp: false }), true);
  assert.equal(preloadComplete({ provincesReady: true, items: items([true, false]), gaveUp: false }), false);
  assert.equal(preloadComplete({ provincesReady: true, items: items([true, false]), gaveUp: true }), true);
  assert.equal(preloadComplete({ provincesReady: false, items: items([true, true]), gaveUp: true }), false);
  assert.equal(PRELOAD_GIVE_UP_MS, 30000);
});

test('cambio livello: nessuna copertura se i dati ci sono già, copertura di ripiego se mancano', () => {
  assert.equal(layerNeedsCover('political', { terrain: null, resources: null }), false);
  assert.equal(layerNeedsCover('terrain', { terrain: {}, resources: null }), false);
  assert.equal(layerNeedsCover('terrain', { terrain: null, resources: {} }), true);
  assert.equal(layerNeedsCover('resources', { terrain: {}, resources: { P_X: [] } }), false);
  assert.equal(layerNeedsCover('resources', { terrain: {}, resources: null }), true);
});
