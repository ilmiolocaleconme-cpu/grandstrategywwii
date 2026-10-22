// scripts/build-cities.js: cella di competenza di una città (cerchio massimo ritagliato dalle celle di Voronoi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellOf } from '../scripts/build-cities.js';
import { pointInPolygon } from '../src/data/polyclip.js';

test('cellOf: senza vicini è il cerchio, con un vicino a est si ferma a metà strada', () => {
  const c = { lon: 10, lat: 50 };
  const solo = cellOf(c, 50, []);
  assert.ok(pointInPolygon(10.1, 50, solo));
  const vicino = { lon: 10.2, lat: 50 };
  const cella = cellOf(c, 50, [vicino]);
  assert.ok(pointInPolygon(10.05, 50, cella), 'prima della metà');
  assert.equal(pointInPolygon(10.15, 50, cella), false, 'oltre la metà strada verso il vicino');
  assert.ok(pointInPolygon(9.95, 50, cella), 'dalla parte opposta resta');
});

test('cellOf: due città si dividono lo spazio senza sovrapporsi', () => {
  const a = { lon: 6.8, lat: 51.4 };
  const b = { lon: 6.9, lat: 51.3 };
  const ca = cellOf(a, 40, [b]);
  const cb = cellOf(b, 40, [a]);
  for (let x = 6.5; x < 7.2; x += 0.01) for (let y = 51.0; y < 51.7; y += 0.01) {
    assert.equal(pointInPolygon(x, y, ca) && pointInPolygon(x, y, cb), false, `${x},${y}`);
  }
});

import { cleanRing, cleanPolygon, URBAN_TOLERANCE_DEG } from '../scripts/build-cities.js';

test('cleanRing: toglie le piccole dentellature, tiene gli angoli veri e l\'anello resta chiuso', () => {
  const dente = [[0, 0], [1, 0], [2, 0.0005], [3, 0], [4, 0], [4, 4], [0, 4], [0, 0]]; // dentellatura di 0,0005° sul lato sud
  const out = cleanRing(dente);
  assert.deepEqual(out[0], out[out.length - 1]);
  assert.ok(out.length < dente.length);
  for (const angolo of [[0, 0], [4, 0], [4, 4], [0, 4]]) assert.ok(out.some((p) => p[0] === angolo[0] && p[1] === angolo[1]), `angolo ${angolo}`);
});

test('cleanRing: un anello più piccolo della tolleranza sparisce, uno già semplice resta uguale', () => {
  const minuscolo = [[0, 0], [0.001, 0], [0.001, 0.001], [0.0005, 0.0015], [0, 0.001], [0, 0]];
  assert.equal(cleanRing(minuscolo, URBAN_TOLERANCE_DEG * 5), null);
  const quadrato = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  assert.deepEqual(cleanRing(quadrato), quadrato);
});

test('cleanPolygon: i buchi spariscono se troppo piccoli, l\'anello esterno no', () => {
  const ext = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  const buco = [[1, 1], [1.001, 1], [1.001, 1.001], [1.0005, 1.0015], [1, 1.001], [1, 1]];
  assert.equal(cleanPolygon([ext, buco], URBAN_TOLERANCE_DEG * 5).length, 1);
});
