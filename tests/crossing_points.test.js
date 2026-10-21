// Punti di passaggio calcolati tra fiumi e confini delle province (data/crossing_points.json) e loro marcatori.
// Sono candidati geometrici, non ponti storici: i test verificano coerenza con i dati della mappa, non la storia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CROSSING_POINTS_SCHEMA, CROSSING_LEVELS, computeCrossingPoints, levelForRiver, minLevelForZoom, packCrossingPoints, unpackCrossingPoints, validateCrossingPoints } from '../src/data/crossingPoints.js';
import { buildRiverModel, distanceToRiverKm } from '../src/data/rivers.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { MARKER_STYLE, buildMarkers, drawMarkers, markerLegend, visibleMarkers } from '../src/map/crossingMarkers.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const raw = read('crossing_points.json');
const catalog = read('rivers.json');
const geo = read('rivers_geo.json');
const provinces = await loadProvinces();
const ids = provinces.features.map((f) => f.properties.id);
const model = buildRiverModel(catalog, geo);
const index = buildProvinceIndex(provinces);
const riverById = new Map(catalog.map((r) => [r.id, r]));
const file = { ...raw, points: unpackCrossingPoints(raw, ids) }; // province per id
const ownerOf = new Map(provinces.features.map((f) => [f.properties.id, f.properties.owner]));

test('punti di passaggio: file valido, legato alle province attuali e dichiarato ipotesi', () => {
  assert.equal(file.schema, CROSSING_POINTS_SCHEMA);
  assert.deepEqual(validateCrossingPoints(raw, { riverIds: new Set(catalog.map((r) => r.id)), provinceIds: ids }), []);
  assert.equal(raw.checksum, idsChecksum(ids), 'province cambiate: rigenerare con npm run build:crossing-points');
  assert.equal(file.quality, 'hypothesis');
  assert.ok(file.count > 500, `punti: ${file.count}`);
});

test('punti di passaggio: ogni punto sta sul suo fiume e tra due province diverse', () => {
  for (const p of file.points) {
    assert.notEqual(p.from, p.to, p.id);
    const d = distanceToRiverKm(model, p.riverId, p.lon, p.lat);
    // incrocio: sul fiume (bisezione); fiume-confine: sul fiume (punto di campionamento)
    assert.ok(d < 1.5, `${p.id} a ${d.toFixed(2)} km dal fiume`);
  }
});

test('punti di passaggio: gli incroci sono davvero sul confine (le due province sono a pochi km)', () => {
  const near = (id, lon, lat) => [0.02, -0.02].some((d) => [[d, 0], [0, d], [d, d], [-d, d]].some(([dx, dy]) => index.provincesAt(lon + dx, lat + dy).some((f) => f.properties.id === id)))
    || index.provincesAt(lon, lat).some((f) => f.properties.id === id);
  const sample = file.points.filter((p) => p.kind === 'border_cross').filter((_, i) => i % 12 === 0);
  assert.ok(sample.length > 50);
  for (const p of sample) assert.ok(near(p.from, p.lon, p.lat) && near(p.to, p.lon, p.lat), `${p.id}: ${p.from} / ${p.to}`);
});

test('punti di passaggio: Reno e Danubio hanno passaggi, anche tra nazioni diverse', () => {
  const of = (id) => file.points.filter((p) => p.riverId === id);
  assert.ok(of('R_RHINE').length >= 10);
  assert.ok(of('R_DANUBE').length >= 20);
  assert.ok(of('R_DANUBE').some((p) => ownerOf.get(p.from) !== ownerOf.get(p.to)), 'il Danubio passa tra nazioni');
  assert.ok(file.points.some((p) => p.kind === 'river_border'), 'fiumi che fanno da confine');
});

test('punti di passaggio: livello provvisorio dalla larghezza del fiume, 3 livelli definiti', () => {
  assert.deepEqual(CROSSING_LEVELS.map((l) => l.level), [1, 2, 3]);
  assert.equal(levelForRiver({ widthClass: 'small' }), 1);
  assert.equal(levelForRiver({ widthClass: 'medium' }), 2);
  assert.equal(levelForRiver({ widthClass: 'large' }), 3);
  for (const p of file.points) assert.equal(p.level, levelForRiver(riverById.get(p.riverId)), p.id);
  assert.ok(file.points.some((p) => p.level === 2) && file.points.some((p) => p.level === 3));
});

test('punti di passaggio: ricalcolando un fiume si ottengono gli stessi punti del file (Reno)', () => {
  const rhine = new Map([['R_RHINE', model.rivers.get('R_RHINE')]]);
  const got = computeCrossingPoints({ rivers: rhine }, index, catalog, file.params);
  assert.deepEqual(packCrossingPoints(got, ids), raw.points.filter((p) => p.riverId === 'R_RHINE'));
  assert.deepEqual(unpackCrossingPoints({ points: packCrossingPoints(got, ids) }, ids), got);
});

test('punti di passaggio: il validatore rifiuta id duplicati, livelli e tipi non validi', () => {
  const bad = { ...raw, count: 2, points: [{ ...raw.points[0] }, { ...raw.points[0], level: 9, kind: 'x', from: 99999 }] };
  const errors = validateCrossingPoints(bad);
  assert.ok(errors.some((e) => e.includes('duplicato')));
  assert.ok(errors.some((e) => e.includes('livello')));
  assert.ok(errors.some((e) => e.includes('tipo')));
  assert.ok(validateCrossingPoints(bad, { provinceIds: ids }).some((e) => e.includes('indice')));
  // nessun id di provincia per esteso nel file (precache: province di nazioni piccole in chunk separati)
  const text = readFileSync(new URL('../data/crossing_points.json', import.meta.url), 'utf8');
  assert.ok(!text.includes('P_CZE_') && !text.includes('P_LIE_') && !text.includes('P_DANZIG_'));
});

test('marcatori: il livello si riconosce da forma, colore e dimensione (tutti diversi, crescenti)', () => {
  const st = [1, 2, 3].map((l) => MARKER_STYLE[l]);
  assert.equal(new Set(st.map((s) => s.shape)).size, 3);
  assert.equal(new Set(st.map((s) => s.fill)).size, 3);
  assert.ok(st[0].size < st[1].size && st[1].size < st[2].size);
  const legend = markerLegend();
  assert.equal(legend.length, 3);
  assert.deepEqual(legend.map((l) => l.shape), ['circle', 'square', 'diamond']);
});

test('marcatori: a vista d\'insieme solo i pesanti, con lo zoom compaiono i più leggeri', () => {
  assert.equal(minLevelForZoom(1), 3);
  assert.equal(minLevelForZoom(3), 3);
  assert.equal(minLevelForZoom(5), 2);
  assert.equal(minLevelForZoom(10), 1);
  const markers = buildMarkers(file, 2);
  assert.equal(markers.length, file.count);
  assert.equal(markers[0].x, file.points[0].lon * 2);
  assert.equal(markers[0].y, -file.points[0].lat);
  const calls = { shapes: 0 };
  const ctx = new Proxy({}, { get: (t, k) => (k === 'beginPath' || k === 'closePath' ? () => { calls.shapes += k === 'beginPath' ? 1 : 0; } : () => {}), set: () => true });
  const all = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };
  const n3 = drawMarkers(ctx, markers, { sx: 10, k: 1, cull: all });
  const n2 = drawMarkers(ctx, markers, { sx: 10, k: 5, cull: all });
  const n1 = drawMarkers(ctx, markers, { sx: 10, k: 10, cull: all });
  assert.ok(n3 > 0 && n3 <= markers.filter((m) => m.level === 3).length);
  assert.ok(visibleMarkers(markers, { sx: 10, k: 1, cull: all }).every((m) => m.level === 3));
  assert.ok(visibleMarkers(markers, { sx: 10, k: 5, cull: all }).every((m) => m.level >= 2));
  assert.ok(n3 <= n2 && n2 <= n1 && n1 <= markers.length);
  // senza sovrapposizioni: due marcatori scelti non stanno mai nella stessa cella da 9 px
  const picked = visibleMarkers(markers, { sx: 10, k: 10, cull: all });
  assert.equal(new Set(picked.map((m) => `${Math.floor(m.x / 1)}|${Math.floor(m.y / 1)}`)).size, picked.length); // 10 px a zoom 10, sx = 10
  // un marcatore isolato di livello 1 sopravvive; uno pesante vicino toglie quello leggero nella stessa cella
  const two = [{ x: 0, y: 0, level: 1, kind: 'border_cross' }, { x: 0.1, y: 0.1, level: 3, kind: 'border_cross' }];
  assert.deepEqual(visibleMarkers(two, { sx: 10, k: 10, cull: all }).map((m) => m.level), [3]);
  assert.equal(drawMarkers(ctx, markers, { sx: 10, k: 6, cull: { x0: 1e8, x1: 1e9, y0: 1e8, y1: 1e9 } }), 0);
});
