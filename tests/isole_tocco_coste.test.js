// Tocco sulle isole piccole, unione dei pezzi di Matera, ritaglio dei dischi città sulla terra, zone di mare dell'Asia orientale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCanvasModel, nearestSmallProvinceAt, pickProvinceAt } from '../src/map/canvasModel.js';
import { WORLD_W } from '../src/map/geo.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { mergeRings, mergePolys } from '../scripts/merge-split-polygons.js';
import { clipConvex } from '../scripts/clip-city-discs.js';

const provinces = await loadProvinces();
const model = buildCanvasModel(provinces);
const json = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const COS0 = WORLD_W / 360; // il modello usa x = lon * COS0, y = -lat

test('tocco: un punto in mare a ~0,05° da Malta sceglie l\'isola; lontano non sceglie nulla', () => {
  assert.equal(pickProvinceAt(model, 14.4 * COS0, -35.9)?.id, 'P_MLT_MALTA'); // dentro
  assert.equal(pickProvinceAt(model, 14.62 * COS0, -35.85), null); // fuori dal contorno: da solo non basta
  const near = nearestSmallProvinceAt(model, 14.62 * COS0, -35.85, 0.1 * COS0, 3); // ma entro la tolleranza vince l'isola
  assert.equal(near?.id, 'P_MLT_MALTA');
  assert.equal(nearestSmallProvinceAt(model, 16.5 * COS0, -35.85, 0.1 * COS0, 3), null);
  assert.equal(nearestSmallProvinceAt(model, 14.62 * COS0, -35.85, 0, 3), null, 'tolleranza 0: nessun aggancio');
});

test('tocco: una provincia grande non è mai agganciata come isola piccola', () => {
  const italia = nearestSmallProvinceAt(model, 12.5 * COS0, -(41.9), 5, 0.5);
  assert.ok(!italia || (model.items.find((i) => i.id === italia.id).bbox.w <= 0.5));
});

test('Matera: un solo poligono, senza la retta di taglio interna', () => {
  const f = provinces.features.find((x) => x.properties.id === 'P_ITA_MATERA');
  assert.equal(f.geometry.type, 'Polygon');
  const sud = provinces.features.find((x) => x.properties.id === 'P_ITA_POTENZA_SUD');
  assert.equal(sud.geometry.type, 'Polygon');
});

test('unione anelli: due quadrati affiancati diventano un rettangolo; anelli separati restano separati', () => {
  const a = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const b = [[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]];
  const m = mergeRings(a, b);
  assert.ok(m && m.length === 7, JSON.stringify(m)); // 6 vertici + chiusura (i due punti sul lato comune restano come vertici)
  assert.equal(mergeRings(a, [[5, 5], [6, 5], [6, 6], [5, 5]]), null);
  assert.equal(mergePolys([[a], [b]]).polys.length, 1);
  assert.equal(mergePolys([[a], [[[5, 5], [6, 5], [6, 6], [5, 5]]]]).polys.length, 2);
});

test('ritaglio convesso: un triangolo grande ritagliato da un quadrato resta dentro il quadrato', () => {
  const sq = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const out = clipConvex([[-5, -5], [10, -5], [-5, 10]], sq);
  assert.ok(out.length >= 3 && out.every(([x, y]) => x >= -1e-9 && x <= 2 + 1e-9 && y >= -1e-9 && y <= 2 + 1e-9));
});

test('La Valletta: ogni vertice della zona città sta dentro Malta o a meno di 0,03° dalla sua costa', () => {
  const f = json('citta_grandi.json').features.find((x) => x.properties.id === 'P_MLT_LA_VALLETTA_CITTA');
  for (const [lon, lat] of f.geometry.coordinates[0]) {
    const dentro = pickProvinceAt(model, lon * COS0, -lat)?.id === 'P_MLT_MALTA';
    const vicino = nearestSmallProvinceAt(model, lon * COS0, -lat, 0.03 * COS0, 3)?.id === 'P_MLT_MALTA';
    assert.ok(dentro || vicino, `${lon},${lat}`);
  }
});

test('Mare del Giappone: diviso, nessuna zona sopra 800 mila km2 nell\'area e stretti presenti', () => {
  const zones = json('sea_zones.json').zones;
  const by = Object.fromEntries(zones.map((z) => [z.id, z]));
  assert.ok(by.SZ_MARE_GIAPPONE.areaKm2 < 800000, String(by.SZ_MARE_GIAPPONE.areaKm2));
  for (const id of ['SZ_MARE_GIAPPONE_NORD', 'SZ_STRETTO_TATARI', 'SZ_STRETTO_LA_PEROUSE', 'SZ_STRETTO_TSUGARU', 'SZ_TOHOKU_PAC']) assert.ok(by[id], id);
});

test('zone di mare: nessun buco minuscolo a griglia (rettangoli attorno alle isole)', () => {
  const inRing = (o, x, y) => { let ins = false; for (let i = 0, j = o.length - 1; i < o.length; j = i, i += 1) { const [xi, yi] = o[i]; const [xj, yj] = o[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  for (const z of json('sea_zones.json').zones) {
    for (const r of z.rings) {
      if (r.length > 6) continue;
      const xs = r.map((p) => p[0]); const ys = r.map((p) => p[1]);
      if (Math.max(...xs) - Math.min(...xs) > 0.25 || Math.max(...ys) - Math.min(...ys) > 0.25) continue;
      const depth = z.rings.filter((o) => o !== r && o.length > r.length && inRing(o, r[0][0], r[0][1])).length;
      assert.ok(depth % 2 === 0, `${z.id}: buco di griglia`);
    }
  }
});
