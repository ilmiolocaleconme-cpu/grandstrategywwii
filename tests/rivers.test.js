import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from '../src/data/validate.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import {
  buildRiverModel, distanceToLineKm, distanceToRiverKm, sampleLine, lineLengthKm,
  riverProvinceCrossings, riverBorderGraph, downstreamChain,
} from '../src/data/rivers.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const catalog = {
  nations: read('nations.json'), resources: read('resources.json'), rivers: read('rivers.json'),
  crossings: read('crossings.json'), political: read('political_1936.json'), provinces: await loadProvinces(),
  riversGeo: read('rivers_geo.json'), lakes: read('lakes.json'),
};
const model = buildRiverModel(catalog.rivers, catalog.riversGeo);
const provinceIndex = buildProvinceIndex(catalog.provinces);
const byId = new Map(catalog.rivers.map((r) => [r.id, r]));

test('il catalogo con fiumi, tratti e laghi è valido', () => {
  const r = validateCatalog(catalog);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes('fiumi') && w.includes('approssimazione')));
});

test('il validatore rileva tratti orfani, fiumi senza tratti e laghi malformati', () => {
  const bad = structuredClone(catalog);
  bad.riversGeo.features.push({ type: 'Feature', properties: { riverId: 'R_NONESISTE' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } });
  bad.riversGeo.features = bad.riversGeo.features.filter((f) => f.properties.riverId !== 'R_ELBE');
  bad.lakes.features[0].geometry = { type: 'Point', coordinates: [0, 0] };
  const e = validateCatalog(bad).errors.join('\n');
  assert.match(e, /fiume inesistente "R_NONESISTE"/);
  assert.match(e, /"R_ELBE" non ha nessun tratto/);
  assert.match(e, /geometria non valida/);
});

test('fiumi principali presenti, con classe e grafo delle confluenze corretti', () => {
  for (const id of ['R_DANUBE', 'R_RHINE', 'R_ELBE', 'R_ODER', 'R_VISTULA', 'R_PO', 'R_WESER']) {
    assert.equal(byId.get(id)?.class, 'main', id);
    assert.equal(byId.get(id).flowsInto, null, id);
  }
  const into = (a, b) => assert.equal(byId.get(a).flowsInto, b, `${a} -> ${b}`);
  into('R_MAIN', 'R_RHINE');
  into('R_MOSELLE', 'R_RHINE');
  into('R_WARTA', 'R_ODER');
  into('R_SAVA', 'R_DANUBE');
  into('R_INN', 'R_DANUBE');
  into('R_TISZA', 'R_DANUBE');
  into('R_TICINO', 'R_PO');
  into('R_WESTERN_BUG', 'R_VISTULA');
  assert.deepEqual(downstreamChain(catalog.rivers, 'R_MUR'), ['R_MUR', 'R_DRAVA', 'R_DANUBE']);
  assert.deepEqual(downstreamChain(catalog.rivers, 'R_DRINA'), ['R_DRINA', 'R_SAVA', 'R_DANUBE']);
});

test('navigabilità e larghezza sono dichiarate come stime, non come dati verificati', () => {
  for (const r of catalog.rivers) {
    assert.equal(typeof r.navigable, 'boolean');
    assert.ok(['curated_unverified', 'unknown_assumed_false'].includes(r.navigableBasis), r.id);
    assert.equal(r.widthBasis, 'proxy_from_natural_earth_scalerank');
    assert.equal(r.approximate, true);
  }
  assert.equal(byId.get('R_RHINE').navigable, true);
  assert.equal(byId.get('R_LOIRE').navigable, false);
});

test('città note sulla riva: il fiume passa entro 6 km (linea a scala 1:10 milioni)', () => {
  const towns = [
    ['Colonia', 'R_RHINE', 6.96, 50.94], ['Vienna', 'R_DANUBE', 16.39, 48.22], ['Budapest', 'R_DANUBE', 19.05, 47.5],
    ['Dresda', 'R_ELBE', 13.74, 51.05], ['Magdeburgo', 'R_ELBE', 11.64, 52.13], ['Varsavia', 'R_VISTULA', 21.0, 52.23],
    ['Cracovia', 'R_VISTULA', 19.93, 50.05], ['Breslavia', 'R_ODER', 17.03, 51.11], ['Stettino', 'R_ODER', 14.55, 53.42],
    ['Torino', 'R_PO', 7.68, 45.07], ['Brema', 'R_WESER', 8.8, 53.08], ['Francoforte', 'R_MAIN', 8.68, 50.11],
    ['Belgrado (Sava)', 'R_SAVA', 20.45, 44.82], ['Zagabria (Sava)', 'R_SAVA', 15.98, 45.8],
  ];
  for (const [n, id, lon, lat] of towns) {
    const d = distanceToRiverKm(model, id, lon, lat);
    assert.ok(d < 6, `${n}: ${id} a ${d.toFixed(1)} km`);
  }
});

test('lunghezze: coerenti con i valori noti entro il 15 per cento', () => {
  const near = (id, km) => assert.ok(Math.abs(byId.get(id).lengthKm - km) / km < 0.15, `${id} ${byId.get(id).lengthKm} vs ${km}`);
  near('R_RHINE', 1230); // il tratto nell'area di studio parte dopo il Reno alpino
  near('R_ELBE', 1094);
  near('R_VISTULA', 1047);
  near('R_ODER', 854);
});

test('geometria di base: distanza dalla linea, campionamento e lunghezza', () => {
  const line = [[10, 45], [11, 45]];
  assert.ok(Math.abs(distanceToLineKm(10.5, 45.1, line) - 11.057) < 0.05);
  assert.ok(distanceToLineKm(10.5, 45, line) < 1e-9);
  assert.ok(distanceToLineKm(9, 45, line) > 70);
  const s = sampleLine(line, 5);
  assert.deepEqual(s[0], [10, 45]);
  assert.deepEqual(s[s.length - 1], [11, 45]);
  assert.ok(s.length >= 15 && s.length <= 18, `campioni ${s.length}`);
  assert.ok(Math.abs(lineLengthKm(line) - 78.7) < 0.2);
});

test('attraversamenti tra province: caso sintetico', () => {
  const sq = (id, x0) => ({ type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates: [[[x0, 0], [x0 + 1, 0], [x0 + 1, 1], [x0, 1], [x0, 0]]] } });
  const idx = buildProvinceIndex({ features: [sq('A', 0), sq('B', 1), sq('C', 2)] });
  const m = buildRiverModel([{ id: 'R_T' }], { features: [{ properties: { riverId: 'R_T' }, geometry: { type: 'LineString', coordinates: [[0.1, 0.5], [2.9, 0.5]] } }] });
  const ev = riverProvinceCrossings(m, idx, { stepKm: 5 });
  assert.deepEqual(ev.map((e) => `${e.from}>${e.to}`), ['A>B', 'B>C']);
  const g = riverBorderGraph(ev);
  assert.deepEqual([...g.keys()], ['A|B', 'B|C']);
});

test('attraversamenti reali: il Danubio e il Reno cambiano province, il Po resta in Italia', () => {
  const events = riverProvinceCrossings(model, provinceIndex, { stepKm: 3 });
  assert.ok(events.length > 100, `attraversamenti ${events.length}`);
  const graph = riverBorderGraph(events);
  const ofRiver = (id) => [...graph.values()].filter((p) => p.rivers.has(id));
  assert.ok(ofRiver('R_RHINE').length >= 2, 'Reno');
  assert.ok(ofRiver('R_ELBE').length >= 3, 'Elba');
  assert.ok(ofRiver('R_ODER').length >= 3, 'Oder');
  assert.ok(ofRiver('R_VISTULA').length >= 2, 'Vistola');
  assert.ok(ofRiver('R_DANUBE').length >= 2, 'Danubio');
  for (const p of ofRiver('R_PO')) {
    assert.ok(p.a.startsWith('P_ITA_') && p.b.startsWith('P_ITA_'), `Po tra ${p.a} e ${p.b}`);
  }
  for (const e of events) {
    assert.ok(catalog.provinces.features.some((f) => f.properties.id === e.from));
    assert.notEqual(e.from, e.to);
  }
});

test('laghi: Neusiedlersee presente con area plausibile (il poligono Natural Earth è più piccolo del lago reale)', () => {
  const lake = catalog.lakes.features.find((f) => /neusiedl/i.test(f.properties.name ?? ''));
  assert.ok(lake, 'Neusiedlersee non trovato');
  assert.ok(lake.properties.areaKm2 > 100 && lake.properties.areaKm2 < 400, `area ${lake.properties.areaKm2}`);
  assert.ok(catalog.lakes.features.length > 50);
});
