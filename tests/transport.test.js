// Strade, ferrovie e ponti dagli incroci con i fiumi (data/transport.json, data/transport_bridges.json).
// Rete MODERNA di Natural Earth: i test verificano coerenza con i dati della mappa, non la storia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSPORT_SCHEMA, bridgeLevel, buildRiverSegmentGrid, lineRiverIntersections, railLevel, roadLevel, segmentIntersection, simplify, validateTransport } from '../src/data/transport.js';
import { BRIDGES_SCHEMA, mergeCandidates, validateBridges } from '../src/data/bridges.js';
import { buildRiverModel, distanceToLineKm, distanceToRiverKm } from '../src/data/rivers.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { TRANSPORT_STYLE, buildTransportModel, drawTransport, transportLegend, transportRankLimit } from '../src/map/transportView.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const transport = read('transport.json');
const bridges = read('transport_bridges.json');
const crossingPoints = read('crossing_points.json');
const catalog = read('rivers.json');
const geo = read('rivers_geo.json');
const provinces = await loadProvinces();
const ids = provinces.features.map((f) => f.properties.id);
const index = buildProvinceIndex(provinces);
const model = buildRiverModel(catalog, geo);

test('trasporti: file validi, legati alle province attuali e dichiarati ipotesi', () => {
  assert.equal(transport.schema, TRANSPORT_SCHEMA);
  assert.equal(bridges.schema, BRIDGES_SCHEMA);
  assert.deepEqual(validateTransport(transport), []);
  assert.deepEqual(validateBridges(bridges, { riverIds: new Set(catalog.map((r) => r.id)) }), []);
  assert.equal(transport.checksum, idsChecksum(ids), 'province cambiate: rigenerare con npm run build:transport -- <cartella Natural Earth>');
  assert.equal(bridges.checksum, idsChecksum(ids));
  assert.equal(transport.quality, 'hypothesis');
  assert.ok(transport.perKind.road > 1000 && transport.perKind.rail > 1000, JSON.stringify(transport.perKind));
});

test('trasporti: ogni tratto cade nel territorio coperto dalle province (nessun tratto fuori mappa)', () => {
  const sample = transport.lines.filter((_, i) => i % 15 === 0);
  assert.ok(sample.length > 500);
  for (const l of sample) {
    let hit = 0;
    let n = 0;
    for (let i = 0; i < l.c.length; i += 2 * Math.max(1, Math.floor(l.c.length / 12))) { n += 1; if (index.provincesAt(l.c[i], l.c[i + 1]).length > 0) hit += 1; }
    assert.ok(hit / n >= 0.3, `${l.id}: ${hit}/${n} punti in provincia`);
  }
});

test('trasporti: livelli provvisori da classe Natural Earth, ferry esclusi, autostrade a livello 2', () => {
  assert.equal(roadLevel({ type: 'Major Highway', expressway: 1, featurecla: 'Road' }), 2);
  assert.equal(roadLevel({ type: 'Secondary Highway', expressway: 0, featurecla: 'Road' }), 2);
  assert.equal(roadLevel({ type: 'Unknown', expressway: 0, featurecla: 'Road' }), 1);
  assert.equal(roadLevel({ type: 'Ferry Route', expressway: 0, featurecla: 'Ferry' }), null);
  assert.equal(railLevel({ scalerank: 4, featurecla: 'Railroad' }), 3);
  assert.equal(railLevel({ scalerank: 8, featurecla: 'Railroad' }), 2);
  assert.equal(railLevel({ scalerank: 5, featurecla: 'Railroad ferry' }), null);
  assert.equal(bridgeLevel({ roadLevel: 1 }), 1);
  assert.equal(bridgeLevel({ roadLevel: 2, railLevel: 2 }), 2);
  assert.equal(bridgeLevel({ roadLevel: 1, railLevel: 3 }), 3);
  assert.ok(transport.lines.every((l) => (l.k === 'road' ? [1, 2] : [2, 3]).includes(l.level)));
});

test('geometria: semplificazione tiene gli estremi e riduce i punti; intersezione tra segmenti', () => {
  const zig = Array.from({ length: 50 }, (_, i) => [i * 0.01, (i % 2) * 0.001]);
  const s = simplify(zig, 0.01);
  assert.deepEqual(s[0], zig[0]);
  assert.deepEqual(s[s.length - 1], zig[zig.length - 1]);
  assert.ok(s.length < zig.length);
  const bend = [[0, 0], [1, 0], [1, 1]];
  assert.equal(simplify(bend, 0.1).length, 3, 'una curva vera si tiene');
  assert.deepEqual(segmentIntersection([0, 0], [2, 2], [0, 2], [2, 0]), { x: 1, y: 1 });
  assert.equal(segmentIntersection([0, 0], [1, 0], [0, 1], [1, 1]), null, 'paralleli');
  assert.equal(segmentIntersection([0, 0], [1, 1], [2, 0], [3, 1]), null, 'disgiunti');
});

test('ponti: incrocio sintetico strada-fiume, tratti dentro i laghi ignorati, duplicati uniti', () => {
  const river = { features: [
    { properties: { riverId: 'R_X', inLake: false }, geometry: { coordinates: [[5, 40], [5, 41], [5.001, 42]] } },
    { properties: { riverId: 'R_L', inLake: true }, geometry: { coordinates: [[0, 41.5], [10, 41.5]] } },
  ] };
  const grid = buildRiverSegmentGrid(river);
  const hits = lineRiverIntersections([[4, 41.5], [6, 41.5]], grid);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].riverId, 'R_X');
  assert.ok(Math.abs(hits[0].lon - 5) < 0.01 && Math.abs(hits[0].lat - 41.5) < 1e-9);
  // una strada a zig-zag che incrocia due volte lo stesso punto non genera due ponti
  assert.equal(lineRiverIntersections([[4, 41.5], [6, 41.5], [4.5, 41.505], [5.5, 41.505]], grid).length, 1);
});

test('ponti: ogni ponte sta sul suo fiume (≤ 1,5 km) e su un tratto di strada o ferrovia (≤ 2,5 km)', () => {
  const near = (lon, lat, k) => transport.lines.some((l) => {
    if (l.k !== k) return false;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    const pts = [];
    for (let i = 0; i < l.c.length; i += 2) { pts.push([l.c[i], l.c[i + 1]]); x0 = Math.min(x0, l.c[i]); x1 = Math.max(x1, l.c[i]); y0 = Math.min(y0, l.c[i + 1]); y1 = Math.max(y1, l.c[i + 1]); }
    if (lon < x0 - 0.05 || lon > x1 + 0.05 || lat < y0 - 0.05 || lat > y1 + 0.05) return false;
    return distanceToLineKm(lon, lat, pts) < 2.5;
  });
  const sample = bridges.points.filter((_, i) => i % 20 === 0);
  assert.ok(sample.length > 100);
  for (const p of sample) {
    assert.ok(distanceToRiverKm(model, p.riverId, p.lon, p.lat) < 1.5, `${p.id} lontano dal fiume`);
    if (p.road > 0) assert.ok(near(p.lon, p.lat, 'road'), `${p.id}: nessuna strada vicina`);
    if (p.rail > 0) assert.ok(near(p.lon, p.lat, 'rail'), `${p.id}: nessuna ferrovia vicina`);
  }
});

test('ponti: i grandi fiumi ne hanno molti e tutti e tre i livelli sono presenti', () => {
  const of = (id) => bridges.points.filter((p) => p.riverId === id);
  assert.ok(of('R_DANUBE').length >= 25 && of('R_RHINE').length >= 15);
  for (const l of [1, 2, 3]) assert.ok(bridges.points.some((p) => p.level === l), `nessun ponte di livello ${l}`);
  assert.ok(bridges.points.some((p) => p.road > 0 && p.rail > 0), 'strada e ferrovia sullo stesso ponte');
  assert.ok(bridges.points.every((p) => p.level === Math.max(p.road, p.rail)));
});

test('ponti: unione con i passaggi di confine tiene i ponti e i confini senza ponte vicino', () => {
  const b = [{ id: 'BR_X_001', riverId: 'R_X', lon: 10, lat: 45, road: 2, rail: 0, level: 2 }];
  const border = [
    { id: 'CP_X_001', kind: 'border_cross', riverId: 'R_X', lon: 10.05, lat: 45, level: 3 }, // a ~4 km: coperto dal ponte
    { id: 'CP_X_002', kind: 'border_cross', riverId: 'R_X', lon: 11, lat: 45, level: 3 }, // lontano: resta
    { id: 'CP_Y_001', kind: 'river_border', riverId: 'R_Y', lon: 10.05, lat: 45, level: 2 }, // altro fiume: resta
  ];
  const out = mergeCandidates(b, border);
  assert.deepEqual(out.map((p) => p.id), ['BR_X_001', 'CP_X_002', 'CP_Y_001']);
  assert.equal(out[0].kind, 'bridge');
  const real = mergeCandidates(bridges.points, crossingPoints.points);
  assert.ok(real.length >= bridges.count && real.length <= bridges.count + crossingPoints.count);
  assert.equal(new Set(real.map((p) => p.id)).size, real.length, 'id unici');
});

test('mappa: modello proiettato, densità per zoom, legenda con stili diversi', () => {
  const m = buildTransportModel(transport, 2);
  assert.equal(m.lines.length, transport.count);
  assert.equal(m.lines[0].coords[0], Math.fround(transport.lines[0].c[0] * 2)); // Float32Array
  assert.equal(m.lines[0].coords[1], Math.fround(-transport.lines[0].c[1]));
  assert.ok(transportRankLimit(1) < transportRankLimit(3) && transportRankLimit(3) < transportRankLimit(5));
  const legend = transportLegend();
  assert.equal(legend.length, 4);
  assert.equal(new Set(legend.map((l) => `${l.stroke}|${l.width}|${l.dash}`)).size, 4);
  assert.ok(TRANSPORT_STYLE['rail-3'].width > TRANSPORT_STYLE['rail-2'].width && TRANSPORT_STYLE['road-2'].width > TRANSPORT_STYLE['road-1'].width);
});

test('mappa: drawTransport rispetta zoom e riquadro (Path2D simulato)', () => {
  globalThis.Path2D ??= class { moveTo() {} lineTo() {} };
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === 'stroke' ? () => calls.push('stroke') : () => {}), set: () => true });
  const m = buildTransportModel(transport, 2);
  const all = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };
  const n1 = drawTransport(ctx, m, { sx: 10, k: 1, cull: all });
  const n3 = drawTransport(ctx, m, { sx: 10, k: 3, cull: all });
  const n6 = drawTransport(ctx, m, { sx: 10, k: 6, cull: all });
  assert.ok(n1 > 0 && n1 < n3 && n3 < n6, `${n1} ${n3} ${n6}`);
  assert.equal(n6, m.lines.length);
  assert.equal(drawTransport(ctx, m, { sx: 10, k: 6, cull: { x0: 1e8, x1: 1e9, y0: 1e8, y1: 1e9 } }), 0);
  assert.ok(calls.length >= 1);
});
