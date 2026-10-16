import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import {
  HOME_BOUNDS, WORLD_W, buildMapModel, featureToStrokePath, hasSeam, isSeamEdge, nationalBorderPath, polygonsOf, project, visibleCopies, featureAreaKm2,
} from '../src/map/geo.js';

const provinces = await loadProvinces();
const index = buildProvinceIndex(provinces);
const ussr = provinces.features.filter((f) => f.properties.owner === 'USSR');
const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);
const CHUKOTKA = 'P_USSR_CHUKCHI_AUTONOMOUS_OKRUG';
const COS0 = project(1, 0)[0];

test('URSS: 177 unità, id unici, qualità ipotesi, fonte e licenza, repubbliche del 1936 nelle note', () => {
  assert.equal(ussr.length, 177);
  assert.equal(new Set(ussr.map((f) => f.properties.id)).size, 177);
  for (const f of ussr) {
    const p = f.properties;
    assert.ok(/^P_USSR_[A-Z0-9_]+$/.test(p.id) && p.id === f.id, p.id);
    assert.equal(p.borderQuality, 'hypothesis', p.id);
    assert.ok(p.source && p.license && p.knownIssues.includes('modern_borders'), p.id);
    assert.match(p.notes, /Repubblica del 1936: /, p.id);
    assert.equal(f.geometry.type, 'MultiPolygon', p.id);
  }
  const rep = {};
  for (const f of ussr) { const r = f.properties.notes.match(/Repubblica del 1936: ([^.]+)\./)[1]; rep[r] = (rep[r] ?? 0) + 1; }
  assert.deepEqual(rep, { RSFSR: 81, 'RSS Ucraina': 18, 'RSS Bielorussa': 4, 'ASSR Kazaka': 14, 'RSS Uzbeka': 13, 'RSS Turkmena': 5, 'RSS Tagika': 4, 'ASSR Kirghisa': 7, 'RSFS Transcaucasica': 31 });
});

test('URSS: anelli chiusi e nessun anello attraversa l\'antimeridiano', () => {
  for (const f of ussr) {
    for (const poly of polygonsOf(f)) {
      for (const ring of poly) {
        assert.deepEqual(ring[0], ring[ring.length - 1], `${f.id}: anello non chiuso`);
        assert.ok(ring.length >= 4, f.id);
        const lons = ring.map((p) => p[0]);
        assert.ok(lons.every((x) => x >= -180 && x <= 180), `${f.id}: longitudine fuori intervallo`);
        // un anello sta tutto a est (>0) o tutto a ovest (<0) della cucitura, salvo i vertici sulla cucitura stessa
        assert.ok(!(lons.some((x) => x > 0 && x < 180) && lons.some((x) => x < 0 && x > -180) && Math.max(...lons) - Math.min(...lons) > 180) || f.id.includes('X'), `${f.id}: anello a cavallo di ±180`);
        for (let i = 0; i + 1 < ring.length; i += 1) assert.ok(Math.abs(ring[i + 1][0] - ring[i][0]) < 180, `${f.id}: arco che salta il globo`);
      }
    }
  }
});

test('cucitura: la Ciukotka ha una parte a +180 e una a -180 con gli stessi vertici', () => {
  const f = provinces.features.find((x) => x.properties.id === CHUKOTKA);
  const plus = new Set();
  const minus = new Set();
  for (const poly of polygonsOf(f)) for (const ring of poly) for (const [lon, lat] of ring) { if (lon === 180) plus.add(lat); if (lon === -180) minus.add(lat); }
  assert.ok(plus.size >= 2, 'nessun vertice a +180');
  assert.deepEqual([...plus].sort((a, b) => a - b), [...minus].sort((a, b) => a - b), 'vertici di cucitura non accoppiati');
  assert.equal(hasSeam(f), true);
  // le altre province (Kamchatka, Sakha, ...) non toccano la cucitura
  assert.deepEqual(provinces.features.filter((x) => x.properties.id !== CHUKOTKA && hasSeam(x)).map((x) => x.properties.id), []);
  assert.ok(featureAreaKm2(f) > 600000 && featureAreaKm2(f) < 800000, String(featureAreaKm2(f)));
});

test('cucitura: nessuna linea disegnata lungo +-180 (ne confine ne costa)', () => {
  const f = provinces.features.find((x) => x.properties.id === CHUKOTKA);
  const X = 180 * COS0;
  const onSeam = (d) => {
    const pts = [...d.matchAll(/([ML])(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ cmd: m[1], x: Number(m[2]) }));
    return pts.some((p, i) => i > 0 && p.cmd === 'L' && Math.abs(Math.abs(p.x) - X) < 1e-3 && Math.abs(Math.abs(pts[i - 1].x) - X) < 1e-3);
  };
  assert.equal(onSeam(featureToStrokePath(f)), false, 'il contorno della Ciukotka segue la cucitura');
  assert.equal(onSeam(nationalBorderPath({ type: 'FeatureCollection', features: [f] })), false, 'i confini nazionali seguono la cucitura');
  // controprova: il contorno completo la segue
  const full = buildMapModel(provinces).items.find((i) => i.id === CHUKOTKA);
  assert.equal(onSeam(full.d), true);
  assert.ok(full.seamD && !full.seamD.includes('NaN'));
  // le coste vere restano: il contorno senza cucitura ha comunque molti vertici
  assert.ok(featureToStrokePath(f).length > 500);
});

test('cucitura: isSeamEdge e vista iniziale indipendente dai limiti dei dati', () => {
  assert.equal(isSeamEdge([180, 65], [180, 66]), true);
  assert.equal(isSeamEdge([-180, 65], [-180, 66]), true);
  assert.equal(isSeamEdge([179.9, 65], [180, 66]), false);
  assert.equal(isSeamEdge([-180, 65], [180, 65]), false);
  const { bounds } = buildMapModel(provinces);
  assert.ok(bounds.w > WORLD_W * 0.99, 'i dati ora coprono il giro intero');
  assert.ok(HOME_BOUNDS.w < WORLD_W / 3 && HOME_BOUNDS.x > bounds.x);
  const pad = HOME_BOUNDS.w * 0.02;
  const vb = { x: HOME_BOUNDS.x - pad, y: HOME_BOUNDS.y - pad, w: HOME_BOUNDS.w + 2 * pad, h: HOME_BOUNDS.h + 2 * pad };
  assert.deepEqual(visibleCopies({ k: 1, x: 0, y: 0 }, vb, bounds), [0]);
  // guardando la Ciukotka (lon 180) si vedono due copie del mondo: la cucitura si chiude da sola
  const view = { k: 1, x: vb.x + vb.w / 2 - project(180, 0)[0], y: 0 };
  assert.deepEqual(visibleCopies(view, vb, bounds).length, 2);
});

test('URSS: citta note nella provincia attesa', () => {
  const cases = [
    ['Mosca', 37.62, 55.75, 'P_USSR_MOSKOVSKAYA'], ['Leningrado', 30.31, 59.94, 'P_USSR_LENINGRAD'], ['Kiev', 30.52, 50.45, 'P_USSR_KIEV'],
    ['Odessa', 30.73, 46.48, 'P_USSR_ODESSA'], ['Stalingrado', 44.5, 48.7, 'P_USSR_VOLGOGRAD'], ['Minsk', 27.56, 53.9, 'P_USSR_MINSK'],
    ['Tashkent', 69.24, 41.3, 'P_USSR_TASHKENT'], ['Tbilisi', 44.8, 41.72, 'P_USSR_KVEMO_KARTLI'], ['Baku', 49.87, 40.4, 'P_USSR_ABSHERON'],
    ['Vladivostok', 131.9, 43.12, 'P_USSR_PRIMORYE'], ['Sverdlovsk', 60.6, 56.84, 'P_USSR_SVERDLOVSK'], ['Alma-Ata', 76.95, 43.25, 'P_USSR_ALMATY'],
    ['Novosibirsk', 82.93, 55.03, 'P_USSR_NOVOSIBIRSK'], ['Murmansk', 33.08, 68.97, 'P_USSR_MURMANSK'], ['Sebastopoli', 33.52, 44.6, 'P_USSR_CRIMEA'],
    ['Ciukotka orientale (-175)', -175, 66, CHUKOTKA], ['Isola di Wrangel', -178.5, 71.2, CHUKOTKA],
  ];
  for (const [nome, lon, lat, id] of cases) assert.deepEqual(at(lon, lat), [id], nome);
});

test('URSS: nessuna sovrapposizione con i vicini (griglia di 0,5 gradi tra 18 e 62 E)', () => {
  const multi = [];
  for (let lon = 18; lon <= 62; lon += 0.5) for (let lat = 36; lat <= 70; lat += 0.5) if (at(lon, lat).length > 1) multi.push(`${lon},${lat}`);
  assert.deepEqual(multi, []);
});

test('URSS: limiti noti dichiarati (Petsamo, Carelia, Tuva, Sakhalin)', () => {
  const byId = (id) => provinces.features.find((f) => f.properties.id === id).properties.knownIssues;
  assert.ok(byId('P_USSR_MURMANSK').includes('petsamo_non_sovietico'));
  assert.ok(byId('P_USSR_KARELIA').includes('carelia_finlandese_inclusa'));
  assert.ok(byId('P_USSR_TUVA').includes('tuva_indipendente'));
  assert.ok(byId('P_USSR_SAKHALIN').includes('sakhalin_sud_karafuto_escluso'));
});
