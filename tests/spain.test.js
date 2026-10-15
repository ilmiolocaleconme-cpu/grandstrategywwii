import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProvinces } from '../scripts/load-provinces.js';
import { pointInPolygon } from '../src/data/geometry.js';
import { featureAreaKm2, polygonsOf } from '../src/map/geo.js';

// Penisola iberica e Marocco: ESP, PRT e MAR da Natural Earth (confini attuali), MAR_ES tracciato da immagine.
// Le soglie sono larghe di proposito: servono a intercettare rotture, non a certificare precisione.

const provinces = await loadProvinces();
const byOwner = (o) => provinces.features.filter((f) => f.properties.owner === o);
const esp = byOwner('ESP');
const mar = byOwner('MAR_ES');
const fra = byOwner('FRA');
const prt = byOwner('PRT');

// capoluoghi (lon, lat) usati per guidare il tracciato dall'immagine
const CAPITALS = [
  ['P_ESP_ALAVA', -2.6716, 42.8467],
  ['P_ESP_ALBACETE', -1.8585, 38.9943],
  ['P_ESP_ALICANTE', -0.481, 38.3452],
  ['P_ESP_ALMERIA', -2.4637, 36.834],
  ['P_ESP_ASTURIAS', -5.8494, 43.3614],
  ['P_ESP_AVILA', -4.7001, 40.6564],
  ['P_ESP_BADAJOZ', -6.9707, 38.8794],
  ['P_ESP_BARCELONA', 2.1734, 41.3851],
  ['P_ESP_BURGOS', -3.6969, 42.3439],
  ['P_ESP_CACERES', -6.3722, 39.4765],
  ['P_ESP_CADIZ', -6.2886, 36.5271],
  ['P_ESP_SANTANDER', -3.8099, 43.4623],
  ['P_ESP_CASTELLON', -0.0513, 39.9864],
  ['P_ESP_CIUDAD_REAL', -3.9291, 38.9863],
  ['P_ESP_CORDOBA', -4.7794, 37.8882],
  ['P_ESP_CORUNA', -8.4115, 43.3623],
  ['P_ESP_CUENCA', -2.1374, 40.0704],
  ['P_ESP_GERONA', 2.8214, 41.9794],
  ['P_ESP_GRANADA', -3.5986, 37.1773],
  ['P_ESP_GUADALAJARA', -3.167, 40.6292],
  ['P_ESP_GUIPUZCOA', -1.9812, 43.3183],
  ['P_ESP_HUELVA', -6.9447, 37.2614],
  ['P_ESP_HUESCA', -0.4089, 42.1401],
  ['P_ESP_JAEN', -3.7849, 37.7796],
  ['P_ESP_LEON', -5.5671, 42.5987],
  ['P_ESP_LERIDA', 0.62, 41.6176],
  ['P_ESP_LOGRONO', -2.4449, 42.4627],
  ['P_ESP_LUGO', -7.5558, 43.0121],
  ['P_ESP_MADRID', -3.7038, 40.4168],
  ['P_ESP_MALAGA', -4.4214, 36.7213],
  ['P_ESP_MURCIA', -1.1307, 37.9922],
  ['P_ESP_NAVARRA', -1.6458, 42.8125],
  ['P_ESP_ORENSE', -7.8639, 42.3358],
  ['P_ESP_PALENCIA', -4.5288, 42.0097],
  ['P_ESP_PONTEVEDRA', -8.6446, 42.431],
  ['P_ESP_SALAMANCA', -5.6635, 40.9701],
  ['P_ESP_SEGOVIA', -4.1088, 40.9429],
  ['P_ESP_SEVILLA', -5.9845, 37.3891],
  ['P_ESP_SORIA', -2.4649, 41.7636],
  ['P_ESP_TARRAGONA', 1.2445, 41.1189],
  ['P_ESP_TERUEL', -1.1065, 40.3456],
  ['P_ESP_TOLEDO', -4.0273, 39.8628],
  ['P_ESP_VALENCIA', -0.3763, 39.4699],
  ['P_ESP_VALLADOLID', -4.7245, 41.6523],
  ['P_ESP_VIZCAYA', -2.935, 43.263],
  ['P_ESP_ZAMORA', -5.744, 41.5035],
  ['P_ESP_ZARAGOZA', -0.8891, 41.6488],
  ['P_ESP_BALEARES', 2.6502, 39.5696],];

const KM_LAT = 111.2;
const distKm = (ring, lon, lat) => {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = [(ring[i][0] - lon) * kx, (ring[i][1] - lat) * KM_LAT];
    const [x2, y2] = [(ring[i + 1][0] - lon) * kx, (ring[i + 1][1] - lat) * KM_LAT];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return best;
};

test('ESP 48, PRT 18, MAR 12, MAR_ES 1; Canarie, Azzorre e Madeira escluse e dichiarate', () => {
  assert.equal(esp.length, 48);
  assert.equal(mar.length, 1);
  assert.equal(prt.length, 18);
  assert.equal(byOwner('MAR').length, 12);
  assert.equal(new Set(esp.map((f) => f.properties.id)).size, 48);
  assert.equal(esp.some((f) => /CANARIAS|PALMAS|TENERIFE/i.test(f.properties.id)), false);
  assert.ok(esp.every((f) => f.properties.borderQuality === 'hypothesis' && f.properties.knownIssues.includes('modern_borders')));
  const meta = JSON.parse(JSON.stringify(provinces.metadata));
  assert.match(meta.coverage.join('|'), /ESP \(47 province continentali/);
});

test('ESP: ogni capoluogo e nella propria provincia o a meno di 8 km dal suo contorno (citta costiere)', () => {
  const polys = (f) => polygonsOf(f);
  for (const [id, lon, lat] of CAPITALS) {
    const f = esp.find((x) => x.properties.id === id);
    assert.ok(f, id);
    const inside = polys(f).some((p) => pointInPolygon(p, lon, lat));
    const d = Math.min(...polys(f).map((p) => distKm(p[0], lon, lat)));
    assert.ok(inside || d < 8, `${id}: fuori di ${d.toFixed(1)} km`);
  }
});

test('ESP: aree plausibili (province entro +-10% dal riferimento ufficiale, totale continentale 480-510 mila km2)', () => {
  const REF = { ALAVA: 3037, GERONA: 5910, PALENCIA: 8052, VALLADOLID: 8110, VIZCAYA: 2217, ZARAGOZA: 17274, BALEARES: 4992 };
  for (const [k, ref] of Object.entries(REF)) {
    const a = featureAreaKm2(esp.find((f) => f.properties.id === `P_ESP_${k}`));
    assert.ok(a > ref * 0.9 && a < ref * 1.1, `${k}: ${Math.round(a)} contro ${ref}`);
  }
  const mainland = esp.filter((f) => f.properties.id !== 'P_ESP_BALEARES').reduce((s, f) => s + featureAreaKm2(f), 0);
  assert.ok(mainland > 480000 && mainland < 510000, String(Math.round(mainland)));
  const marA = featureAreaKm2(mar[0]);
  assert.ok(marA > 20000 && marA < 30000, String(Math.round(marA)));
});

test('ESP: i confini interni sono condivisi (nessuna fessura): gli archi non condivisi formano anelli chiusi (terraferma, Ceuta, Melilla, isole Baleari)', () => {
  const key = ([x, y]) => `${x},${y}`;
  const edges = new Map();
  for (const f of esp) for (const p of polygonsOf(f)) for (const ring of p) {
    for (let i = 0; i + 1 < ring.length; i += 1) {
      const a = key(ring[i]);
      const b = key(ring[i + 1]);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((n) => n <= 2), 'un arco in piu di due province');
  const outline = [...edges].filter(([, n]) => n === 1).map(([k]) => k.split('|'));
  const adj = new Map();
  for (const [a, b] of outline) {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  assert.ok([...adj.values()].every((v) => v.length === 2), 'il contorno ha punti con grado diverso da 2 (fessure o sovrapposizioni)');
  const seen = new Set();
  let rings = 0;
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    rings += 1;
    const stack = [start];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...adj.get(n));
    }
  }
  assert.equal(rings, 10, `anelli di contorno: ${rings}`); // terraferma, Ceuta, Melilla e 7 isole delle Baleari
});

test('ESP-FRA: il confine pirenaico usa gli stessi vertici di FRA e nessun vertice spagnolo cade dentro la Francia', () => {
  const key = ([x, y]) => `${x},${y}`;
  const fraVerts = new Set();
  for (const f of fra) for (const p of polygonsOf(f)) for (const ring of p) for (const c of ring) fraVerts.add(key(c));
  let shared = 0;
  for (const id of ['NAVARRA', 'HUESCA', 'LERIDA', 'GERONA', 'GUIPUZCOA']) {
    const f = esp.find((x) => x.properties.id === `P_ESP_${id}`);
    for (const p of polygonsOf(f)) for (const c of p[0]) if (fraVerts.has(key(c))) shared += 1;
  }
  assert.ok(shared >= 100, `vertici condivisi con FRA: ${shared}`);
  const inFrance = [];
  for (const f of esp) {
    for (const p of polygonsOf(f)) {
      for (const c of p[0]) {
        if (c[1] < 42.2 || fraVerts.has(key(c))) continue;
        // Llivia: exclave spagnola (Gerona, ~13 km2) dentro il dipartimento francese dei Pirenei Orientali, che in FRA la copre
        if (c[0] > 1.93 && c[0] < 2.02 && c[1] > 42.43 && c[1] < 42.5) continue;
        // punti sul tracciato di FRA (nodi proiettati sul confine, arrotondati a 4 decimali) sono sul bordo, non dentro
        if (fra.some((g) => polygonsOf(g).some((q) => distKm(q[0], c[0], c[1]) < 0.02))) continue;
        if (fra.some((g) => polygonsOf(g).some((q) => pointInPolygon(q, c[0], c[1])))) inFrance.push(`${f.properties.id}@${c}`);
      }
    }
  }
  assert.deepEqual(inFrance, []);
});

test('MAR_ES: zona nord del protettorato, tra lo Stretto e il Mulouya (da immagine, ritagliata sulla terraferma NE)', () => {
  const [p] = polygonsOf(mar[0]);
  const lons = p[0].map((c) => c[0]);
  const lats = p[0].map((c) => c[1]);
  assert.ok(Math.min(...lons) > -6.6 && Math.max(...lons) < -2.0);
  assert.ok(Math.min(...lats) > 34.0 && Math.max(...lats) < 36.1);
  assert.equal(pointInPolygon(p, -5.37, 35.57), true, 'Tetuan nel protettorato spagnolo');
  assert.equal(pointInPolygon(p, -5.9, 35.77), false, 'Tangeri (zona internazionale) esclusa');
});

test('PRT: 18 distretti continentali, aree plausibili e confine spagnolo con gli stessi vertici di ESP', () => {
  const REF = { BEJA: 10225, FARO: 4960, LISBOA: 2761, PORTO: 2395, EVORA: 7393 };
  for (const [k, ref] of Object.entries(REF)) {
    const a = featureAreaKm2(prt.find((f) => f.properties.id === `P_PRT_${k}`));
    assert.ok(a > ref * 0.9 && a < ref * 1.1, `${k}: ${Math.round(a)} contro ${ref}`);
  }
  const key = ([x, y]) => `${x},${y}`;
  const espVerts = new Set();
  for (const f of esp) for (const p of polygonsOf(f)) for (const ring of p) for (const c of ring) espVerts.add(key(c));
  let shared = 0;
  for (const f of prt) for (const p of polygonsOf(f)) for (const c of p[0]) if (espVerts.has(key(c))) shared += 1;
  assert.ok(shared >= 300, `vertici condivisi con ESP: ${shared}`);
  const inSpain = [];
  for (const f of prt) for (const p of polygonsOf(f)) for (const c of p[0]) {
    if (espVerts.has(key(c))) continue;
    if (esp.some((g) => polygonsOf(g).some((q) => pointInPolygon(q, c[0], c[1]) && distKm(q[0], c[0], c[1]) > 0.3))) inSpain.push(`${f.properties.id}@${c}`);
  }
  assert.deepEqual(inSpain, []);
  // Lisbona e Porto nei propri distretti
  const at = (lon, lat) => prt.filter((f) => polygonsOf(f).some((p) => pointInPolygon(p, lon, lat))).map((f) => f.properties.id);
  assert.deepEqual(at(-9.14, 38.75), ['P_PRT_LISBOA']);
  assert.deepEqual(at(-8.61, 41.15), ['P_PRT_PORTO']);
});

test('MAR: 12 regioni attuali ritagliate sulla zona spagnola, nessuna sovrapposizione con MAR_ES', () => {
  const regions = byOwner('MAR');
  const at = (list, lon, lat) => list.filter((f) => polygonsOf(f).some((p) => pointInPolygon(p, lon, lat)));
  assert.equal(at(mar, -5.37, 35.57).length, 1, 'Tetuan e nella zona spagnola');
  assert.equal(at(regions, -5.37, 35.57).length, 0);
  assert.deepEqual(at(regions, -7.59, 33.57).map((f) => f.properties.id), ['P_MAR_GRAND_CASABLANCA']);
  assert.deepEqual(at(regions, -6.84, 34.02).map((f) => f.properties.id), ['P_MAR_RABAT___SALE___ZEMMOUR___ZAER']);
  let overlaps = 0;
  for (let lat = 33.5; lat < 36; lat += 0.02) for (let lon = -6.5; lon < -1.5; lon += 0.02) {
    if (at(regions, lon, lat).length > 0 && at(mar, lon, lat).length > 0) overlaps += 1;
  }
  assert.equal(overlaps, 0);
  assert.equal(regions.some((f) => /SEMARA|LAAYOUNE|DAHAB/.test(f.properties.id)), false);
});
