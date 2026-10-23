// Strade, ferrovie e ponti: funzioni di geometria, livelli, autostrade curate e disegno (il grafo vero è in tests/links.test.js).
// Rete MODERNA di Natural Earth: i test verificano coerenza con i dati della mappa, non la storia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSPORT_SCHEMA, validateTransport, bridgeLevel, distanceToViaKm, splitByAutostrade, validateAutostrade, buildRiverSegmentGrid, lineRiverIntersections, railLevel, roadLevel, segmentIntersection, simplify } from '../src/data/transport.js';
import { recipeWidth } from '../src/map/transportStyle.js';
import { buildTransportModel, drawTransport, transportLegend, transportRankLimit } from '../src/map/transportView.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const autostrade = read('autostrade_1936.json');
const net = read('transport.json'); // rete di origine dei collegamenti
// piccola rete sintetica: 2 strade e 1 ferrovia
const transport = { count: 3, lines: [
  { id: 'A', k: 'road', level: 2, rank: 6, c: [0, 0, 1, 1] },
  { id: 'B', k: 'road', level: 1, rank: 99, c: [1, 1, 2, 1.5] },
  { id: 'C', k: 'rail', level: 2, rank: 4, c: [0, 1, 1, 2] },
] };

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

test('mappa: modello proiettato, densità per zoom, legenda con stili diversi', () => {
  const m = buildTransportModel(transport, 2);
  assert.equal(m.lines.length, transport.count);
  assert.equal(m.lines[0].coords[0], Math.fround(transport.lines[0].c[0] * 2)); // Float32Array
  assert.equal(m.lines[0].coords[1], Math.fround(-transport.lines[0].c[1]));
  assert.equal(transportRankLimit(1), 0, 'da lontano nessuna linea');
  assert.ok(transportRankLimit(1) < transportRankLimit(10) && transportRankLimit(10) < transportRankLimit(15) && transportRankLimit(15) < transportRankLimit(25));
  const legend = transportLegend();
  assert.deepEqual(legend.map((l) => l.key), ['sea-0', 'road-0', 'road-1', 'road-2', 'rail-2'], 'tratta marittima, sterrata, strada, principale, ferrovia: niente autostrade né doppio binario');
  // a ogni livello di dettaglio la strada principale è più larga della strada comune
  for (const t of [0, 1, 2]) assert.ok(recipeWidth('road-1', t) < recipeWidth('road-2', t), `strade a dettaglio ${t}`);
});

test('mappa: drawTransport rispetta zoom e riquadro (Path2D simulato)', () => {
  globalThis.Path2D ??= class { moveTo() {} lineTo() {} };
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === 'stroke' ? () => calls.push('stroke') : () => {}), set: () => true });
  const m = buildTransportModel(transport, 2);
  const all = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };
  const n0 = drawTransport(ctx, m, { sx: 10, k: 1, cull: all });
  const n1 = drawTransport(ctx, m, { sx: 10, k: 10, cull: all });
  const n3 = drawTransport(ctx, m, { sx: 10, k: 15, cull: all });
  const n6 = drawTransport(ctx, m, { sx: 10, k: 25, cull: all });
  assert.equal(n0, 0, 'zoom lontano: niente');
  assert.ok(n1 > 0 && n1 <= n3 && n3 <= n6, `${n1} ${n3} ${n6}`);
  assert.equal(n6, m.lines.length);
  assert.equal(drawTransport(ctx, m, { sx: 10, k: 25, cull: { x0: 1e8, x1: 1e9, y0: 1e8, y1: 1e9 } }), 0);
  assert.ok(calls.length >= 1);
});

test('autostrade 1936: file curato valido, anni entro il 1936, ipotesi dichiarata', () => {
  assert.deepEqual(validateAutostrade(autostrade), []);
  assert.equal(autostrade.dateBasis, 'memory_unverified');
  assert.ok(autostrade.autostrade.some((a) => a.nation === 'ITA') && autostrade.autostrade.some((a) => a.nation === 'DEU'));
  const bad = { ...autostrade, autostrade: [{ id: 'X', name: '', via: [[0, 0]], fromYear: 1950 }, { id: 'X', name: 'y', via: [[0, 0], [1, 1]], fromYear: 1930 }] };
  const errors = validateAutostrade(bad);
  assert.ok(errors.some((e) => e.includes('percorso')) && errors.some((e) => e.includes('anno')) && errors.some((e) => e.includes('duplicato')) && errors.some((e) => e.includes('nome')));
});

test('autostrade 1936: distanza dal percorso e divisione di una strada in pezzi', () => {
  const via = [[10, 45], [11, 45]];
  assert.ok(distanceToViaKm(10.5, 45, via) < 0.01);
  assert.ok(Math.abs(distanceToViaKm(10.5, 45.09, via) - 9.95) < 0.3);
  const road = [[9, 45], [10, 45.01], [10.5, 45.01], [11, 45.01], [12, 45.5]];
  const pieces = splitByAutostrade(road, [{ id: 'AU_X', via }], 7);
  assert.deepEqual(pieces.map((p) => p.auto), [null, 'AU_X', null]);
  // i pezzi sono contigui: condividono il vertice di giunzione e ricompongono la strada
  assert.deepEqual(pieces[0].coords.at(-1), pieces[1].coords[0]);
  assert.deepEqual(pieces[1].coords.at(-1), pieces[2].coords[0]);
  assert.equal(pieces.reduce((n, p) => n + p.coords.length - 1, 0), road.length - 1);
});

test('rete di origine: file valido, ipotesi dichiarata, ogni autostrada 1936 agganciata con nome e anno', () => {
  assert.equal(net.schema, TRANSPORT_SCHEMA);
  assert.deepEqual(validateTransport(net), []);
  assert.equal(net.quality, 'hypothesis');
  assert.ok(net.perKind.road > 1000 && net.perKind.rail > 1000);
  const motorway = net.lines.filter((l) => l.k === 'road' && l.level === 3);
  assert.ok(motorway.length >= 13 && motorway.every((l) => typeof l.n === 'string' && Number.isInteger(l.y) && l.y <= 1936 && l.rank <= 4));
  for (const a of autostrade.autostrade) assert.ok(net.autostrade.find((x) => x.id === a.id)?.matchedKm >= 15, `${a.id} non agganciata`);
});
