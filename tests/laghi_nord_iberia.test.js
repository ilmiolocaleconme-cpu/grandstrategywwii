import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from '../src/data/validate.js';

// Laghi di Gran Bretagna, Irlanda, Spagna, Portogallo, Nord Africa, Baltici, Danimarca, Norvegia, Svezia, Finlandia (Natural Earth 10m v5.1.1).
// Soglie larghe: il poligono Natural Earth non e il lago reale (isole, costa generalizzata, laghi artificiali moderni).

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const lakes = read('lakes.json');
const byId = new Map(lakes.features.map((f) => [f.properties.id, f]));
const added = lakes.features.filter((f) => /v5\.1\.1/.test(f.properties.source));

const inRing = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
// anelli concentrici (isole): vale la regola pari-dispari, come nel disegno della mappa (fillRule evenodd)
const inLake = (f, x, y) => f.geometry.coordinates.some((poly) => poly.reduce((n, r) => n + (inRing(x, y, r) ? 1 : 0), 0) % 2 === 1);

test('catalogo valido: 895 laghi, 342 aggiunti, id e wikidata senza duplicati', () => {
  const v = validateCatalog({
    nations: read('nations.json'), resources: read('resources.json'), rivers: read('rivers.json'), crossings: read('crossings.json'),
    political: read('political_1936.json'), riversGeo: read('rivers_geo.json'), lakes,
  });
  assert.equal(v.ok, true, v.errors.join('|'));
  assert.equal(lakes.features.length, 895); // 896 meno 1: Nord e Sud Aral moderni sostituiti dall'Aral storico (L_ARAL_SEA)
  assert.equal(added.length, 342);
  assert.equal(byId.size, 895);
  // i laghi in piu parti (Como, Femund) hanno piu poligoni con lo stesso wikidata; un lago nuovo non deve ripetere uno gia presente
  const old = new Set(lakes.features.filter((f) => !/v5\.1\.1/.test(f.properties.source)).map((f) => f.properties.wikidata).filter(Boolean));
  for (const f of added) assert.equal(old.has(f.properties.wikidata), false, `${f.properties.id} gia presente`);
});

test('laghi aggiunti: fonte, licenza, stima dichiarata, soglia di area', () => {
  for (const f of added) {
    const p = f.properties;
    assert.equal(p.license, 'Public Domain (Natural Earth)', p.id);
    assert.equal(p.approximate, true, p.id);
    assert.ok(p.areaKm2 >= 25 || (p.name && p.areaKm2 >= 8), `${p.id} ${p.areaKm2} km2`);
    assert.equal(f.geometry.type, 'MultiPolygon', p.id);
  }
});

test('laghi principali presenti con area plausibile', () => {
  const area = (id, lo, hi) => {
    const a = byId.get(id)?.properties.areaKm2;
    assert.ok(a > lo && a < hi, `${id}: ${a} km2`);
  };
  area('L_VANERN', 5000, 6500); area('L_VATTERN', 1700, 2200); area('L_MALAREN', 1500, 2100);
  area('L_NEAGH', 350, 420); area('L_CORRIB', 150, 220); area('L_VORTSJARV', 230, 320);
  area('L_NASSER', 3000, 5500); area('L_INARI', 1300, 1900); area('L_MJSA', 330, 450);
  area('L_OULUJARVI', 900, 1400); area('L_SILJAN', 250, 400);
  assert.ok(byId.get('L_SAIMAA').properties.areaKm2 > 3000);
});

test('punti interni ai laghi (regola pari-dispari con le isole)', () => {
  const inside = [
    ['L_VANERN', 13.26, 58.9], ['L_VATTERN', 14.6, 58.3], ['L_MALAREN', 17.0, 59.5], ['L_NEAGH', -6.4, 54.6],
    ['L_CORRIB', -9.3, 53.45], ['L_VORTSJARV', 26.05, 58.28], ['L_INARI', 27.9, 69.0], ['L_MJSA', 10.86, 60.76],
    ['L_SILJAN', 14.75, 60.85], ['L_OULUJARVI', 27.5, 64.33],
  ];
  for (const [id, lon, lat] of inside) assert.equal(inLake(byId.get(id), lon, lat), true, `${id} ${lon},${lat}`);
  // terraferma: Stoccolma e Helsinki non sono nei laghi
  for (const f of added) {
    assert.equal(inLake(f, 18.07, 59.33) && f.properties.id !== 'L_MALAREN', false, f.properties.id);
    assert.equal(inLake(f, 24.94, 60.17), false, f.properties.id);
  }
});
