import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE_MIN_PX, DECK_ZOOM, DETAIL_ZOOMS, drawBridgeSegments, sizeBoost, RECIPES, bridgeKind, bridgeLegend, detailTier, OFFSETS, offsetOf, drawBridgeDeck, drawStraight, drawSwatch, recipeWidth } from '../src/map/transportStyle.js';
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

test('autostrada: a zoom pieno sono due carreggiate scostate (spartitraffico), la strada principale una con mezzeria', () => {
  assert.ok(OFFSETS['road-3'] > recipeWidth('road-2', 2) / 2 - 3, 'le due carreggiate non si sovrappongono');
  const lane = RECIPES['road-3'][2];
  assert.ok(2 * OFFSETS['road-3'] > lane[0].w, 'tra le carreggiate resta uno spartitraffico libero');
  assert.ok(lane.at(-1).dash, 'linea di corsia tratteggiata');
  assert.ok(recipeWidth('road-3', 2) > recipeWidth('road-2', 2), 'più larga');
  assert.ok(RECIPES['road-2'][2].at(-1).dash, 'mezzeria tratteggiata sulla strada');
});

test('ferrovie: rotaie sottili con traversine fitte; il doppio binario sono due binari paralleli', () => {
  const single = RECIPES['rail-2'][2];
  const t = single.at(-1);
  assert.ok(t.dash && t.dash[0] < t.w && t.dash[1] < 3 * t.dash[0], 'traversine fitte, più corte che larghe');
  assert.equal(single.length, 3, 'rotaie + massicciata + traversine');
  assert.equal(OFFSETS['rail-2'], undefined, 'binario unico: un solo tracciato');
  assert.ok(2 * OFFSETS['rail-3'] > t.w, 'tra i due binari resta uno spazio');
  assert.ok(recipeWidth('rail-3', 2) > 2 * recipeWidth('rail-2', 2) - 1, 'doppio binario ≈ due binari');
});

test('tracciati paralleli: drawStraight disegna due volte per i tipi con scostamento', () => {
  const count = (key) => { const f = fakeCtx(); drawStraight(f.ctx, key, 2, 1, -10, 10); return f.log.filter(([k]) => k === 'stroke').length; };
  assert.equal(count('rail-3'), 2 * count('rail-2'));
  assert.equal(count('road-3'), 2 * RECIPES['road-3'][2].length);
  const f = fakeCtx(); drawStraight(f.ctx, 'rail-3', 1, 1, -10, 10);
  assert.equal(f.log.filter(([k]) => k === 'stroke').length, 2 * RECIPES['rail-3'][1].length, 'a dettaglio 1 due linee vicine');
  const g = fakeCtx(); drawStraight(g.ctx, 'rail-3', 0, 1, -10, 10);
  assert.equal(g.log.filter(([k]) => k === 'stroke').length, RECIPES['rail-3'][0].length, 'a dettaglio 0 una linea sola');
  assert.ok(offsetOf('rail-3', 1) < offsetOf('rail-3', 2) && offsetOf('rail-3', 0) === undefined && offsetOf('rail-2', 2) === undefined);
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
  const file = { nodes: [{ lon: 10, lat: 45, t: 5, name: 'X' }], segments: [seg('S1', 'road', 2, false), seg('S2', 'road', 2, true), seg('S3', 'rail', 3, true)] };
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

test('ponti: cinque costruzioni distinguibili (legno, muratura ad arco, autostrada, ferro a travata, ferro a traliccio)', () => {
  const sig = (spec) => {
    const f = fakeCtx();
    drawBridgeDeck(f.ctx, spec, 4, 60);
    const count = (name) => f.log.filter(([k]) => k === name).length;
    return { arc: count('arc'), ellipse: count('ellipse'), fillRect: count('fillRect'), strokeRect: count('strokeRect'), clip: count('clip'), stroke: count('stroke') };
  };
  const wood = sig({ road: 1 }); const stone = sig({ road: 2 }); const highway = sig({ road: 3 }); const girder = sig({ rail: 2 }); const truss = sig({ rail: 3 });
  assert.ok(wood.arc > 6 && wood.ellipse === 0, 'legno: montanti tondi');
  assert.ok(stone.ellipse === 2 && stone.clip === 1 && stone.strokeRect === 4, 'muratura: arco a due anelli e contrafforti quadrati');
  assert.ok(highway.arc === 4 && highway.ellipse === 0 && highway.strokeRect === 0, 'autostrada: quattro pile tonde');
  assert.ok(girder.strokeRect === 4 && girder.ellipse === 0 && girder.arc === 0, 'travata: blocchi di fondazione');
  assert.ok(truss.stroke > girder.stroke, 'traliccio: più segni (controventi a X, doppio binario)');
  assert.equal(new Set([wood, stone, highway, girder, truss].map((x) => JSON.stringify(x))).size, 5, 'cinque firme diverse');
  assert.equal(bridgeLegend().length, 6);
});

test('ponti a dettaglio pieno: orientati come il tratto e lunghi almeno BRIDGE_MIN_PX', () => {
  globalThis.Path2D ??= class { moveTo() {} lineTo() {} };
  // tratto cortissimo (0,001 unità a 10 px/unità = 0,01 px): il ponte resta riconoscibile
  const tiny = { kind: 'road', level: 3, coords: Float32Array.from([5, 5, 5.0005, 5.0005, 5.001, 5.001]) };
  const f = fakeCtx();
  drawBridgeSegments(f.ctx, [tiny], { sx: 10, tier: 2 });
  const rot = f.log.find(([k]) => k === 'rotate');
  assert.ok(rot && Math.abs(rot[1] - Math.PI / 4) < 1e-3, 'ruotato lungo il tratto');
  const rect = f.log.find(([k]) => k === 'fillRect');
  assert.ok(Math.abs(rect[3] - BRIDGE_MIN_PX / 10) < 1e-6, 'lunghezza minima in px');
});
