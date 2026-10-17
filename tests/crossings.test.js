import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog, CROSSING_TYPES } from '../src/data/validate.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { buildRiverModel, riverBanks, distanceToRiverKm } from '../src/data/rivers.js';
import { crossingExistsAt, crossingsAt, crossingProvinces } from '../src/data/crossings.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const catalog = {
  nations: read('nations.json'), resources: read('resources.json'), rivers: read('rivers.json'),
  crossings: read('crossings.json'), political: read('political_1936.json'), provinces: await loadProvinces(),
  riversGeo: read('rivers_geo.json'), lakes: read('lakes.json'),
};
const model = buildRiverModel(catalog.rivers, catalog.riversGeo);
const provinceIndex = buildProvinceIndex(catalog.provinces);
const errorsOf = (c) => validateCatalog(c).errors.join('\n');

test('il catalogo con gli attraversamenti pilota Reno/Mosa è valido', () => {
  assert.deepEqual(validateCatalog(catalog).errors, []);
  assert.equal(catalog.crossings.length, 9);
});

test('ogni attraversamento ha fonte, licenza e qualità dichiarate; nessuno è "verified" senza verifica', () => {
  for (const c of catalog.crossings) {
    assert.ok(c.source.length > 10 && c.license.length > 5, c.id);
    assert.ok(['approximate', 'hypothesis'].includes(c.dataQuality), `${c.id}: nessuno è ancora verificato su fonte storica primaria`);
    assert.equal(c.approximate, true, c.id);
    // nessuna coordinata inventata: la posizione è solo il luogo + le province delle rive
    assert.equal('lon' in c || 'lat' in c || 'coordinates' in c, false, c.id);
  }
});

test('le rive coincidono con i dati: stessa provincia lungo il fiume, oppure coppia di province affacciate', () => {
  const banks = new Map();
  for (const c of catalog.crossings) {
    if (!banks.has(c.riverId)) banks.set(c.riverId, riverBanks(model, provinceIndex, c.riverId));
    const { along, facing } = banks.get(c.riverId);
    if (c.sideA === c.sideB) {
      assert.ok(along.has(c.sideA), `${c.id}: ${c.sideA} non è attraversata da ${c.riverId}`);
    } else {
      const key = [c.sideA, c.sideB].sort().join('|');
      assert.ok(facing.has(key), `${c.id}: ${key} non sono province affacciate sulle due rive di ${c.riverId}`);
    }
  }
});

test('i controllori sono coerenti: ponte tra due nazioni = nessun controllore; dentro una nazione = quella nazione', () => {
  const owner = new Map(catalog.provinces.features.map((f) => [f.properties.id, f.properties.owner]));
  for (const c of catalog.crossings) {
    const a = owner.get(c.sideA);
    const b = owner.get(c.sideB);
    if (a !== b) assert.equal(c.controller, null, `${c.id}: ponte di frontiera`);
    else assert.equal(c.controller, a, c.id);
  }
});

test('le località note stanno vicine al fiume indicato (entro 6 km, come i controlli sulle città)', () => {
  // coordinate approssimate usate SOLO per questo controllo, non salvate nei dati
  const sites = [
    ['X_RHINE_KOELN_HOHENZOLLERN', 6.965, 50.941],
    ['X_RHINE_REMAGEN_LUDENDORFF', 7.234, 50.580],
    ['X_RHINE_MAXAU_PONTONE', 8.295, 49.040],
    ['X_RHINE_WALDSHUT_FERROVIA', 8.220, 47.610],
    ['X_RHINE_NIMEGA_WAALBRUG', 5.860, 51.854],
    ['X_MEUSE_MAASTRICHT_WILHELMINA', 5.698, 50.850],
  ];
  const byId = new Map(catalog.crossings.map((c) => [c.id, c]));
  for (const [id, lon, lat] of sites) {
    const d = distanceToRiverKm(model, byId.get(id).riverId, lon, lat);
    assert.ok(d < 6, `${id}: ${d.toFixed(1)} km dal fiume`);
  }
});

test('date: ponte di barche di Maxau nel 1936, ponte fisso solo dal 1938, Waalbrug dal 16/6/1936', () => {
  const at = (d, opts) => crossingsAt(catalog.crossings, d, opts).map((c) => c.id);
  const maxau = (d) => at(d, { riverId: 'R_RHINE' }).filter((id) => id.includes('MAXAU'));
  assert.deepEqual(maxau('1936-01-01'), ['X_RHINE_MAXAU_PONTONE']);
  assert.deepEqual(maxau('1938-01-17'), ['X_RHINE_MAXAU_PONTONE', 'X_RHINE_MAXAU_FISSO_STRADA']);
  assert.deepEqual(maxau('1938-04-03').sort(), ['X_RHINE_MAXAU_FISSO_FERROVIA', 'X_RHINE_MAXAU_FISSO_STRADA']);
  assert.equal(at('1936-01-01').includes('X_RHINE_NIMEGA_WAALBRUG'), false);
  assert.equal(at('1936-06-15').includes('X_RHINE_NIMEGA_WAALBRUG'), false);
  assert.equal(at('1936-06-16').includes('X_RHINE_NIMEGA_WAALBRUG'), true);
  assert.equal(at('1936-01-01').length, 6);
});

test('crossingExistsAt: inizio incluso, fine esclusa', () => {
  const c = { validFrom: '1900-01-01', validTo: '1910-01-01' };
  assert.equal(crossingExistsAt(c, '1899-12-31'), false);
  assert.equal(crossingExistsAt(c, '1900-01-01'), true);
  assert.equal(crossingExistsAt(c, '1909-12-31'), true);
  assert.equal(crossingExistsAt(c, '1910-01-01'), false);
});

test('crossingProvinces: una provincia se le rive coincidono, due altrimenti', () => {
  assert.deepEqual(crossingProvinces({ sideA: 'A', sideB: 'A' }), ['A']);
  assert.deepEqual(crossingProvinces({ sideA: 'A', sideB: 'B' }), ['A', 'B']);
});

test('il tipo "ponte di barche" è ammesso e usato solo dove la fonte lo dice (Maxau)', () => {
  assert.ok(CROSSING_TYPES.includes('bridge_pontoon'));
  assert.deepEqual(catalog.crossings.filter((c) => c.type === 'bridge_pontoon').map((c) => c.id), ['X_RHINE_MAXAU_PONTONE']);
});

test('riverBanks: caso sintetico con fiume tra due province affacciate e fiume dentro una provincia', () => {
  const rect = (id, x0, y0, x1, y1) => ({ type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } });
  const idx = buildProvinceIndex({ features: [rect('N', 0, 0.5, 3, 1), rect('S', 0, 0, 3, 0.5), rect('W', 5, 0, 8, 1)] });
  const m = buildRiverModel(
    [{ id: 'R_B' }, { id: 'R_I' }],
    { features: [
      { properties: { riverId: 'R_B' }, geometry: { type: 'LineString', coordinates: [[0.1, 0.5], [2.9, 0.5]] } },
      { properties: { riverId: 'R_I' }, geometry: { type: 'LineString', coordinates: [[5.5, 0.5], [7.5, 0.5]] } },
    ] },
  );
  const border = riverBanks(m, idx, 'R_B', { stepKm: 5, offsetDeg: 0.05 });
  assert.deepEqual([...border.facing.keys()], ['N|S']);
  const inner = riverBanks(m, idx, 'R_I', { stepKm: 5, offsetDeg: 0.05 });
  assert.equal(inner.facing.size, 0);
  assert.ok(inner.along.has('W'));
  assert.equal(riverBanks(m, idx, 'R_NONESISTE').facing.size, 0);
});

// ---- il validatore rifiuta i dati sbagliati ----
const withCrossing = (patch) => {
  const c = structuredClone(catalog);
  Object.assign(c.crossings[0], patch);
  return c;
};

test('validatore: province delle rive inesistenti', () => {
  assert.match(errorsOf(withCrossing({ sideA: 'P_XXX_NIENTE' })), /sideA riferisce la provincia inesistente/);
  assert.match(errorsOf(withCrossing({ sideB: 'P_XXX_NIENTE' })), /sideB riferisce la provincia inesistente/);
});

test('validatore: date non valide o in ordine sbagliato', () => {
  assert.match(errorsOf(withCrossing({ validFrom: '1911-13-45' })), /validFrom non è una data/);
  assert.match(errorsOf(withCrossing({ validTo: '1911' })), /validTo non è una data/);
  assert.match(errorsOf(withCrossing({ validFrom: '1950-01-01', validTo: '1940-01-01' })), /validFrom successivo a validTo/);
});

test('validatore: dateBasis, dataQuality, fonte e licenza', () => {
  assert.match(errorsOf(withCrossing({ dateBasis: 'boh' })), /dateBasis non valido/);
  assert.match(errorsOf(withCrossing({ dataQuality: 'certissimo' })), /dataQuality non valido/);
  assert.match(errorsOf(withCrossing({ source: '   ' })), /source deve essere un testo non vuoto/);
  assert.match(errorsOf(withCrossing({ license: undefined })), /campo obbligatorio mancante "license"/);
});

test('validatore: id duplicato e fiume inesistente restano errori', () => {
  const dup = structuredClone(catalog);
  dup.crossings.push({ ...dup.crossings[0] });
  assert.match(errorsOf(dup), /id duplicato/);
  assert.match(errorsOf(withCrossing({ riverId: 'R_NONESISTE' })), /fiume inesistente/);
});

test('validatore: senza province nel catalogo le rive non vengono controllate (l\'app non le carica all\'avvio)', () => {
  const c = withCrossing({ sideA: 'P_XXX_NIENTE' });
  delete c.provinces;
  assert.equal(validateCatalog(c).errors.length, 0);
});
