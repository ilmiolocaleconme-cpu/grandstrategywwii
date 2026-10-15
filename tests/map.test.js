import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  project, ringToPath, featureToPath, featureAreaKm2, labelPoint, boundsOf,
  buildMapModel, buildWaterModel, buildLod, lodLevel, simplifyLine, nationalBorderPath, zoomAt, clampView, ownerColor, provinceFill, QUALITY_COLORS,
  WORLD_W, MAX_LAT, wrapLon, lonDelta, wrapView, visibleCopies,
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
  // h < 55: da Capo Nord (71° N) al Sahara libico (19° N) l'altezza e ~52 unita; oltre sarebbe un'anomalia (territori oltremare lontani)
  assert.ok(bounds.w > 15 && bounds.h > 15 && bounds.h < 55, JSON.stringify(bounds));
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

// --- mappa circumnavigabile ---

test('longitudine: wrapLon porta in [-180, 180) e lonDelta sceglie sempre la via piu breve', () => {
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-190), 170);
  assert.equal(wrapLon(540), -180);
  assert.equal(wrapLon(10), 10);
  assert.equal(lonDelta(170, -170), 20); // verso est attraverso l'antimeridiano
  assert.equal(lonDelta(-170, 170), -20); // verso ovest
  assert.equal(lonDelta(10, 40), 30);
  assert.equal(lonDelta(0, 180), -180); // meta giro: convenzionalmente verso ovest
});

test('wrapView: un giro completo di spostamento da la stessa vista; il centro resta tra -180 e 180 gradi', () => {
  const vb = { x: -10, y: -60, w: 50, h: 40 };
  const v = { k: 3, x: -30, y: 10 };
  const turn = wrapView({ ...v, x: v.x - WORLD_W * v.k }, vb);
  const base = wrapView(v, vb);
  assert.ok(Math.abs(turn.x - base.x) < 1e-9 && turn.y === base.y && turn.k === base.k);
  // spostamenti enormi (molti giri) restano normalizzati
  for (const dx of [-1e6, -123456.7, 0, 98765.4, 1e6]) {
    const w = wrapView({ k: 2, x: dx, y: 0 }, vb);
    const cx = (vb.x + vb.w / 2 - w.x) / w.k;
    assert.ok(cx >= -WORLD_W / 2 - 1e-6 && cx < WORLD_W / 2 + 1e-6, `centro ${cx}`);
  }
  // idempotente
  assert.deepEqual(wrapView(base, vb), base);
});

test('wrapView: in verticale la vista non supera +-MAX_LAT; una vista valida resta identica', () => {
  const vb = { x: -10, y: -60, w: 50, h: 40 };
  const up = wrapView({ k: 2, x: 0, y: 1e5 }, vb); // trascinata molto in basso: si vede il nord oltre il polo
  const top = (vb.y - up.y) / up.k;
  assert.ok(Math.abs(top - -MAX_LAT) < 1e-9, String(top));
  const down = wrapView({ k: 2, x: 0, y: -1e5 }, vb);
  const bottom = (vb.y - down.y) / down.k + vb.h / down.k;
  assert.ok(Math.abs(bottom - MAX_LAT) < 1e-9, String(bottom));
  const ok = { k: 1, x: 0, y: 0 };
  assert.deepEqual(wrapView(ok, vb), ok);
});

test('visibleCopies: una sola copia nella vista iniziale; da lontano, a ogni longitudine se ne vede almeno una', () => {
  const bounds = { x: -21, y: -56, w: 52, h: 37 }; // da -31 a 45 gradi di longitudine, come i dati
  const vb = { x: -22, y: -57, w: 54, h: 39 };
  assert.deepEqual(visibleCopies({ k: 1, x: 0, y: 0 }, vb, bounds), [0]);
  // in zoom normale e centrati sull'antimeridiano (oceano) non si vede nessuna copia
  const cxLocal = WORLD_W / 2;
  assert.deepEqual(visibleCopies({ k: 1, x: vb.x + vb.w / 2 - cxLocal, y: 0 }, vb, bounds), []);
  // con la vista allargata (k=0.2, ~320 gradi) i dati compaiono comunque, anche due volte ai bordi
  let twice = 0;
  for (let lon = -180; lon < 180; lon += 5) {
    const view = wrapView({ k: 0.2, x: vb.x + vb.w / 2 - lon * Math.cos((47 * Math.PI) / 180) * 0.2, y: 0 }, vb);
    const c = visibleCopies(view, vb, bounds);
    assert.ok(c.length >= 1 && c.length <= 2, `lon ${lon}: ${JSON.stringify(c)}`);
    if (c.length === 2) twice += 1;
  }
  assert.ok(twice > 0, 'ai lati dell\'antimeridiano le copie sono due');
});

test('dati: nessun anello attraversa l\'antimeridiano (salto di longitudine > 180 gradi tra due vertici)', () => {
  for (const f of provinces.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        assert.ok(Math.abs(ring[i + 1][0] - ring[i][0]) < 180, `${f.properties.id}: salto di longitudine`);
      }
      assert.ok(ring.every(([lon]) => lon >= -180 && lon <= 180), f.properties.id);
    }
  }
});

test('pickLabels: nessuna sovrapposizione, rispetta il tetto e salta le province troppo piccole per il nome', async () => {
  const { buildMapModel, pickLabels } = await import('../src/map/geo.js');
  const model = buildMapModel(provinces);
  const vb = { x: model.bounds.x, y: model.bounds.y, w: model.bounds.w, h: model.bounds.h };
  const pxPerUnit = 360 / vb.w; // telefono stretto
  for (const k of [1, 2, 4, 8, 16]) {
    const view = { k, x: 0, y: 0 };
    const out = pickLabels(model.items, view, vb, pxPerUnit);
    assert.ok(out.length <= 70, `k=${k}: tetto rispettato`);
    const rects = out.map((l) => {
      const px = (k * l.x + view.x - vb.x) * pxPerUnit;
      const py = (k * l.y + view.y - vb.y) * pxPerUnit;
      const w = l.name.length * 11 * 0.56;
      return [px - w / 2, py - 6, px + w / 2, py + 6];
    });
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), `k=${k}: ${out[i].name} / ${out[j].name} si sovrappongono`);
      }
    }
  }
  // zoomando compaiono più etichette (fino al tetto), non meno
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  const n = (k) => pickLabels(model.items, zoomAt({ k: 1, x: 0, y: 0 }, k, cx, cy), vb, pxPerUnit).length;
  assert.ok(n(4) > n(1), `k=1: ${n(1)}, k=4: ${n(4)}`);
});

test('colore politico: le colonie prendono il colore di chi le controlla nel 1936 (Libia = Italia)', async () => {
  const { controllerOf, provinceFill } = await import('../src/map/geo.js');
  const political = JSON.parse(readFileSync(new URL('../data/political_1936.json', import.meta.url)));
  const control = Object.fromEntries(political.map((e) => [e.id, e.controller ?? e.id]));
  const ids = new Set(political.map((e) => e.id));
  assert.equal(controllerOf('LBA', control), 'ITA');
  assert.equal(controllerOf('DOD', control), 'ITA');
  assert.equal(controllerOf('ALG', control), 'FRA');
  assert.equal(controllerOf('SYR', control), 'FRA'); // mandato francese
  assert.equal(controllerOf('PAL', control), 'GBR'); // mandato britannico
  assert.equal(controllerOf('MAR_ES', control), 'ESP');
  // stessa tinta (il colore cambia solo di luminosità per provincia): confronto con lo stesso id
  assert.equal(provinceFill({ owner: 'LBA', id: 'x' }, 'political', control), provinceFill({ owner: 'ITA', id: 'x' }, 'political'));
  assert.notEqual(provinceFill({ owner: 'LBA', id: 'x' }, 'political'), provinceFill({ owner: 'ITA', id: 'x' }, 'political'));
  // ogni territorio con province ha un controllore che esiste
  for (const f of provinces.features) {
    const c = controllerOf(f.properties.owner, control);
    assert.ok(ids.has(c), `${f.properties.id}: controllore ${c} inesistente`);
  }
});
