// Ruota di scelta nazione: ordine, posti visibili, pose e gesto (logica pura; l'aspetto 3D non si prova qui).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWheel, clampIndex, slotPose, startIndex, stepFromDrag, visibleSlots } from '../src/game/nationWheel.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { playableNations } from '../src/game/state.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const names = { A: 'a', B: 'b', C: 'c', D: 'd' };

test('buildWheel segue l\'ordine, scarta id ignoti, segna i bloccati e mette in fondo le scegliibili fuori ordine', () => {
  const w = buildWheel({ order: ['B', 'X', 'A', 'B'], names, playableIds: ['A', 'D'] });
  assert.deepEqual(w.map((e) => e.id), ['B', 'A', 'D']);
  assert.deepEqual(w.map((e) => e.playable), [false, true, true]);
});

test('posti visibili: cinque, con posti vuoti ai bordi della lista', () => {
  assert.deepEqual(visibleSlots(5, 10).map((s) => s.index), [3, 4, 5, 6, 7]);
  assert.deepEqual(visibleSlots(0, 10).map((s) => s.index), [null, null, 0, 1, 2]);
  assert.deepEqual(visibleSlots(9, 10).map((s) => s.index), [7, 8, 9, null, null]);
  assert.equal(clampIndex(-3, 10), 0);
  assert.equal(clampIndex(99, 10), 9);
  assert.equal(startIndex([{ id: 'A' }, { id: 'B' }], 'B'), 1);
  assert.equal(startIndex([{ id: 'A' }], 'Z'), 0);
});

test('pose: il centro sporge e le altre arretrano, simmetriche, oltre i due posti nascoste', () => {
  const c = slotPose(0);
  const p1 = slotPose(1);
  const p2 = slotPose(2);
  assert.ok(c.z > p1.z && p1.z > p2.z);
  assert.ok(c.scale > p1.scale && p1.scale > p2.scale);
  assert.ok(c.opacity > p1.opacity && p1.opacity > p2.opacity);
  assert.equal(slotPose(-1).x, -slotPose(1).x);
  assert.equal(slotPose(-2).rotY, -slotPose(2).rotY);
  assert.equal(slotPose(3).hidden, true);
  assert.equal(c.x, 0);
});

test('gesto: mai più di un posto per volta', () => {
  assert.equal(stepFromDrag(-200), 1);
  assert.equal(stepFromDrag(200), -1);
  assert.equal(stepFromDrag(10), 0);
});

test('data/nation_order.json: ordine voluto, Germania al centro, nessuna bloccata, tutte con bandiera', async () => {
  const file = json('nation_order.json');
  const political = json('political_1936.json');
  const provinces = await loadProvinces();
  const choosable = playableNations(political, provinces.features.map((f) => f.properties.owner)).map((n) => n.id);
  const nm = Object.fromEntries(political.map((e) => [e.id, e.name]));
  const w = buildWheel({ order: file.order, names: nm, playableIds: choosable });
  const mid = startIndex(w, file.start);
  assert.equal(w[mid].id, 'DEU');
  assert.deepEqual(w.slice(mid - 5, mid + 2).map((e) => e.id), ['JPN', 'FRA', 'GBR', 'CAN', 'USA', 'DEU', 'ITA']);
  assert.deepEqual(w.filter((e) => !e.playable).map((e) => e.id).sort(), []);
  assert.equal(new Set(file.order).size, file.order.length, 'nessun doppione');
  for (const id of choosable) assert.ok(file.order.includes(id), `${id} manca dall'ordine`);
  const flags = json('flags.json').flags;
  const desc = json('nation_descriptions.json').descriptions;
  for (const e of w) { assert.ok(flags[e.id], `bandiera di ${e.id}`); assert.ok(e.id in desc, `descrizione di ${e.id}`); }
});
