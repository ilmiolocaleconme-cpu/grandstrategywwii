import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { featureAreaKm2 } from '../src/map/geo.js';
import { buildAdjacency } from '../src/data/adjacency.js';
import { readFileSync } from 'node:fs';

// Stato Libero d'Irlanda (IRL, 5 province storiche) e Islanda (ISL, una provincia).
// Natural Earth 10m admin-1 (confini attuali), raster 0,002°; qualità hypothesis. Soglie larghe.
const provinces = await loadProvinces();
const index = buildProvinceIndex(provinces);
const byOwner = (o) => provinces.features.filter((f) => f.properties.owner === o);
const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);
const km2 = (id) => featureAreaKm2(provinces.features.find((f) => f.properties.id === id));

test('Irlanda: 5 province storiche con id, proprietario e qualità corretti', () => {
  const ids = byOwner('IRL').map((f) => f.properties.id).sort();
  assert.deepEqual(ids, ['P_IRL_CONNACHT', 'P_IRL_DUBLINO', 'P_IRL_LEINSTER', 'P_IRL_MUNSTER', 'P_IRL_ULSTER']);
  for (const f of byOwner('IRL')) {
    assert.equal(f.properties.borderQuality, 'hypothesis');
    assert.ok(f.properties.derivedFromNe.length >= 3 || f.properties.id.endsWith('CONNACHT'));
    assert.ok(f.properties.notes.length > 20);
  }
});

test('Irlanda: aree plausibili (Stato Libero ~70.000 km², Irlanda del Nord esclusa)', () => {
  const total = byOwner('IRL').reduce((a, f) => a + featureAreaKm2(f), 0);
  assert.ok(total > 66000 && total < 74000, `totale ${Math.round(total)} km²`);
  assert.ok(km2('P_IRL_DUBLINO') > 800 && km2('P_IRL_DUBLINO') < 1300, String(Math.round(km2('P_IRL_DUBLINO'))));
  assert.ok(km2('P_IRL_MUNSTER') > 22000 && km2('P_IRL_MUNSTER') < 26500);
  assert.ok(km2('P_IRL_CONNACHT') > 15500 && km2('P_IRL_CONNACHT') < 19500);
  assert.ok(km2('P_IRL_ULSTER') > 7000 && km2('P_IRL_ULSTER') < 9000);
  assert.ok(km2('P_IRL_LEINSTER') > 17500 && km2('P_IRL_LEINSTER') < 21500);
});

test('Irlanda: città note nella provincia giusta, Belfast resta nel Regno Unito', () => {
  const where = { P_IRL_DUBLINO: [-6.26, 53.35], P_IRL_MUNSTER: [-8.47, 51.9] /* Cork */, P_IRL_CONNACHT: [-9.3, 53.85] /* Castlebar */, P_IRL_ULSTER: [-7.73, 55.0] /* Donegal */, P_IRL_LEINSTER: [-7.25, 52.65] /* Kilkenny */ };
  for (const [id, [lon, lat]] of Object.entries(where)) assert.deepEqual(at(lon, lat), [id], `(${lon}, ${lat})`);
  assert.deepEqual(at(-5.93, 54.6), ['P_GBR_ANTRIM']);
  assert.deepEqual(at(-7.32, 54.99), ['P_GBR_LONDONDERRY']);
});

test('Irlanda: confine con l\'Irlanda del Nord senza sovrapposizioni né buchi evidenti (campionamento a 0,02°)', () => {
  let overlap = 0;
  for (let lat = 51.3; lat < 55.5; lat += 0.02) for (let lon = -10.8; lon < -5.3; lon += 0.02) if (at(lon, lat).length > 1) overlap += 1;
  assert.ok(overlap <= 6, `${overlap} celle sovrapposte`); // il confine è agganciato ai vertici di GBR, scarti fino a ~400 m
});

test('Irlanda: adiacente per terra alle sole province dell\'Irlanda del Nord e tra di loro', () => {
  const g = buildAdjacency(provinces, JSON.parse(readFileSync(new URL('../data/adjacency.json', import.meta.url), 'utf8')));
  assert.ok(g.areAdjacent('P_IRL_ULSTER', 'P_GBR_LONDONDERRY') || g.areAdjacent('P_IRL_ULSTER', 'P_GBR_TYRONE'));
  assert.ok(g.areAdjacent('P_IRL_DUBLINO', 'P_IRL_LEINSTER'));
  assert.ok(g.areAdjacent('P_IRL_MUNSTER', 'P_IRL_LEINSTER') && g.areAdjacent('P_IRL_MUNSTER', 'P_IRL_CONNACHT'));
  for (const f of byOwner('IRL')) for (const n of g.neighbors(f.properties.id)) {
    assert.ok(n.startsWith('P_IRL_') || /ANTRIM|ARMAGH|DOWN|FERMANAGH|LONDONDERRY|TYRONE/.test(n), `${f.properties.id} -> ${n}`);
  }
  // Dublino e Munster non toccano l'Irlanda del Nord
  for (const id of ['P_IRL_DUBLINO', 'P_IRL_MUNSTER']) assert.ok(!g.neighbors(id).some((n) => n.startsWith('P_GBR_')), id);
});

test('Islanda: una sola provincia, area plausibile (~103.000 km²), Reykjavík e Akureyri dentro', () => {
  const isl = byOwner('ISL');
  assert.equal(isl.length, 1);
  assert.equal(isl[0].properties.id, 'P_ISL_ISLANDA');
  const a = featureAreaKm2(isl[0]);
  assert.ok(a > 98000 && a < 108000, `${Math.round(a)} km²`);
  assert.deepEqual(at(-21.5, 64.2), ['P_ISL_ISLANDA']); // vicino a Reykjavík, subito all'interno
  assert.deepEqual(at(-18.2, 65.5), ['P_ISL_ISLANDA']); // Akureyri (zona)
  assert.deepEqual(at(-30, 64), []);
});
