import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog } from '../src/data/validate.js';
import { buildProvinceIndex, pointInPolygon } from '../src/data/geometry.js';
import { loadCatalog } from '../scripts/validate-data.js';

const provinces = JSON.parse(
  await readFile(new URL('../data/provinces_1936.json', import.meta.url), 'utf8'),
);
const index = buildProvinceIndex(provinces);

// Fixture sintetiche SOLO per i test: non sono dati geografici storici.
const square = (x, y, s = 1) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
const feature = (id, owner, geometry) => ({
  type: 'Feature',
  id,
  properties: {
    id, name: id, owner, source: 'test', license: 'CC0-1.0',
    validFrom: '1930-01-01', validTo: '1940-01-01', borderQuality: 'approximate',
  },
  geometry,
});
const withFixture = (mutate) => {
  const f = feature('P_AAA_ONE', 'AAA', { type: 'Polygon', coordinates: square(0, 0) });
  mutate?.(f);
  return {
    nations: [{ id: 'AAA', name: 'Alfa', capital: 'X' }],
    resources: [], rivers: [], crossings: [],
    political: [{ id: 'AAA', name: 'Alfa', type: 'country', owner: 'AAA', controller: 'AAA', status: 'independent', playable: true }],
    provinces: { type: 'FeatureCollection', features: [f] },
  };
};

test('un catalogo con province coerenti è valido', () => {
  assert.equal(validateCatalog(withFixture()).ok, true);
});

test('rileva owner inesistente, anello aperto, data non valida e qualità sconosciuta', () => {
  const cases = [
    [(f) => { f.properties.owner = 'ZZZ'; }, /owner inesistente/],
    [(f) => { f.geometry.coordinates[0].pop(); }, /non chiuso|meno di 4/],
    [(f) => { f.properties.validTo = '1935-01-01'; }, /non è valida alla data/],
    [(f) => { f.properties.borderQuality = 'boh'; }, /borderQuality non valido/],
    [(f) => { f.geometry.coordinates[0][1] = [999, 0]; }, /fuori intervallo/],
    [(f) => { f.geometry = { type: 'Point', coordinates: [0, 0] }; }, /geometria non valida/],
  ];
  for (const [mutate, pattern] of cases) {
    const r = validateCatalog(withFixture(mutate));
    assert.equal(r.ok, false);
    assert.match(r.errors.join('\n'), pattern);
  }
});

test('rileva id di provincia duplicati', () => {
  const c = withFixture();
  c.provinces.features.push(structuredClone(c.provinces.features[0]));
  assert.match(validateCatalog(c).errors.join('\n'), /id duplicato/);
});

test('pointInPolygon rispetta i buchi', () => {
  const holed = [...square(0, 0, 10), ...square(4, 4, 2)];
  assert.equal(pointInPolygon(holed, 1, 1), true);
  assert.equal(pointInPolygon(holed, 5, 5), false);
  assert.equal(pointInPolygon(holed, 11, 1), false);
});

test('i dati reali delle province sono validi e dichiarano la qualità', async () => {
  const result = validateCatalog(await loadCatalog());
  assert.deepEqual(result.errors, []);
  assert.ok(provinces.features.length >= 60);
  assert.ok(provinces.features.every((f) => f.properties.borderQuality === 'approximate'));
  assert.ok(provinces.features.every((f) => f.properties.license && f.properties.ohmRelation));
});

test('città note cadono nella provincia attesa', () => {
  const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);
  const cases = [
    ['Eupen (cantoni dell\'Est, Belgio dal 1920)', 6.03, 50.63, 'P_BEL_LIEGE'],
    ['Bruxelles', 4.35, 50.85, 'P_BEL_BRABANT'],
    ['Arlon', 5.81, 49.68, 'P_BEL_LUXEMBOURG'],
    ['Lussemburgo città', 6.13, 49.61, 'P_LUX_LUXEMBOURG'],
    ['Vienna', 16.37, 48.21, 'P_AUT_LOWER_AUSTRIA'],
    ['Innsbruck', 11.39, 47.27, 'P_AUT_TIROL'],
    ['Varsavia', 21.01, 52.23, 'P_POL_WARSAW_VOIVODESHIP'],
    ['Cracovia', 19.94, 50.06, 'P_POL_KRAKOW_VOIVODESHIP'],
    ['Monaco di Baviera', 11.58, 48.14, 'P_DEU_BAVARIA'],
  ];
  for (const [name, lon, lat, expected] of cases) {
    assert.deepEqual(at(lon, lat), [expected], name);
  }
  // Maastricht è nei Paesi Bassi, non coperti da questo dataset.
  assert.deepEqual(at(5.69, 50.85), []);
});

// Sovrapposizioni note, misurate sui dati OHM originali (sono difetti della fonte, non regole).
// Un'altra coppia, o un aumento oltre la soglia, fa fallire il test.
const KNOWN_OVERLAPS = new Set([
  'P_BEL_LIEGE|P_DEU_RHINE_PROVINCE',
  'P_BEL_LUXEMBOURG|P_LUX_DIEKIRCH',
  'P_DEU_HANOVER|P_DEU_PROVINCE_OF_SCHLESWIG_HOLSTEIN',
  'P_DEU_PROVINCE_OF_LOWER_SILESIA|P_DEU_PROVINCE_OF_SAXONY',
  'P_DEU_PROVINCE_OF_BRANDENBURG|P_DEU_PROVINCE_OF_SAXONY',
]);
const MAX_OVERLAP_FRACTION = 0.0002; // 0,02% dei punti campionati coperti

test('le province non si sovrappongono oltre le tolleranze note', () => {
  const step = 0.03;
  let covered = 0;
  let overlapping = 0;
  const unexpected = new Set();
  for (let lat = 46; lat < 56; lat += step) {
    for (let lon = 2; lon < 27; lon += step) {
      const hits = index.provincesAt(lon, lat);
      if (hits.length > 0) covered += 1;
      if (hits.length > 1) {
        overlapping += 1;
        const key = hits.map((f) => f.properties.id).sort().join('|');
        if (!KNOWN_OVERLAPS.has(key)) unexpected.add(key);
      }
    }
  }
  assert.ok(covered > 100000, 'campionamento troppo scarso');
  assert.deepEqual([...unexpected], []);
  assert.ok(overlapping / covered <= MAX_OVERLAP_FRACTION, `sovrapposizioni: ${overlapping}/${covered}`);
});
