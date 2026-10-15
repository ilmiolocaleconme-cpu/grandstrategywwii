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
  // Nessun confine è verificato; le province non OHM (Paesi Bassi, Natural Earth) sono solo ipotesi.
  assert.ok(provinces.features.every((f) => f.properties.borderQuality !== 'verified'));
  const ohm = provinces.features.filter((f) => f.properties.source === 'OpenHistoricalMap');
  assert.ok(ohm.length >= 60);
  assert.ok(ohm.every((f) => f.properties.borderQuality === 'approximate' && f.properties.ohmRelation));
  const nl = provinces.features.filter((f) => f.properties.owner === 'NLD');
  assert.equal(nl.length, 11);
  assert.ok(nl.every((f) => f.properties.borderQuality === 'hypothesis' && f.properties.license));
  assert.equal(nl.some((f) => f.properties.name === 'Flevoland'), false);
  assert.ok(provinces.features.every((f) => f.properties.license));
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
  assert.deepEqual(at(5.69, 50.85), ['P_NLD_LIMBURG'], 'Maastricht');
  assert.deepEqual(at(4.9, 52.37), ['P_NLD_NOORD_HOLLAND'], 'Amsterdam');
  assert.deepEqual(at(4.48, 51.92), ['P_NLD_ZUID_HOLLAND'], 'Rotterdam');
  assert.deepEqual(at(6.57, 53.22), ['P_NLD_GRONINGEN'], 'Groninga');
  assert.deepEqual(at(5.47, 52.5), [], 'Lelystad era Zuiderzee nel 1936');
});

// Sovrapposizioni note, misurate sui dati OHM originali (sono difetti della fonte, non regole).
// Un'altra coppia, o un aumento oltre la soglia, fa fallire il test.
const KNOWN_OVERLAPS = new Set([
  'P_BEL_LIEGE|P_DEU_RHINE_PROVINCE',
  'P_CZE_SLOVAKIA|P_POL_KRAKOW_VOIVODESHIP',
  'P_BEL_LUXEMBOURG|P_LUX_DIEKIRCH',
  'P_DEU_HANOVER|P_DEU_PROVINCE_OF_SCHLESWIG_HOLSTEIN',
  'P_DEU_PROVINCE_OF_LOWER_SILESIA|P_DEU_PROVINCE_OF_SAXONY',
  'P_DEU_PROVINCE_OF_BRANDENBURG|P_DEU_PROVINCE_OF_SAXONY',
]);
const MAX_OVERLAP_FRACTION = 0.0002; // 0,02% dei punti campionati coperti
// Province olandesi (Natural Earth, solo terraferma) contro vicine OHM (poligoni con mare): fonti
// diverse, quindi sovrapposizioni lungo il confine con Belgio e Germania. Ammesse solo con BEL/DEU.
const MAX_NL_OVERLAP_FRACTION = 0.0001;
const isNlBorderPair = (key) => {
  const owners = key.split('|').map((id) => id.split('_')[1]);
  return owners.includes('NLD') && owners.every((o) => ['NLD', 'BEL', 'DEU'].includes(o)) &&
    owners.filter((o) => o === 'NLD').length === 1;
};

test('le province non si sovrappongono oltre le tolleranze note', () => {
  const step = 0.03;
  let covered = 0;
  let overlapping = 0;
  let nlOverlapping = 0;
  const unexpected = new Set();
  for (let lat = 46; lat < 56; lat += step) {
    for (let lon = 2; lon < 27; lon += step) {
      const hits = index.provincesAt(lon, lat);
      if (hits.length > 0) covered += 1;
      if (hits.length > 1) {
        const key = hits.map((f) => f.properties.id).sort().join('|');
        if (isNlBorderPair(key)) nlOverlapping += 1;
        else {
          overlapping += 1;
          if (!KNOWN_OVERLAPS.has(key)) unexpected.add(key);
        }
      }
    }
  }
  assert.ok(covered > 100000, 'campionamento troppo scarso');
  assert.deepEqual([...unexpected], []);
  assert.ok(overlapping / covered <= MAX_OVERLAP_FRACTION, `sovrapposizioni: ${overlapping}/${covered}`);
  assert.ok(nlOverlapping / covered <= MAX_NL_OVERLAP_FRACTION, `sovrapposizioni NL: ${nlOverlapping}/${covered}`);
});

test('Italia: città note nella regione attesa e regioni mancanti coperte come ipotesi', () => {
  const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);
  const cases = [
    ['Roma', 12.5, 41.9, 'P_ITA_LAZIO'],
    ['Milano', 9.19, 45.46, 'P_ITA_LOMBARDY'],
    ['Bologna', 11.34, 44.49, 'P_ITA_EMILIA'],
    ['Trieste (Venezia Giulia)', 13.77, 45.65, 'P_ITA_JULIAN_MARCH'],
    ['Fiume', 14.44, 45.33, 'P_ITA_JULIAN_MARCH'],
    ['Bolzano (Venezia Tridentina)', 11.35, 46.5, 'P_ITA_TRIDENTINE_VENETIA'],
    ['Napoli', 14.27, 40.85, 'P_ITA_CAMPANIA'],
    ['Palermo', 13.36, 38.12, 'P_ITA_SICILY'],
    ['Cosenza', 16.25, 39.3, 'P_ITA_CALABRIA'],
    ['Ancona', 13.5, 43.6, 'P_ITA_MARCHE'],
    ['Ascoli Piceno (Marche fino al Tronto)', 13.58, 42.85, 'P_ITA_MARCHE'],
    ['Teramo', 13.7, 42.66, 'P_ITA_ABRUZZI_E_MOLISE'],
    ['Perugia', 12.39, 43.11, 'P_ITA_UMBRIA'],
    ['Pescara', 14.21, 42.46, 'P_ITA_ABRUZZI_E_MOLISE'],
    ['Amatrice (Rieti, Lazio)', 13.29, 42.63, 'P_ITA_LAZIO'],
    ['Zara (enclave italiana)', 15.23, 44.12, 'P_ITA_ZARA'],
    ['Belgrado', 20.46, 44.82, 'P_YUG_YUGOSLAVIA'],
    ['Lubiana', 14.51, 46.06, 'P_YUG_YUGOSLAVIA'],
    ['Zagabria', 15.98, 45.81, 'P_YUG_YUGOSLAVIA'],
    ['Sarajevo', 18.41, 43.86, 'P_YUG_YUGOSLAVIA'],
    ['Skopje', 21.43, 42.0, 'P_YUG_YUGOSLAVIA'],
    ['Spalato', 16.44, 43.51, 'P_YUG_YUGOSLAVIA'],
    ['Fiume (italiana)', 14.44, 45.33, 'P_ITA_JULIAN_MARCH'],
    ['Klagenfurt', 14.31, 46.62, 'P_AUT_CARINTHIA'],
  ];
  for (const [name, lon, lat, expected] of cases) assert.deepEqual(at(lon, lat), [expected], name);
  const byId = new Map(provinces.features.map((f) => [f.properties.id, f.properties]));
  for (const id of ['P_ITA_SICILY', 'P_ITA_CALABRIA']) {
    assert.equal(byId.get(id).borderQuality, 'hypothesis');
    assert.equal(byId.get(id).source.startsWith('Natural Earth'), true);
  }
  assert.equal(provinces.features.filter((f) => f.properties.owner === 'ITA').length, 19);
});

test('Cecoslovacchia: le quattro terre, con la Slovacchia derivata', () => {
  const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);
  const cases = [
    ['Praga', 14.42, 50.08, 'P_CZE_BOHEMIA'],
    ['Brno', 16.6, 49.2, 'P_CZE_MORAVIAN_SILESIAN_COUNTRY'],
    ['Uzhhorod (Rutenia)', 22.3, 48.62, 'P_CZE_SUBCARPATHIAN_RUS'],
    ['Bratislava', 17.11, 48.15, 'P_CZE_SLOVAKIA'],
    ['Kosice', 21.26, 48.72, 'P_CZE_SLOVAKIA'],
    ['Zilina', 18.74, 49.22, 'P_CZE_SLOVAKIA'],
  ];
  for (const [name, lon, lat, expected] of cases) assert.deepEqual(at(lon, lat), [expected], name);
  const slovakia = provinces.features.find((f) => f.properties.id === 'P_CZE_SLOVAKIA').properties;
  assert.equal(slovakia.borderQuality, 'hypothesis');
  assert.equal(slovakia.dateBasis, 'derived');
  assert.equal(slovakia.validTo, '1936-07-03');
});

// Allineamento lungo i confini tra fonti diverse: campionamento fine su finestre di confine.
// Sovrapposizioni tra id diversi e fessure (punto scoperto con owner diversi entro 0,04°) in km².
const ALIGNMENT_BOXES = [
  { name: 'Italia-Austria', box: [10.3, 46.2, 13.9, 47.2], maxOverlap: 1, maxGap: 30 },
  { name: 'Paesi Bassi-Belgio', box: [2.5, 50.7, 6.5, 51.8], maxOverlap: 3, maxGap: 40 },
  { name: 'Paesi Bassi-Germania', box: [5.8, 50.8, 7.4, 53.6], maxOverlap: 3, maxGap: 40 },
  { name: 'Campania-Abruzzi e Molise', box: [13.8, 40.9, 15.6, 42.0], maxOverlap: 3, maxGap: 5 },
  { name: 'Calabria-Lucania', box: [15.5, 39.4, 17.0, 40.4], maxOverlap: 1, maxGap: 5 },
  { name: 'Marche-Umbria-Abruzzi-Lazio', box: [12.4, 42.4, 14.2, 43.3], maxOverlap: 2, maxGap: 3 },
  { name: 'Cecoslovacchia-Germania', box: [11.9, 48.8, 15.2, 51.1], maxOverlap: 2, maxGap: 5 },
  { name: 'Cecoslovacchia-Austria', box: [13.5, 48.5, 17.2, 49.1], maxOverlap: 3, maxGap: 5 },
  { name: 'Cecoslovacchia-Polonia', box: [14.8, 49.2, 19.8, 50.9], maxOverlap: 3, maxGap: 5 },
  { name: 'Slovacchia-Polonia', box: [18.5, 49.0, 22.8, 49.7], maxOverlap: 3, maxGap: 10 },
  { name: 'Slovacchia-Austria', box: [16.5, 47.9, 17.3, 48.9], maxOverlap: 3, maxGap: 25 },
  { name: 'Slovacchia-Moravia-Rutenia', box: [16.9, 48.2, 22.8, 49.6], maxOverlap: 6, maxGap: 8 },
  { name: 'Italia-Iugoslavia (Venezia Giulia, Zara; include tratti di mare)', box: [13.2, 44.0, 16.0, 46.0], maxOverlap: 3, maxGap: 120 },
  { name: 'Austria-Iugoslavia', box: [13.8, 46.3, 16.2, 46.9], maxOverlap: 4, maxGap: 40 },
  { name: 'Emilia-Marche', box: [11.9, 43.6, 12.8, 44.4], maxOverlap: 1, maxGap: 5 },
];

test('i confini tra fonti diverse sono allineati entro le tolleranze', () => {
  const step = 0.01;
  const d = 0.04;
  for (const { name, box: [x0, y0, x1, y1], maxOverlap, maxGap } of ALIGNMENT_BOXES) {
    const km2 = step * 111.32 * Math.cos((y0 * Math.PI) / 180) * step * 110.57;
    let overlap = 0;
    let gap = 0;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const hits = index.provincesAt(x, y);
        if (hits.length > 1) overlap += 1;
        else if (hits.length === 0) {
          const owners = new Set();
          for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
            for (const f of index.provincesAt(x + dx, y + dy)) owners.add(f.properties.owner);
          }
          if (owners.size > 1) gap += 1;
        }
      }
    }
    assert.ok(overlap * km2 <= maxOverlap, `${name}: sovrapposizioni ${Math.round(overlap * km2)} km²`);
    assert.ok(gap * km2 <= maxGap, `${name}: fessure ${Math.round(gap * km2)} km²`);
  }
});
