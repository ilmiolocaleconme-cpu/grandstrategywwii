// Nomi delle nazioni: centro, scelta del pezzo principale, fusione degli imperi, soglie di zoom e collisioni.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/map/geo.js';
import { buildNationLabels, placeNationLabels, nationAlpha, groupByController } from '../src/map/nationLabels.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const rect = (lon0, lat0, lon1, lat1) => [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]];
const prov = (id, owner, polys) => ({
  id,
  props: { id, owner },
  feature: { geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } },
});
const names = { AAA: 'Alfa', BBB: 'Beta', CCC: 'Gamma' };

test('il nome sta al centro di un rettangolo', () => {
  const items = [prov('p1', 'AAA', [rect(0, 40, 10, 50)])];
  const [l] = buildNationLabels(items, names, {});
  const [cx, cy] = project(5, 45);
  assert.equal(l.text, 'ALFA');
  assert.ok(Math.abs(l.x - cx) < 0.6, `x ${l.x} vs ${cx}`);
  assert.ok(Math.abs(l.y - cy) < 0.6, `y ${l.y} vs ${cy}`);
});

test('un\'esclave lontana non sposta il nome: vince il pezzo più grande', () => {
  const items = [prov('p1', 'AAA', [rect(0, 40, 10, 50), rect(60, 20, 62, 22)])];
  const [l] = buildNationLabels(items, names, {});
  const [cx] = project(5, 45);
  assert.ok(Math.abs(l.x - cx) < 1, `x ${l.x}`);
});

test('un impero con uno stato fantoccio ha un solo nome, al centro dell\'insieme', () => {
  const items = [prov('p1', 'AAA', [rect(0, 40, 10, 50)]), prov('p2', 'BBB', [rect(10, 40, 20, 50)])];
  const out = buildNationLabels(items, names, { BBB: 'AAA' });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'AAA');
  const [cx] = project(10, 45);
  assert.ok(Math.abs(out[0].x - cx) < 0.8, `x ${out[0].x}`);
});

test('senza nome in elenco non c\'è scritta', () => {
  const items = [prov('p1', 'ZZZ', [rect(0, 40, 10, 50)])];
  assert.equal(buildNationLabels(items, names, {}).length, 0);
  assert.equal(groupByController(items, names, {}).length, 0);
});

test('forma a L: il nome cade dentro il territorio', () => {
  const L = [[[0, 40], [20, 40], [20, 44], [4, 44], [4, 60], [0, 60], [0, 40]]];
  const items = [prov('p1', 'AAA', [L])];
  const [l] = buildNationLabels(items, names, {});
  const [x0] = project(0, 0);
  const [x1] = project(20, 0);
  assert.ok(l.x >= x0 && l.x <= x1);
  assert.ok(l.y <= -40 && l.y >= -60);
});

test('soglie di zoom: nascosta se troppo piccola, bloccata al corpo massimo, svanisce con lo zoom', () => {
  const l = { id: 'AAA', text: 'ALFA', x: 0, y: 0, size: 1, length: 2.64 };
  assert.equal(placeNationLabels([l], 1, 5).length, 0); // 5 px < 11
  const mid = placeNationLabels([l], 1, 20);
  assert.equal(mid.length, 1);
  assert.equal(mid[0].size, 1);
  const big = placeNationLabels([l], 1, 100); // 100 px -> limitato a 34
  assert.ok(Math.abs(big[0].size * 100 - 34) < 1e-9);
  assert.equal(nationAlpha(1), 1);
  assert.equal(nationAlpha(8), 0);
  assert.equal(placeNationLabels([l], 8, 100).length, 0);
  assert.ok(nationAlpha(6) > 0 && nationAlpha(6) < 1);
});

test('due scritte sovrapposte: resta la più grande', () => {
  const a = { id: 'A', text: 'AAAA', x: 0, y: 0, size: 2, length: 5.28 };
  const b = { id: 'B', text: 'BBBB', x: 1, y: 0, size: 1, length: 2.64 };
  const out = placeNationLabels([a, b], 1, 10);
  assert.deepEqual(out.map((x) => x.id), ['A']);
});

test('copie del mondo: una scritta per copia', () => {
  const l = { id: 'A', text: 'AAAA', x: 0, y: 0, size: 2, length: 5.28 };
  assert.equal(placeNationLabels([l], 1, 10, [0, 100]).length, 2);
});

test('dati reali: ogni nazione ha una scritta dentro i limiti della mappa e il lavoro è abbastanza veloce', async () => {
  const collection = await loadProvinces();
  const items = collection.features.map((f) => ({ id: f.properties.id, props: f.properties, feature: f }));
  const nm = {};
  for (const it of items) nm[it.props.owner] = it.props.owner;
  const t0 = performance.now();
  const out = buildNationLabels(items, nm, {});
  const ms = performance.now() - t0;
  assert.equal(out.length, Object.keys(nm).length);
  for (const l of out) assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y) && l.size > 0, l.id);
  assert.ok(ms < 8000, `troppo lento: ${ms} ms`);
  console.log(`  nomi nazioni: ${out.length} in ${Math.round(ms)} ms (CPU piena)`);
});

test('una scritta che esce dalla vista scorre dentro, restando nell\'estensione della nazione', () => {
  const l = { id: 'A', text: 'AAAAAAAA', x: 100, y: 0, size: 2, length: 10.56, bx0: 60, bx1: 140, by0: -10, by1: 10 };
  const [p] = placeNationLabels([l], 1, 10, [0], { visible: { x0: 0, x1: 90, y0: -50, y1: 50 } });
  assert.ok(p.x + p.length / 2 <= 90 + 1e-9, `x ${p.x}`);
  assert.ok(p.x >= 60);
  const [q] = placeNationLabels([l], 1, 10, [0], { visible: { x0: 0, x1: 200, y0: -50, y1: 50 } });
  assert.equal(q.x, 100); // già in vista: non si sposta
});
