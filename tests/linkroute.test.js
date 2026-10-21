// Instradamento dei collegamenti (src/data/linkroute.js): dritto, un punto sul confine, griglia, sopra altre province, mare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridRoute, legInside, polylineKm, pullString, routeLink } from '../src/data/linkroute.js';

const A = 0; const B = 1; const C = 2;
const insideAll = (coords, provAt, allowed) => coords.slice(1).every((q, i) => legInside(coords[i], q, provAt, allowed));

test('retta: due province piene, il collegamento resta dritto', () => {
  const provAt = (x) => (x < 5 ? A : B);
  const r = routeLink({ a: [1, 5], b: [9, 5], pa: A, pb: B, provAt, border: [[5, 5]], bbox: [0, 0, 10, 10] });
  assert.equal(r.how, 'straight');
  assert.equal(r.coords.length, 2);
});

test('un punto sul confine condiviso: la retta taglierebbe il mare, la curva no', () => {
  // A è un angolo (x < 5 oppure y < 2), B sta a destra; il mare occupa il riquadro 2 < x < 9, 3 < y < 7 solo dentro B
  const sea = (x, y) => x > 5 && x < 9 && y > 3 && y < 7;
  const provAt = (x, y) => (sea(x, y) ? -1 : x < 5 ? A : B);
  const straight = legInside([1, 5], [9.5, 5], provAt, new Set([A, B]));
  assert.equal(straight, false);
  const r = routeLink({ a: [1, 5], b: [9.5, 8.5], pa: A, pb: B, provAt, border: [[5, 5], [5, 9]], bbox: [0, 0, 10, 10] });
  assert.ok(['bend', 'grid'].includes(r.how), r.how);
  assert.ok(insideAll(r.coords, provAt, new Set([A, B])), 'ogni tratto sta nelle due province');
});

test('griglia: gira intorno a un golfo e il percorso tirato ha pochi punti', () => {
  const sea = (x, y) => x > 5 && x < 9 && y > 3 && y < 7;
  const provAt = (x, y) => (sea(x, y) ? -1 : x < 5 ? A : B);
  const r = routeLink({ a: [1, 5], b: [9.5, 5], pa: A, pb: B, provAt, border: [[5, 5]], bbox: [0, 0, 10, 10] });
  assert.equal(r.how, 'grid');
  assert.ok(r.coords.length >= 3 && r.coords.length <= 8, `${r.coords.length} punti`);
  assert.ok(insideAll(r.coords, provAt, new Set([A, B])));
  assert.ok(polylineKm(r.coords) > polylineKm([[1, 5], [9.5, 5]]), 'più lungo della retta');
  assert.deepEqual(r.coords[0], [1, 5]);
  assert.deepEqual(r.coords.at(-1), [9.5, 5]);
  const path = gridRoute([1, 5], [9.5, 5], provAt, new Set([A, B]), [0, 0, 10, 10]);
  assert.ok(pullString(path, provAt, new Set([A, B])).length <= path.length);
});

test('sopra un\'altra provincia: via terra ma passando da una terza (sponde, enclave)', () => {
  const provAt = (x) => (x < 5 ? A : x < 10 ? C : B);
  const r = routeLink({ a: [1, 5], b: [14, 5], pa: A, pb: B, provAt, border: [], bbox: [0, 0, 15, 10] });
  assert.equal(r.how, 'third');
  assert.ok(insideAll(r.coords, provAt, (v) => v >= 0));
});

test('mare: nessun percorso via terra, tratta marittima dritta', () => {
  const provAt = (x) => (x < 5 ? A : x > 10 ? B : -1);
  const r = routeLink({ a: [1, 5], b: [14, 5], pa: A, pb: B, provAt, border: [], bbox: [0, 0, 15, 10] });
  assert.equal(r.how, 'sea');
  assert.deepEqual(r.coords, [[1, 5], [14, 5]]);
});

test('lunghezza di una polilinea e legInside con funzione', () => {
  assert.ok(Math.abs(polylineKm([[0, 0], [0, 1]]) - 111.2) < 1);
  assert.equal(legInside([0, 0], [3, 0], (x) => (x < 1.5 ? 1 : 2), (v) => v === 1), false);
  assert.equal(legInside([0, 0], [3, 0], () => 7, new Set([7])), true);
});
