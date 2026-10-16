import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from '../src/data/validate.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { buildRiverModel, distanceToRiverKm, downstreamChain } from '../src/data/rivers.js';
import { loadProvinces } from '../scripts/load-provinces.js';

// Fiumi di Gran Bretagna, Irlanda, Spagna, Portogallo, Nord Africa, Scandinavia e Finlandia (Natural Earth 10m v5.1.1).
// Danimarca, Algeria, Tunisia e Libia non hanno fiumi in Natural Earth: il test lo registra, non lo nasconde.

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const provinces = await loadProvinces();
const catalog = {
  nations: read('nations.json'), resources: read('resources.json'), rivers: read('rivers.json'),
  crossings: read('crossings.json'), political: read('political_1936.json'), provinces,
  riversGeo: read('rivers_geo.json'), lakes: read('lakes.json'),
};
const model = buildRiverModel(catalog.rivers, catalog.riversGeo);
const byId = new Map(catalog.rivers.map((r) => [r.id, r]));
const index = buildProvinceIndex(provinces);

test('catalogo valido, 540 fiumi e 1532 tratti, ogni fiume ha almeno un tratto', () => {
  const v = validateCatalog(catalog);
  assert.equal(v.ok, true, v.errors.join('|'));
  assert.equal(catalog.rivers.length, 540);
  assert.equal(catalog.riversGeo.features.length, 1532);
  assert.equal(new Set(catalog.rivers.map((r) => r.id)).size, 540);
});

test('fiumi aggiunti: fonte, licenza, stime dichiarate, nessun canale e nessun fiume francese', () => {
  const added = catalog.rivers.filter((r) => /v5\.1\.1/.test(r.source));
  assert.equal(added.length, 114);
  for (const r of added) {
    assert.equal(r.license, 'Public Domain (Natural Earth)', r.id);
    assert.equal(r.approximate, true, r.id);
    assert.equal(r.widthBasis, 'proxy_from_natural_earth_scalerank', r.id);
    assert.ok(r.knownIssues.includes('modern_course_not_1936'), r.id);
    assert.ok(r.lengthKm >= 25, r.id);
  }
  for (const id of ['R_SUEZ_CANAL', 'R_CALEDONIAN_CANAL', 'R_ISMAILIYA_CANAL', 'R_GARONNE']) assert.equal(byId.has(id), false, id);
});

test('copertura per territorio: fiumi presenti e fiumi assenti dalla fonte', () => {
  for (const id of ['R_THAMES', 'R_SEVERN', 'R_TRENT', 'R_TAY', 'R_TWEED', 'R_SHANNON', 'R_EBRO', 'R_TAGUS', 'R_DOURO', 'R_GUADIANA', 'R_GUADALQUIVIR', 'R_MINHO',
    'R_NILE', 'R_ROSETTA_BRANCH', 'R_DAMIETTA_BRANCH', 'R_MOULOUYA', 'R_SEBOU', 'R_GLOMMA', 'R_GOTA_ALV', 'R_DALALVEN', 'R_KEMIJOKI', 'R_TORNE_ALV', 'R_KYMIJOKI']) {
    assert.ok(byId.has(id), id);
  }
  // Natural Earth 10m non contiene fiumi per Danimarca, Algeria, Tunisia e Libia: nessun vertice dei tratti nuovi cade nelle loro province
  const empty = new Set(['DNK', 'ALG', 'TUN', 'LBA']);
  for (const f of catalog.riversGeo.features) {
    if (!/v5\.1\.1/.test(byId.get(f.properties.riverId).source)) continue;
    for (const [lon, lat] of f.geometry.coordinates) {
      assert.equal(index.provincesAt(lon, lat).some((p) => empty.has(p.properties.owner)), false, `${f.properties.riverId} ${lon},${lat}`);
    }
  }
});

test('confluenze: grafo coerente, correzioni a mano e delta del Nilo', () => {
  const into = (a, b) => assert.equal(byId.get(a).flowsInto, b, `${a} -> ${b}`);
  into('R_SEGRE', 'R_EBRO');
  into('R_CINCA', 'R_SEGRE');
  into('R_ESLA', 'R_DOURO');
  into('R_ZEZERE', 'R_TAGUS');
  into('R_GENIL', 'R_GUADALQUIVIR');
  into('R_MUONIO', 'R_TORNE_ALV');
  into('R_FAXALVEN', 'R_ANGERMANALVEN');
  into('R_UME_ALV', 'R_VINDEL'); // in NE il corso inferiore dell'Ume e la linea etichettata Vindel: si segue la geometria
  into('R_VORMA', 'R_GLOMMA');
  into('R_STORA_LULE_ALV', 'R_LULE_ALV');
  into('R_JILOCA', 'R_JALON');
  into('R_JALON', 'R_EBRO');
  assert.deepEqual(downstreamChain(catalog.rivers, 'R_CINCA'), ['R_CINCA', 'R_SEGRE', 'R_EBRO']);
  for (const id of ['R_NILE', 'R_EBRO', 'R_TAGUS', 'R_THAMES', 'R_GLOMMA', 'R_VINDEL', 'R_SWALE', 'R_BARROW', 'R_ROSETTA_BRANCH', 'R_DAMIETTA_BRANCH']) {
    assert.equal(byId.get(id).class, 'main', id);
    assert.equal(byId.get(id).flowsInto, null, id);
  }
  for (const id of ['R_ROSETTA_BRANCH', 'R_DAMIETTA_BRANCH']) assert.ok(byId.get(id).knownIssues.includes('distributary_of_R_NILE'), id);
  assert.equal(byId.get('R_SEGRE').class, 'secondary');
});

test('navigabilita: solo elenco curato non verificato', () => {
  const nav = catalog.rivers.filter((r) => r.navigable && /v5\.1\.1/.test(r.source)).map((r) => r.id).sort();
  assert.deepEqual(nav, ['R_DOURO', 'R_GOTA_ALV', 'R_GUADALQUIVIR', 'R_NILE', 'R_SHANNON', 'R_TAGUS', 'R_THAMES']);
  assert.ok(nav.every((id) => byId.get(id).navigableBasis === 'curated_unverified'));
});

test('citta sulla riva: il fiume passa entro 6 km (linea a scala 1:10 milioni)', () => {
  const towns = [
    ['Londra', 'R_THAMES', -0.12, 51.5], ['Limerick', 'R_SHANNON', -8.63, 52.67], ['Athlone', 'R_SHANNON', -7.94, 53.42],
    ['Toledo', 'R_TAGUS', -4.02, 39.86], ['Santarem', 'R_TAGUS', -8.68, 39.24], ['Saragozza', 'R_EBRO', -0.88, 41.65],
    ['Tortosa', 'R_EBRO', 0.52, 40.81], ['Porto', 'R_DOURO', -8.61, 41.14], ['Zamora', 'R_DOURO', -5.75, 41.5],
    ['Siviglia', 'R_GUADALQUIVIR', -5.99, 37.39], ['Cordova', 'R_GUADALQUIVIR', -4.78, 37.88], ['Badajoz', 'R_GUADIANA', -6.97, 38.88],
    ['Il Cairo', 'R_NILE', 31.24, 30.04], ['Luxor', 'R_NILE', 32.64, 25.7], ['Assuan', 'R_NILE', 32.9, 24.09],
    ['Rosetta', 'R_ROSETTA_BRANCH', 30.42, 31.4], ['Damietta', 'R_DAMIETTA_BRANCH', 31.82, 31.42], ['Kenitra', 'R_SEBOU', -6.58, 34.26],
    ['Goteborg', 'R_GOTA_ALV', 11.97, 57.7], ['Umea', 'R_VINDEL', 20.26, 63.83], ['Boden', 'R_LULE_ALV', 21.69, 65.83],
    ['Oulu', 'R_OULUJOKI', 25.47, 65.01], ['Rovaniemi', 'R_KEMIJOKI', 25.72, 66.5], ['Pori', 'R_KOKEMAENJOKI', 21.8, 61.48],
    ['Fredrikstad', 'R_GLOMMA', 10.95, 59.21],
  ];
  for (const [n, id, lon, lat] of towns) {
    const d = distanceToRiverKm(model, id, lon, lat);
    assert.ok(d < 6, `${n}: ${id} a ${d.toFixed(1)} km`);
  }
});

test('lunghezze: linea generalizzata, tra il 55 e il 105 per cento del valore reale (non e una misura)', () => {
  // Natural Earth 10m accorcia i meandri e il catalogo misura solo la linea ritagliata sul territorio.
  const real = { R_TAGUS: 1007, R_DOURO: 897, R_EBRO: 930, R_GUADIANA: 744, R_GUADALQUIVIR: 657, R_THAMES: 346, R_GLOMMA: 621, R_DALALVEN: 520, R_KEMIJOKI: 550, R_SHANNON: 360 };
  for (const [id, km] of Object.entries(real)) {
    const r = byId.get(id).lengthKm / km;
    assert.ok(r > 0.55 && r < 1.05, `${id} ${byId.get(id).lengthKm} vs ${km}`);
  }
});
