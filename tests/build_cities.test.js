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
