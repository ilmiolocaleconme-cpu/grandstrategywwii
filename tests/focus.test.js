import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProvinces } from '../scripts/load-provinces.js';
import { nationBounds, focusView } from '../src/map/focus.js';
import { HOME_BOUNDS, WORLD_W, MAX_K, minZoomToFit } from '../src/map/geo.js';
import { layoutOf, affineOf } from '../src/map/canvasView.js';

const PAD = HOME_BOUNDS.w * 0.02;
const VB = { x: HOME_BOUNDS.x - PAD, y: HOME_BOUNDS.y - PAD, w: HOME_BOUNDS.w + 2 * PAD, h: HOME_BOUNDS.h + 2 * PAD };
const COS0 = WORLD_W / 360;
const provinces = await loadProvinces();

test('nationBounds: il nucleo delle nazioni principali sta dove deve stare', () => {
  const it = nationBounds(provinces.features, 'ITA');
  assert.ok(it, 'Italia senza province');
  assert.ok(it.lon0 > 5 && it.lon1 < 30 && it.lat0 > 35 && it.lat1 < 48, JSON.stringify(it));
  const de = nationBounds(provinces.features, 'GER') ?? nationBounds(provinces.features, 'DEU');
  assert.ok(de && de.lon1 - de.lon0 < 30, 'Germania: riquadro troppo largo (colonie dentro?)');
  assert.equal(nationBounds(provinces.features, 'NESSUNA'), null);
});

test('nationBounds: lo stesso nucleo non include possedimenti lontani (Francia)', () => {
  const fr = nationBounds(provinces.features, 'FRA');
  assert.ok(fr.lon1 - fr.lon0 < 30 && fr.lat1 - fr.lat0 < 20, JSON.stringify(fr));
});

test('focusView: il centro del riquadro finisce al centro dello schermo e lo zoom è nei limiti', () => {
  const W = 900, H = 500;
  const b = { lon0: 6, lat0: 36, lon1: 18, lat1: 47 };
  const v = focusView(b, W, H, VB);
  const lay = layoutOf(VB, W, H);
  const a = affineOf(v, VB, lay);
  const px = a.sx * (((b.lon0 + b.lon1) / 2) * COS0) + a.tx;
  const py = a.sx * -((b.lat0 + b.lat1) / 2) + a.ty;
  assert.ok(Math.abs(px - W / 2) < 1 && Math.abs(py - H / 2) < 1, `centro a ${px},${py}`);
  assert.ok(v.k > 1 && v.k <= MAX_K);
  // il riquadro sta tutto dentro lo schermo
  assert.ok(a.sx * b.lon0 * COS0 + a.tx >= 0 && a.sx * b.lon1 * COS0 + a.tx <= W);
  assert.ok(a.sx * -b.lat1 + a.ty >= 0 && a.sx * -b.lat0 + a.ty <= H);
});

test('focusView: una nazione grande non scende sotto lo zoom minimo (niente copie del mondo)', () => {
  const v = focusView({ lon0: -170, lat0: 35, lon1: 180, lat1: 80 }, 900, 500, VB);
  const lay = layoutOf(VB, 900, 500);
  assert.ok(v.k >= minZoomToFit(900, 500, lay.s) - 1e-9, `k=${v.k}`);
});
