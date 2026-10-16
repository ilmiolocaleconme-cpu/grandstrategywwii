// Prototipo del renderer Canvas 2D: parti pure (modello in array tipizzati, bordi, semplificazione, ricerca del punto,
// matematica della vista). Il disegno vero e proprio (Path2D, contesto 2D) gira solo nel browser: lo copre scripts/bench/measure.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMapModel, buildLod, nationalBorderPath, project, HOME_BOUNDS, WORLD_W, zoomAt, wrapView } from '../src/map/geo.js';
import { buildCanvasModel, buildBorders, createLodJob, createBorderLodJob, pickProvinceAt, pickRiverNear, buildCanvasWater, CANVAS_LOD_TOLS } from '../src/map/canvasModel.js';
import { layoutOf, affineOf, screenToUnit, screenToView, blitPlan, coversScreen, lodLevelForScale, regionToUnits } from '../src/map/canvasView.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const provinces = await loadProvinces();
const cm = buildCanvasModel(provinces);

test('modello canvas: stesse province, stessa area e stessi limiti del modello SVG', () => {
  const svg = buildMapModel(provinces);
  assert.equal(cm.items.length, svg.items.length);
  cm.items.forEach((it, i) => {
    assert.equal(it.id, svg.items[i].id);
    assert.equal(it.areaKm2, svg.items[i].areaKm2, it.id);
    assert.deepEqual(it.bbox, svg.items[i].bbox, it.id);
    assert.ok(it.ringEnd > it.ringStart, it.id);
  });
  assert.deepEqual(cm.bounds, svg.bounds);
  // ogni anello è chiuso e ha almeno 4 punti; nessun valore non numerico
  for (let r = 0; r + 1 < cm.ringOffsets.length; r += 1) {
    const s = cm.ringOffsets[r];
    const e = cm.ringOffsets[r + 1];
    assert.ok(e - s >= 4, `anello ${r}`);
    assert.equal(cm.coords[2 * s], cm.coords[2 * (e - 1)]);
    assert.equal(cm.coords[2 * s + 1], cm.coords[2 * (e - 1) + 1]);
  }
  assert.ok(cm.coords.every(Number.isFinite));
});

test('modello canvas: la proiezione dei vertici è quella di project() (float32)', () => {
  const f = provinces.features[0];
  const ring = (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0])[0];
  const it = cm.items[0];
  const s = cm.ringOffsets[it.ringStart];
  ring.forEach(([lon, lat], i) => {
    const [x, y] = project(lon, lat);
    assert.equal(cm.coords[2 * (s + i)], Math.fround(x));
    assert.equal(cm.coords[2 * (s + i) + 1], Math.fround(y));
  });
});

test('bordi nazionali canvas: stesse polilinee (e stesso numero di vertici) del percorso SVG', () => {
  const b = buildBorders(cm);
  const d = nationalBorderPath(provinces);
  const runs = (d.match(/M/g) ?? []).length;
  const verts = (d.match(/[ML]/g) ?? []).length;
  assert.equal(b.runStarts.length - 1, runs);
  assert.equal(b.points.length / 2, verts);
});

test('versioni semplificate canvas (Douglas-Peucker e veloce): meno vertici, anelli sempre validi, cucitura intatta; il numero di vertici DP è vicino a quello SVG', () => {
  const full = cm.coords.length / 2;
  const lodSvg = buildLod(provinces);
  for (const method of ['radial', 'dp']) CANVAS_LOD_TOLS.forEach((tol, lv) => {
    const job = createLodJob(cm, tol, method);
    let res = null;
    while (!res) res = job.step(1000);
    assert.equal(res.ringOffsets.length, cm.ringOffsets.length);
    const n = res.coords.length / 2;
    assert.ok(n < full, `livello ${lv}: ${n} < ${full}`);
    for (let r = 0; r + 1 < res.ringOffsets.length; r += 1) {
      const s = res.ringOffsets[r];
      const e = res.ringOffsets[r + 1];
      assert.ok(e - s >= 4, `livello ${lv} anello ${r}`);
      assert.equal(res.coords[2 * s], res.coords[2 * (e - 1)], 'anello chiuso');
    }
    for (const it of cm.items.filter((i) => i.hasSeam)) {
      const a = res.ringOffsets[it.ringStart];
      const e = res.ringOffsets[it.ringEnd];
      const f0 = cm.ringOffsets[it.ringStart];
      const f1 = cm.ringOffsets[it.ringEnd];
      assert.equal(e - a, f1 - f0, `${it.id}: cucitura al dettaglio pieno`);
    }
    // confronto con la semplificazione SVG (stesso algoritmo, float32 contro float64): scarto piccolo
    let svgVerts = 0;
    for (const paths of lodSvg.items.values()) svgVerts += (paths[lv].match(/[ML]/g) ?? []).length;
    if (method === 'dp') assert.ok(Math.abs(n - svgVerts) / svgVerts < 0.03, `livello ${lv}: canvas ${n}, svg ${svgVerts}`);
  });
  const b = buildBorders(cm);
  for (const method of ['radial', 'dp']) {
    const jb = createBorderLodJob(b, CANVAS_LOD_TOLS[0], method);
    let rb = null;
    while (!rb) rb = jb.step(1000);
    assert.equal(rb.runStarts.length, b.runStarts.length, method);
    assert.ok(rb.points.length < b.points.length, method);
    // gli estremi di ogni polilinea restano
    for (let k = 0; k + 1 < b.runStarts.length; k += 1) {
      const so = b.runStarts[k];
      const eo = b.runStarts[k + 1] - 1;
      assert.equal(rb.points[2 * rb.runStarts[k]], b.points[2 * so], `${method}: inizio ${k}`);
      assert.equal(rb.points[2 * (rb.runStarts[k + 1] - 1)], b.points[2 * eo], `${method}: fine ${k}`);
    }
  }
});

test('ricerca della provincia: concorda con l\'indice delle regole su città note e su punti sparsi', () => {
  const index = buildProvinceIndex(provinces);
  const cities = [[12.5, 41.9, 'P_ITA_LAZIO'], [2.35, 48.85, null], [13.4, 52.5, null], [37.6, 55.75, null], [-3.7, 40.4, null]];
  for (const [lon, lat, id] of cities) {
    const [x, y] = project(lon, lat);
    const it = pickProvinceAt(cm, x, y);
    const expected = index.provincesAt(lon, lat);
    if (id) assert.equal(it?.id, id);
    assert.equal(it?.id ?? null, expected.length === 1 ? expected[0].properties.id : it?.id ?? null, `${lon},${lat}`);
  }
  // punti sparsi (generatore deterministico): dove le regole indicano una sola provincia la mappa indica la stessa
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let checked = 0;
  let wrong = 0;
  for (let n = 0; n < 1500; n += 1) {
    const lon = -20 + rnd() * 100;
    const lat = 20 + rnd() * 50;
    const hits = index.provincesAt(lon, lat);
    if (hits.length !== 1) continue;
    const [x, y] = project(lon, lat);
    checked += 1;
    if (pickProvinceAt(cm, x, y)?.id !== hits[0].properties.id) wrong += 1;
  }
  assert.ok(checked > 300, `punti controllati: ${checked}`);
  assert.ok(wrong <= checked * 0.002, `${wrong} discordanze su ${checked}`);
  // il mare aperto non è in nessuna provincia
  const [sx, sy] = project(-15, 40);
  assert.equal(pickProvinceAt(cm, sx, sy), null);
});

test('ricerca del fiume: il tratto vicino si trova, quello lontano o dentro un lago no, il fiume selezionato sì', () => {
  const rivers = [{ id: 'R1', widthClass: 'large', scalerank: 3 }, { id: 'R2', widthClass: 'small', scalerank: 9 }];
  const geo = {
    features: [
      { properties: { riverId: 'R1', segment: 0 }, geometry: { type: 'LineString', coordinates: [[0, 40], [10, 40]] } },
      { properties: { riverId: 'R2', segment: 0, inLake: true }, geometry: { type: 'LineString', coordinates: [[0, 50], [10, 50]] } },
    ],
  };
  const lakes = { features: [] };
  const w = buildCanvasWater(rivers, geo, lakes, (r) => (r?.widthClass === 'large' ? 2.4 : 0.9), (r) => r?.scalerank ?? 99);
  const [x, y] = project(5, 40);
  assert.equal(pickRiverNear(w, x, y + 0.05, 0.1, 5), 'R1');
  assert.equal(pickRiverNear(w, x, y + 1, 0.1, 5), null);
  const [x2, y2] = project(5, 50);
  assert.equal(pickRiverNear(w, x2, y2, 0.1, 99), null, 'tratto dentro un lago non selezionabile');
  assert.equal(pickRiverNear(w, x2, y2, 0.1, 99, 'R2'), 'R2', 'ma se il fiume è selezionato sì');
  assert.equal(pickRiverNear(w, x, y, 0.1, 2), null, 'rango oltre la soglia di densità');
});

// --- vista --------------------------------------------------------------------------------------------------------
const vb = { x: HOME_BOUNDS.x - 1, y: HOME_BOUNDS.y - 1, w: HOME_BOUNDS.w + 2, h: HOME_BOUNDS.h + 2 };

test('vista canvas: layout "meet" centrato e conversioni schermo <-> unità inverse tra loro', () => {
  const lay = layoutOf(vb, 390, 688);
  assert.equal(lay.s, Math.min(390 / vb.w, 688 / vb.h));
  assert.ok(Math.abs(lay.ox) < 1e-9 || Math.abs(lay.oy) < 1e-9, 'si adatta in una dimensione');
  const view = { k: 2.5, x: -3.2, y: 4.1 };
  for (const [px, py] of [[0, 0], [195, 344], [389, 687]]) {
    const [u, v] = screenToUnit(view, vb, lay, px, py);
    const a = affineOf(view, vb, lay);
    assert.ok(Math.abs(a.sx * u + a.tx - px) < 1e-9 && Math.abs(a.sx * v + a.ty - py) < 1e-9);
  }
  // le coordinate della vista (per zoomAt) sono quelle dell'SVG: il punto resta fermo zoomando
  const [cx, cy] = screenToView(vb, lay, 100, 200);
  const z = zoomAt(view, 1.7, cx, cy, 0.3);
  const before = screenToUnit(view, vb, lay, 100, 200);
  const after = screenToUnit(z, vb, lay, 100, 200);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9);
});

test('vista canvas: la bitmap portata alla nuova vista combacia con il disegno diretto della nuova vista', () => {
  const lay = layoutOf(vb, 390, 688);
  const v0 = { k: 1, x: 0, y: 0 };
  const region = { x: -117, y: -206, w: 624, h: 1100 };
  for (const v1 of [{ k: 1, x: 5, y: -3 }, { k: 1.8, x: -2, y: 1 }, { k: 0.6, x: 4, y: 9 }]) {
    const plan = blitPlan(v0, v1, vb, lay, region);
    const a0 = affineOf(v0, vb, lay);
    const a1 = affineOf(v1, vb, lay);
    for (const [u, v] of [[0, -50], [-12, -30], [20, -45]]) {
      const p0x = a0.sx * u + a0.tx;
      const p0y = a0.sx * v + a0.ty;
      const dx = plan.x + ((p0x - region.x) / region.w) * plan.w;
      const dy = plan.y + ((p0y - region.y) / region.h) * plan.h;
      assert.ok(Math.abs(dx - (a1.sx * u + a1.tx)) < 1e-6 && Math.abs(dy - (a1.sx * v + a1.ty)) < 1e-6, JSON.stringify(v1));
    }
  }
  assert.ok(coversScreen(blitPlan(v0, v0, vb, lay, region), 390, 688));
  assert.ok(!coversScreen(blitPlan(v0, { k: 1, x: 200, y: 0 }, vb, lay, region), 390, 688), 'spostamento oltre il margine: bordo vuoto');
});

test('vista canvas: livello di semplificazione crescente con lo zoom, dettaglio pieno oltre l\'ultimo', () => {
  const lv = (sx) => lodLevelForScale(sx, CANVAS_LOD_TOLS);
  assert.equal(lv(5.5), 0);
  assert.equal(lv(11), 1);
  assert.equal(lv(22), 2);
  assert.equal(lv(500), 3);
  let prev = 0;
  for (let sx = 1; sx < 400; sx *= 1.3) { assert.ok(lv(sx) >= prev); prev = lv(sx); }
  const lay = layoutOf(vb, 390, 688);
  const r = regionToUnits({ k: 1, x: 0, y: 0 }, vb, lay, { x: 0, y: 0, w: 390, h: 688 });
  assert.ok(r.x1 > r.x0 && r.y1 > r.y0);
});

test('vista canvas: la normalizzazione del giro del mondo non cambia l\'immagine (stessa trasformazione modulo un giro)', () => {
  const lay = layoutOf(vb, 390, 688);
  const raw = { k: 2, x: -WORLD_W * 2 - 3, y: 5 };
  const norm = wrapView(raw, vb);
  const a = affineOf(raw, vb, lay);
  const b = affineOf(norm, vb, lay);
  const turns = (b.tx - a.tx) / (lay.s * WORLD_W * raw.k);
  assert.ok(Math.abs(turns - Math.round(turns)) < 1e-9, 'differenza = numero intero di giri');
});
