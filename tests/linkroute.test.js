// Instradamento dei collegamenti (src/data/linkroute.js): dritto, un punto sul confine, griglia, sopra altre province, mare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COAST_MARGIN_KM, gridRoute, legInside, polylineKm, pullString, routeLink, smoothPath } from '../src/data/linkroute.js';

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
  assert.ok(r.coords.length >= 3 && r.coords.length <= 40, `${r.coords.length} punti (con gli angoli arrotondati)`);
  assert.ok(insideAll(r.coords, provAt, new Set([A, B])));
  assert.ok(polylineKm(r.coords) > polylineKm([[1, 5], [9.5, 5]]), 'più lungo della retta');
  assert.deepEqual(r.coords[0], [1, 5]);
  assert.deepEqual(r.coords.at(-1), [9.5, 5]);
  const path = gridRoute([1, 5], [9.5, 5], provAt, new Set([A, B]), [0, 0, 10, 10]);
  const pulled = pullString(path, provAt, new Set([A, B]));
  assert.ok(pulled.length <= 8 && pulled.length <= path.length, `${pulled.length} punti prima di arrotondare`);
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

test('margine dal mare: una linea a ~1 km dal mare non passa, una a 10 km sì', () => {
  const provAt = (x, y) => (y >= 5 ? -1 : A); // costa lungo y = 5
  const near = [[1, 4.99], [9, 4.99]]; // ≈ 1,1 km dal mare
  const far = [[1, 4.9], [9, 4.9]]; // ≈ 11 km
  assert.equal(legInside(near[0], near[1], provAt, new Set([A])), true, 'senza margine passa');
  assert.equal(legInside(near[0], near[1], provAt, new Set([A]), COAST_MARGIN_KM), false, 'col margine no');
  assert.equal(legInside(far[0], far[1], provAt, new Set([A]), COAST_MARGIN_KM), true);
  // vicino agli estremi (sedi sulla costa) il margine non si pretende
  assert.equal(legInside([1, 4.9995], [1.05, 4.9995], provAt, new Set([A]), COAST_MARGIN_KM), true);
});

test('lungo la costa: il collegamento si sposta dentro terra invece di rasentare il mare', () => {
  const provAt = (x, y) => (y >= 5 ? -1 : x < 5 ? A : B);
  const a = [1, 4.99]; const b = [9, 4.99];
  const r = routeLink({ a, b, pa: A, pb: B, provAt, border: [[5, 4.9], [5, 3]], bbox: [0, 0, 10, 5] });
  assert.notEqual(r.how, 'sea');
  assert.ok(r.coords.length >= 3, 'non è più la retta rasente la costa');
  const maxY = Math.max(...r.coords.slice(1, -1).map((q) => q[1]));
  assert.ok(maxY < 4.97, `il punto più vicino al mare sta a y=${maxY}`);
  assert.deepEqual(r.coords[0], a);
  assert.deepEqual(r.coords.at(-1), b);
  assert.ok(insideAll(r.coords, provAt, new Set([A, B])));
});

test('se la costa è l\'unica strada (lingua di terra stretta), si ripiega sul tracciato rasente', () => {
  const provAt = (x, y) => (y >= 5 || y < 4.98 ? -1 : x < 5 ? A : B); // terra larga ≈ 2 km
  const r = routeLink({ a: [1, 4.99], b: [9, 4.99], pa: A, pb: B, provAt, border: [[5, 4.99]], bbox: [0, 4.9, 10, 5.1] });
  assert.equal(r.how, 'straight');
  assert.equal(r.coords.length, 2);
});

test('smoothPath: arrotonda l\'angolo, tiene fermi gli estremi e non taglia il mare', () => {
  const land = () => A;
  const corner = [[0, 0], [5, 0], [5, 5]];
  const sm = smoothPath(corner, land, new Set([A]));
  assert.ok(sm.length > corner.length, `${sm.length} punti`);
  assert.deepEqual(sm[0], corner[0]);
  assert.deepEqual(sm.at(-1), corner.at(-1));
  assert.ok(insideAll(sm, land, new Set([A])));
  const sea = (x, y) => x > 4 && x < 4.9 && y > 0.02 && y < 1; // un laghetto che occupa ogni possibile taglio dell'angolo
  const provAt = (x, y) => (sea(x, y) ? -1 : A);
  assert.deepEqual(smoothPath(corner, provAt, new Set([A])), corner, 'se il taglio entra nel mare resta l\'angolo');
  assert.deepEqual(smoothPath([[0, 0], [1, 1]], land, new Set([A])), [[0, 0], [1, 1]], 'una retta resta tale');
});
