import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE_MAX_PX, BRIDGE_MIN_PX, BRIDGE_SCALE, DECK_ZOOM, DETAIL_ZOOMS, drawBridgeSegments, sizeBoost, RECIPES, bridgeKind, bridgeLegend, detailTier, drawBridgeDeck, drawStraight, drawSwatch, recipeWidth } from '../src/map/transportStyle.js';
import { buildMarkers, drawMarkers, visibleMarkers } from '../src/map/crossingMarkers.js';
import { buildLinksModel, drawTransport } from '../src/map/transportView.js';
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

test('strade: una sola corsia a ogni livello di dettaglio, la principale ha la mezzeria tratteggiata', () => {
  assert.ok(RECIPES['road-2'][2].at(-1).dash, 'mezzeria tratteggiata sulla strada principale');
  assert.ok(recipeWidth('road-1', 2) < recipeWidth('road-2', 2), 'la principale è più larga');
  for (const key of Object.keys(RECIPES)) assert.ok(!/-3$/.test(key), `${key}: niente autostrade né doppio binario`);
});

test('ferrovia: rotaie sottili con traversine fitte, un solo binario', () => {
  const single = RECIPES['rail-2'][2];
  const t = single.at(-1);
  assert.ok(t.dash && t.dash[0] < t.w && t.dash[1] < 3 * t.dash[0], 'traversine fitte, più corte che larghe');
  assert.equal(single.length, 3, 'rotaie + massicciata + traversine');
});

test('un segno dritto si disegna una volta sola per passata (niente tracciati paralleli)', () => {
  for (const key of Object.keys(RECIPES)) for (const tier of [0, 1, 2]) {
    const f = fakeCtx(); drawStraight(f.ctx, key, tier, 1, -10, 10);
    assert.equal(f.log.filter(([k]) => k === 'stroke').length, RECIPES[key][tier].length, `${key} dettaglio ${tier}`);
  }
});

test('ponti: tipo dai livelli di strada e ferrovia e legenda senza ripetizioni', () => {
  assert.equal(bridgeKind({ road: 1, rail: 0 }).style, 'wood');
  assert.equal(bridgeKind({ road: 2, rail: 0 }).style, 'stone');
  assert.equal(bridgeKind({ road: 0, rail: 2 }).id, 'rail-single');
  assert.equal(bridgeKind({ road: 0, rail: 2 }).style, 'iron-deck');
  assert.equal(bridgeKind({ road: 1, rail: 2 }).id, 'mixed', 'strada + ferrovia insieme: traliccio');
  const l = bridgeLegend();
  assert.equal(new Set(l.map((x) => x.id)).size, l.length);
  assert.deepEqual(l.map((x) => x.style), ['wood', 'stone', 'iron-deck'], 'tre costruzioni, come i tre tipi di linea');
});

test('impalcato: parapetti, spalle e simbolo; più largo se porta strada e ferrovia', () => {
  const a = fakeCtx();
  const road = drawBridgeDeck(a.ctx, { road: 2, rail: 0 }, 10);
  assert.ok(a.log.some(([k]) => k === 'fillRect') && a.log.filter(([k]) => k === 'stroke').length >= 3);
  const b = fakeCtx();
  const mixed = drawBridgeDeck(b.ctx, { road: 2, rail: 2 }, 10);
  assert.ok(mixed.width > road.width && mixed.len === road.len);
  const sw = fakeCtx();
  drawSwatch(sw.ctx, { kind: 'line', key: 'rail-2' }, 44, 24);
  drawSwatch(sw.ctx, { kind: 'bridge', road: 2, rail: 0 }, 44, 24);
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

test('marcatori: i ponti diventano tratti della linea da zoom 18 (niente marcatore), i passaggi di confine restano', () => {
  const file = { points: [
    { id: 'A', kind: 'bridge', level: 2, riverId: 'R', lon: 1, lat: 1, road: 2, rail: 0, ang: 0 },
    { id: 'B', kind: 'border_cross', level: 2, riverId: 'R', lon: 5, lat: 1, road: 0, rail: 0 },
  ] };
  const ms = buildMarkers(file, 2);
  const all = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };
  assert.equal(visibleMarkers(ms, { sx: 10, k: 10, cull: all }).length, 2);
  assert.deepEqual(visibleMarkers(ms, { sx: 10, k: 20, cull: all }).map((m) => m.id), ['B']);
  const { ctx } = fakeCtx();
  assert.equal(drawMarkers(ctx, ms, { sx: 10, k: 20, cull: all }), 1);
});

test('ponti come tratti: stessa geometria della linea, aspetto per materiale e dettaglio', () => {
  globalThis.Path2D ??= class { moveTo() {} lineTo() {} };
  const seg = (id, k, level, br) => ({ id, k, level, rank: 4, ...(br ? { br: { r: 'R_X' } } : {}), c: [10, 45, 10.01, 45.005, 10.02, 45] });
  const file = { nodes: [{ lon: 10, lat: 45, t: 4, name: 'X' }], segments: [seg('S1', 'road', 2, false), seg('S2', 'road', 2, true), seg('S3', 'rail', 2, true)] };
  const m = buildLinksModel(file, 2);
  assert.equal(m.lines.length, 1);
  assert.equal(m.bridges.length, 2);
  assert.equal(m.bridges[0].coords[0], Math.fround(10 * 2), 'stessa geometria della linea');
  for (const tier of [0, 1, 2]) {
    const { ctx, log } = fakeCtx();
    drawBridgeSegments(ctx, m.bridges, { sx: 10, tier });
    assert.ok(log.filter(([k]) => k === 'stroke').length >= 2, `dettaglio ${tier}`);
  }
  const t0 = fakeCtx(); drawBridgeSegments(t0.ctx, m.bridges, { sx: 10, tier: 0 });
  const t2 = fakeCtx(); drawBridgeSegments(t2.ctx, m.bridges, { sx: 10, tier: 2 });
  assert.ok(t2.log.filter(([k]) => k === 'stroke').length > 3 * t0.log.filter(([k]) => k === 'stroke').length, 'a dettaglio pieno molti più tratti (impalcato, parapetti, spalle)');
  const far = fakeCtx();
  assert.equal(drawTransport(far.ctx, m, { sx: 10, k: 3, cull: { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 } }), 0, 'da lontano niente');
  assert.equal(drawTransport(far.ctx, m, { sx: 10, k: 25, cull: { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 } }), 3);
});

test('zoom massimo portato a 120', () => {
  assert.equal(MAX_K, 120);
  assert.equal(zoomAt({ k: 100, x: 0, y: 0 }, 5, 0, 0).k, 120);
});

test('ingrandimento dei segni a zoom massimo: 1 fino ai ponti, poi cresce senza superare 1,6', () => {
  assert.equal(sizeBoost(1), 1);
  assert.equal(sizeBoost(DECK_ZOOM), 1);
  assert.ok(sizeBoost(40) > 1 && sizeBoost(40) < sizeBoost(100));
  assert.ok(Math.abs(sizeBoost(120) - 1.6) < 1e-9 && sizeBoost(500) === 1.6);
});

test('ponti: quattro costruzioni distinguibili (legno, muratura ad arco, ferro a travata, ferro a traliccio per strada + ferrovia)', () => {
  const sig = (spec) => {
    const f = fakeCtx();
    drawBridgeDeck(f.ctx, spec, 4, 60);
    const count = (name) => f.log.filter(([k]) => k === name).length;
    return { arc: count('arc'), ellipse: count('ellipse'), fillRect: count('fillRect'), strokeRect: count('strokeRect'), clip: count('clip'), stroke: count('stroke') };
  };
  const wood = sig({ road: 1 }); const stone = sig({ road: 2 }); const girder = sig({ rail: 2 }); const truss = sig({ road: 1, rail: 2 });
  assert.ok(wood.arc > 6 && wood.ellipse === 0, 'legno: montanti tondi');
  assert.ok(stone.ellipse === 2 && stone.clip === 1 && stone.strokeRect === 4, 'muratura: arco a due anelli e contrafforti quadrati');
  assert.ok(girder.strokeRect === 4 && girder.ellipse === 0 && girder.arc === 0, 'travata: blocchi di fondazione');
  assert.ok(truss.stroke > girder.stroke, 'traliccio: più segni (controventi a X, strada e ferrovia)');
  assert.equal(new Set([wood, stone, girder, truss].map((x) => JSON.stringify(x))).size, 4, 'quattro firme diverse');
  assert.equal(bridgeLegend().length, 3, 'la legenda mostra le tre costruzioni che esistono nel gioco');
});

test('ponti a dettaglio pieno: orientati come il tratto, lunghi tra BRIDGE_MIN_PX e BRIDGE_MAX_PX e più piccoli della linea', () => {
  globalThis.Path2D ??= class { moveTo() {} lineTo() {} };
  const lenOf = (coords) => {
    const f = fakeCtx();
    drawBridgeSegments(f.ctx, [{ kind: 'road', level: 2, coords: Float32Array.from(coords) }], { sx: 10, tier: 2 });
    const rot = f.log.find(([k]) => k === 'rotate');
    const sc = f.log.find(([k]) => k === 'scale');
    const rect = f.log.find(([k]) => k === 'fillRect');
    return { rot, sc, px: (rect[3] * BRIDGE_SCALE) * 10 }; // lunghezza sullo schermo: unità × scala × px per unità
  };
  // tratto cortissimo (0,001 unità a 10 px/unità = 0,01 px): il ponte resta riconoscibile
  const tiny = lenOf([5, 5, 5.0005, 5.0005, 5.001, 5.001]);
  assert.ok(tiny.rot && Math.abs(tiny.rot[1] - Math.PI / 4) < 1e-3, 'ruotato lungo il tratto');
  assert.deepEqual(tiny.sc.slice(1), [BRIDGE_SCALE, BRIDGE_SCALE], 'scala ridotta');
  assert.ok(Math.abs(tiny.px - BRIDGE_MIN_PX) < 1e-6, `lunghezza minima in px: ${tiny.px}`);
  // tratto lunghissimo (100 unità = 1000 px): il ponte non lo segue, si ferma a BRIDGE_MAX_PX
  const huge = lenOf([0, 0, 50, 0, 100, 0]);
  assert.ok(Math.abs(huge.px - BRIDGE_MAX_PX) < 1e-6, `lunghezza massima in px: ${huge.px}`);
  assert.ok(BRIDGE_MAX_PX <= 32 && BRIDGE_SCALE < 1);
});
