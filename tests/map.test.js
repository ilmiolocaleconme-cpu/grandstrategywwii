import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  project, ringToPath, featureToPath, featureAreaKm2, labelPoint, boundsOf,
  buildMapModel, buildWaterModel, buildLod, lodLevel, simplifyLine, nationalBorderPath, zoomAt, clampView, ownerColor, provinceFill, QUALITY_COLORS,
} from '../src/map/geo.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const provinces = await loadProvinces();
const political = JSON.parse(readFileSync(new URL('../data/political_1936.json', import.meta.url), 'utf8'));

const square = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

test('proiezione: y cresce verso sud e x è scalata col coseno della latitudine di riferimento', () => {
  const [x0, y0] = project(0, 47);
  assert.equal(x0, 0);
  assert.equal(y0, -47);
  const [x1] = project(10, 47);
  assert.ok(Math.abs(x1 - 10 * Math.cos((47 * Math.PI) / 180)) < 1e-12);
  assert.ok(project(0, 50)[1] < project(0, 40)[1]);
});

test('percorsi SVG: anelli chiusi e buchi nello stesso path', () => {
  assert.match(ringToPath(square(0, 0, 1)), /^M[\d. -]+(L[\d. -]+){4}Z$/);
  const f = { geometry: { type: 'Polygon', coordinates: [square(0, 40, 4), square(1, 41, 1).reverse()] } };
  assert.equal((featureToPath(f).match(/M/g) || []).length, 2);
  const m = { geometry: { type: 'MultiPolygon', coordinates: [[square(0, 40, 1)], [square(5, 40, 1)]] } };
  assert.equal((featureToPath(m).match(/Z/g) || []).length, 2);
});

test('area: un quadrato di 1° a 45° vale circa 8.700 km², il buco viene sottratto', () => {
  const full = { geometry: { type: 'Polygon', coordinates: [square(10, 45, 1)] } };
  const a = featureAreaKm2(full);
  assert.ok(a > 8500 && a < 8900, `area ${a}`);
  const holed = { geometry: { type: 'Polygon', coordinates: [square(10, 45, 1), square(10.25, 45.25, 0.5)] } };
  assert.ok(featureAreaKm2(holed) < a * 0.8);
});

test('punto etichetta: dentro il riquadro dell\'anello esterno più grande', () => {
  const f = { geometry: { type: 'MultiPolygon', coordinates: [[square(0, 40, 0.1)], [square(10, 45, 2)]] } };
  const [x, y] = labelPoint(f);
  const b = boundsOf([{ geometry: { type: 'Polygon', coordinates: [square(10, 45, 2)] } }]);
  assert.ok(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
});

test('zoom: il punto sotto il cursore resta fermo e i limiti sono rispettati', () => {
  const v0 = { k: 2, x: 5, y: -3 };
  const [cx, cy] = [40, 20];
  const v1 = zoomAt(v0, 1.5, cx, cy);
  // punto locale sotto il cursore prima e dopo
  const before = [(cx - v0.x) / v0.k, (cy - v0.y) / v0.k];
  const after = [(cx - v1.x) / v1.k, (cy - v1.y) / v1.k];
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9);
  assert.equal(zoomAt({ k: 39, x: 0, y: 0 }, 5, 0, 0).k, 40);
  assert.equal(zoomAt({ k: 1.2, x: 0, y: 0 }, 0.1, 0, 0).k, 1);
});

test('clampView: la mappa non può uscire del tutto dalla vista', () => {
  const bounds = { x: 0, y: -55, w: 20, h: 18 };
  const far = clampView({ k: 4, x: 5000, y: -5000 }, bounds);
  // il bordo sinistro della mappa (k*x + tx) deve restare dentro la vista
  assert.ok(far.k * bounds.x + far.x <= bounds.x + bounds.w);
  assert.ok(far.k * (bounds.y + bounds.h) + far.y >= bounds.y);
  const ok = clampView({ k: 1, x: 0, y: 0 }, bounds);
  assert.deepEqual(ok, { k: 1, x: 0, y: 0 });
});

test('colori: deterministici, una tinta per nazione, livello qualità coerente coi dati', () => {
  assert.equal(ownerColor('ITA', 'P_ITA_LAZIO'), ownerColor('ITA', 'P_ITA_LAZIO'));
  assert.notEqual(ownerColor('ITA', 'a'), ownerColor('POL', 'a'));
  assert.match(ownerColor('XXX', 'p'), /^hsl\(/);
  for (const f of provinces.features) {
    assert.ok(QUALITY_COLORS[f.properties.borderQuality], f.properties.id);
    assert.equal(provinceFill(f.properties, 'quality'), QUALITY_COLORS[f.properties.borderQuality]);
  }
});

test('modello della mappa: stesse province dei dati e delle regole, tutte disegnabili', () => {
  const model = buildMapModel(provinces);
  assert.equal(model.items.length, provinces.features.length);
  const ids = new Set(model.items.map((i) => i.id));
  assert.equal(ids.size, model.items.length);
  const index = buildProvinceIndex(provinces);
  for (const it of model.items) {
    assert.ok(it.d.startsWith('M') && it.d.endsWith('Z'), it.id);
    assert.ok(!it.d.includes('NaN'), it.id);
    assert.ok(it.areaKm2 > 1, `${it.id} area ${it.areaKm2}`);
    assert.ok(Number.isFinite(it.label[0]) && Number.isFinite(it.label[1]), it.id);
  }
  // Roma, cercata con le regole, è nella provincia che la mappa disegna come P_ITA_LAZIO
  assert.deepEqual(index.provincesAt(12.5, 41.9).map((f) => f.properties.id), ['P_ITA_LAZIO']);
  assert.ok(ids.has('P_ITA_LAZIO'));
  const { bounds } = model;
  // h < 28: dalla Germania del nord al Souss marocchino (29,1° N) l'altezza e ~27 unita; oltre sarebbe un'anomalia (Canarie, oltremare)
  assert.ok(bounds.w > 15 && bounds.h > 15 && bounds.h < 28, JSON.stringify(bounds));
});

test('ogni nazione disegnata ha un nome nel catalogo politico (legenda e pannello)', () => {
  const names = new Map(political.map((e) => [e.id, e.name]));
  for (const owner of new Set(provinces.features.map((f) => f.properties.owner))) {
    assert.ok(names.has(owner), `nome mancante per ${owner}`);
  }
});

test('fiumi e laghi: percorsi SVG aperti per le linee, ordine dal più piccolo al più grande', async () => {
  const { lineToPath, buildWaterModel, RIVER_WIDTH_PX } = await import('../src/map/geo.js');
  assert.ok(!lineToPath([[10, 45], [11, 45.5]]).endsWith('Z'));
  assert.match(lineToPath([[10, 45], [11, 45.5]]), /^M[\d. -]+L[\d. -]+$/);
  const rivers = JSON.parse(readFileSync(new URL('../data/rivers.json', import.meta.url), 'utf8'));
  const geo = JSON.parse(readFileSync(new URL('../data/rivers_geo.json', import.meta.url), 'utf8'));
  const lakes = JSON.parse(readFileSync(new URL('../data/lakes.json', import.meta.url), 'utf8'));
  const w = buildWaterModel(rivers, geo, lakes);
  assert.equal(w.lines.length, geo.features.length);
  assert.equal(w.lakes.length, lakes.features.length);
  for (let i = 1; i < w.lines.length; i++) assert.ok(w.lines[i - 1].rank >= w.lines[i].rank);
  assert.ok(w.lines.every((l) => !l.d.includes('NaN') && l.width > 0));
  assert.equal(w.lines.at(-1).width, RIVER_WIDTH_PX.large);
});

const feat = (id, owner, ring) => ({ properties: { id, owner }, geometry: { type: 'Polygon', coordinates: [ring] } });

test('bordi nazionali: l\'arco condiviso da due province dello stesso Stato non c\'è, quello tra Stati diversi sì', () => {
  const a = [[0, 40], [1, 40], [1, 41], [0, 41], [0, 40]];
  const b = [[1, 40], [2, 40], [2, 41], [1, 41], [1, 40]];
  const same = nationalBorderPath({ features: [feat('A', 'X', a), feat('B', 'X', b)] });
  const diff = nationalBorderPath({ features: [feat('A', 'X', a), feat('B', 'Y', b)] });
  const segs = (d) => (d.match(/L/g) || []).length;
  assert.equal(segs(diff), 8); // tutti gli archi: 4 + 4
  assert.equal(segs(same), 6); // meno i due lati condivisi (uno per provincia)
  assert.ok(segs(same) < segs(diff));
});

test('bordi nazionali sulla mappa reale: meno vertici del totale delle province e percorso non vuoto', () => {
  const model = buildMapModel(provinces);
  assert.ok(model.borderD.length > 1000);
  assert.ok((model.borderD.match(/[LM]/g) || []).length < (model.items.map((i) => i.d).join('').match(/[LM]/g) || []).length);
});

test('simplifyLine: tiene gli estremi, toglie i punti vicini alla retta e non allontana oltre la tolleranza', () => {
  const line = [[0, 0], [1, 0.01], [2, -0.01], [3, 0], [4, 2], [5, 0]];
  const out = simplifyLine(line, 0.1);
  assert.deepEqual(out[0], line[0]);
  assert.deepEqual(out[out.length - 1], line[line.length - 1]);
  assert.ok(out.length < line.length);
  assert.ok(out.some((p) => p[0] === 4 && p[1] === 2)); // la punta resta
  assert.deepEqual(simplifyLine(line, 0), line);
});

test('livelli semplificati: molti meno punti, nessuna provincia svuotata, bordi esterni presenti', () => {
  const count = (d) => (d.match(/[ML]/g) ?? []).length;
  const lod = buildLod(provinces);
  const full = buildMapModel(provinces);
  const pts = (get) => full.items.reduce((a, i) => a + count(get(i)), 0);
  const fullPts = pts((i) => i.d);
  assert.ok(pts((i) => lod.items.get(i.id)[0]) < fullPts / 5);
  assert.ok(pts((i) => lod.items.get(i.id)[1]) < fullPts / 3);
  assert.ok(full.items.every((i) => lod.items.get(i.id).every((d) => d.length > 0)));
  assert.ok(count(lod.borders[0]) > 0 && count(lod.borders[0]) < count(full.borderD) / 5);
  assert.equal(lodLevel(1), 0);
  assert.equal(lodLevel(5), 1);
  assert.equal(lodLevel(20), 2);
  assert.ok(pts((i) => lod.items.get(i.id)[2]) < fullPts * 0.6);
});

test('fiumi e laghi: versioni semplificate presenti e con meno punti', () => {
  const rivers = JSON.parse(readFileSync(new URL('../data/rivers.json', import.meta.url), 'utf8'));
  const geo = JSON.parse(readFileSync(new URL('../data/rivers_geo.json', import.meta.url), 'utf8'));
  const lakes = JSON.parse(readFileSync(new URL('../data/lakes.json', import.meta.url), 'utf8'));
  const w = buildWaterModel(rivers, geo, lakes);
  const count = (d) => (d.match(/[ML]/g) ?? []).length;
  assert.ok(w.lines.every((l) => l.low.length === 3 && l.low.every((d) => count(d) >= 2)));
  assert.ok(w.lines.reduce((a, l) => a + count(l.low[0]), 0) < w.lines.reduce((a, l) => a + count(l.d), 0) / 2);
  assert.ok(w.lakes.every((l) => l.low.length === 3));
});
