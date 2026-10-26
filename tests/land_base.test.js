import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const land = JSON.parse(readFileSync(new URL('../data/land_base.json', import.meta.url), 'utf8'));

test('terra di base: schema, poligoni e coordinate valide', () => {
  assert.equal(land.schema, 'land-base-v1');
  assert.ok(land.polygons.length > 500);
  let pts = 0;
  for (const rings of land.polygons) for (const ring of rings) {
    assert.ok(ring.length >= 3);
    for (const [x, y] of ring) { pts += 1; assert.ok(x >= -180 && x <= 180 && y >= -60 && y <= 85, `fuori mondo ${x},${y}`); }
  }
  assert.ok(pts < 40000, `troppi punti: ${pts}`);
});
