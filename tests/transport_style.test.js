import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK_ZOOM, DETAIL_ZOOMS, RECIPES, bridgeKind, bridgeLegend, detailTier, drawBridgeDeck, drawSwatch, recipeWidth } from '../src/map/transportStyle.js';
import { buildMarkers, drawMarkers, showsDeck, visibleMarkers } from '../src/map/crossingMarkers.js';
import { headingDeg } from '../src/data/transport.js';
import { validateBridges } from '../src/data/bridges.js';
import { MAX_K, zoomAt } from '../src/map/geo.js';

// contesto Canvas simulato che registra le chiamate
function fakeCtx() {
  const log = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => log.push([k, ...a])), set: (t, k, v) => { t[k] = v; return true; } });
  return { ctx, log };
}

test('dettaglio per zoom: tre livelli, soglie crescenti', () => {
  assert.equal(detailTier(1), 0);
  assert.equal(detailTier(DETAIL_ZOOMS[0]), 1);
  assert.equal(detailTier(DETAIL_ZOOMS[1]), 2);
  assert.equal(detailTier(100), 2);
});

test('autostrada: a zoom alto ha due carreggiate (spartitraffico), la strada principale una sola con mezzeria', () => {
  const motorway = RECIPES['road-3'][2];
  const road = RECIPES['road-2'][2];
  assert.ok(motorway[0].w > road[0].w, 'più larga');
  assert.equal(motorway.at(-1).c, '#2b2618', 'ultima passata scura al centro = spartitraffico');
  assert.ok(motorway.at(-1).w < motorway[1].w && !motorway.at(-1).dash, 'linea continua più stretta del riempimento');
  assert.ok(road.at(-1).dash, 'mezzeria tratteggiata sulla strada');
});

test('ferrovie: rotaie sottili con traversine; il doppio binario ha il doppio di rotaie', () => {
  const single = RECIPES['rail-2'][2];
  const dbl = RECIPES['rail-3'][2];
  const last = (r) => r.at(-1);
  assert.ok(last(single).dash && last(single).dash[0] < last(single).w, 'traversine: tratti più corti che larghi');
  assert.ok(last(dbl).dash && last(dbl).dash[0] < last(dbl).w);
  const rails = (r) => r.filter((p, i) => !p.dash && p.c === single[0].c && (r[i + 1]?.c !== p.c)).length; // strati scuri coperti da uno chiaro = coppie di rotaie
  assert.equal(rails(single), 1, 'un binario = una coppia di rotaie');
  assert.equal(rails(dbl), 2, 'doppio binario = due coppie');
  assert.ok(recipeWidth('rail-3', 2) > recipeWidth('rail-2', 2), 'doppio binario più largo');
  assert.equal(last(single).c, last(dbl).c, 'stesse traversine, stessa fase di tratteggio');
});

test('ponti: tipo dai livelli di strada e ferrovia e legenda senza ripetizioni', () => {
  assert.equal(bridgeKind({ road: 3, rail: 0 }).id, 'road-3');
  assert.equal(bridgeKind({ road: 1, rail: 0 }).style, 'wood');
  assert.equal(bridgeKind({ road: 2, rail: 0 }).style, 'stone');
  assert.equal(bridgeKind({ road: 0, rail: 3 }).style, 'iron');
  assert.equal(bridgeKind({ road: 0, rail: 3 }).id, 'rail-double');
  assert.equal(bridgeKind({ road: 0, rail: 2 }).id, 'rail-single');
  assert.equal(bridgeKind({ road: 1, rail: 2 }).id, 'mixed');
  const l = bridgeLegend();
  assert.equal(new Set(l.map((x) => x.id)).size, l.length);
});

test('impalcato: parapetti, spalle e simbolo; più largo se porta strada e ferrovia', () => {
  const a = fakeCtx();
  const road = drawBridgeDeck(a.ctx, { road: 2, rail: 0 }, 10);
  assert.ok(a.log.some(([k]) => k === 'fillRect') && a.log.filter(([k]) => k === 'stroke').length >= 3);
  const b = fakeCtx();
  const mixed = drawBridgeDeck(b.ctx, { road: 2, rail: 3 }, 10);
  assert.ok(mixed.width > road.width && mixed.len === road.len);
  const sw = fakeCtx();
  drawSwatch(sw.ctx, { kind: 'line', key: 'rail-3' }, 44, 24);
  drawSwatch(sw.ctx, { kind: 'bridge', road: 3, rail: 0 }, 44, 24);
  assert.ok(sw.log.length > 10);
  for (const key of Object.keys(RECIPES)) assert.ok(recipeWidth(key, 2) <= 24, `${key} entra nel campione`);
});

test('direzione dei ponti: gradi non orientati e validazione', () => {
  assert.equal(headingDeg([0, 0], [1, 0]), 0);
  assert.equal(headingDeg([0, 0], [0, 1]), 90);
  assert.equal(headingDeg([0, 0], [-1, 0]), 0, 'non orientata');
  assert.equal(headingDeg([0, 0], [1, -1]), 135);
  const f = { schema: 'transport-bridges-v1', quality: 'hypothesis', count: 1, points: [{ id: 'B', riverId: 'R', lon: 1, lat: 1, road: 2, rail: 0, level: 2, ang: 200 }] };
  assert.ok(validateBridges(f).some((e) => e.includes('ang')));
  f.points[0].ang = 45;
  assert.deepEqual(validateBridges(f), []);
});

test('marcatori: impalcato solo da zoom alto e solo con direzione; ruotato sulla mappa', () => {
  const cos0 = 2;
  const file = { points: [
    { id: 'A', kind: 'bridge', level: 2, riverId: 'R', lon: 1, lat: 1, road: 2, rail: 0, ang: 0 },
    { id: 'B', kind: 'border_cross', level: 2, riverId: 'R', lon: 5, lat: 1, road: 0, rail: 0 },
  ] };
  const [a, b] = buildMarkers(file, cos0);
  assert.ok(Math.abs(a.rot) < 1e-12);
  assert.equal(b.rot, null);
  assert.ok(showsDeck(a, DECK_ZOOM) && !showsDeck(a, 2) && !showsDeck(b, 50));
  const v = buildMarkers({ points: [{ ...file.points[0], ang: 90 }] }, cos0)[0];
  assert.ok(Math.abs(v.rot - Math.atan2(-1, 0)) < 1e-9, 'strada verso nord = verso l’alto sullo schermo');
  const { ctx, log } = fakeCtx();
  const all = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };
  drawMarkers(ctx, [a, b], { sx: 10, k: 20, cull: all });
  assert.ok(log.some(([k]) => k === 'rotate'), 'impalcato ruotato');
  assert.equal(visibleMarkers([a, b], { sx: 10, k: 20, cull: all }).length, 2);
});

test('zoom massimo portato a 120', () => {
  assert.equal(MAX_K, 120);
  assert.equal(zoomAt({ k: 100, x: 0, y: 0 }, 5, 0, 0).k, 120);
});
