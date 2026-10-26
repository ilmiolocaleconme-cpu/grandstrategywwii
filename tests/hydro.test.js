// Centrali idroelettriche del CSV dell'utente: import fedele, province dalle coordinate, flusso senza ingressi né autoconsumo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from '../src/data/csv.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { installedMegawatts, plantId, parseCoordinates, buildHydroPlants, validateHydro, normalizeHydroRows, HYDRO_HEADER, HYDRO_HEADER_PRE } from '../src/data/hydro.js';
import { fullCapacityFlows } from '../src/data/recipes.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { hydroBuilt } from '../scripts/build-hydro.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));

test('CSV: copie fedeli (sha256), 15 centrali pre-1936 e 23 del 1936-45', () => {
  const src = json('resources/SOURCE_IDRO.json');
  const counts = {};
  for (const f of src.files) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../data/resources/${f.file}`, import.meta.url))).digest('hex'), f.sha256, f.file);
    counts[f.file] = parseCsv(text(`resources/${f.file}`), { name: f.file }).length;
  }
  assert.deepEqual(counts, { 'centrali_idroelettriche_pre_1936.csv': 15, 'centrali_idroelettriche_1936_1945.csv': 23 });
});

test('i due formati CSV si normalizzano; intestazione sconosciuta = errore', () => {
  const ev = normalizeHydroRows([{ Nome_Centrale: 'A', Nazione: 'N', Provincia_Stato_Contea: 'P', Anno: '1940', Mese: 'Ottobre', Potenza_MW: '45.0', Coordinate: '1, 2' }], HYDRO_HEADER)[0];
  assert.deepEqual([ev.year, ev.month, ev.mw, ev.era], [1940, 10, 45, 'event']);
  const pre = normalizeHydroRows([{ 'Nome della Centrale': 'B', Nazione: 'N', 'Provincia / Stato / Contea': 'P', 'Anno e Mese': '1932-10', 'Potenza Output (MW)': '558.0', Coordinate: '1, 2' }], HYDRO_HEADER_PRE)[0];
  assert.deepEqual([pre.year, pre.month, pre.mw, pre.era], [1932, 10, 558, 'pre1936']);
  assert.throws(() => normalizeHydroRows([], ['x', 'y']), /intestazione/);
});

test('coordinate e id', () => {
  assert.deepEqual(parseCoordinates('36.0162, -114.7378'), { lat: 36.0162, lon: -114.7378 });
  assert.equal(parseCoordinates('-23.8789, -46.4389').lat, -23.8789);
  assert.equal(parseCoordinates('boh'), null);
  assert.equal(parseCoordinates('95, 10'), null);
  assert.equal(plantId('Centrale di Krångede'), 'HYD-CENTRALE_DI_KRANGEDE');
  assert.equal(plantId('Vemork (Ampliamento idrogeno/acqua pesante)'), 'HYD-VEMORK');
});

test('mappatura: ogni centrale in una sola provincia, file allineato, validatore pulito', async () => {
  const built = await hydroBuilt();
  assert.equal(built.unmapped.length, 0); assert.equal(built.ambiguous.length, 0);
  const doc = json('resources/hydro_plants.json');
  assert.deepEqual(doc.plants, built.plants);
  const prov = await loadProvinces();
  const mother = new Set(prov.features.map((f) => f.properties.parentProvince ?? f.properties.id));
  assert.deepEqual(validateHydro(doc, { motherIds: mother }), []);
  const by = Object.fromEntries(doc.plants.map((p) => [p.id, p]));
  assert.equal(by['HYD-GRAND_COULEE_DAM'].provinceId, 'P_USA_WASHINGTON');
  assert.equal(by['HYD-GRAND_COULEE_DAM'].megawatts, 1974);
  assert.equal(by['HYD-GRAND_COULEE_DAM'].validFrom, '1941-03-01');
  assert.equal(by['HYD-VEMORK'].provinceId, 'P_NOR_TELEMARK');
  assert.equal(by['HYD-HOOVER_DAM'].provinceId, 'P_USA_ARIZONA', 'sul confine Nevada/Arizona: decide il punto delle coordinate');
  assert.equal(doc.plants.length, 38);
  assert.equal(doc.plants.filter((p) => p.era === 'pre1936').length, 15);
  // Niagara: le coordinate cadono sul fiume di confine, vale il luogo dichiarato nel CSV (override con motivo)
  assert.equal(by['HYD-SCHOELLKOPF_POWER_STATION'].provinceId, 'P_USA_NEW_YORK');
  assert.equal(by['HYD-SIR_ADAM_BECK_PUMP_GENERATING_STATION_I'].provinceId, 'P_CAN_ONTARIO');
  assert.deepEqual(doc.plants.filter((p) => p.provinceOverride).map((p) => p.id).sort(), ['HYD-SCHOELLKOPF_POWER_STATION', 'HYD-SIR_ADAM_BECK_PUMP_GENERATING_STATION_I']);
  assert.equal(by['HYD-CENTRALE_BERTINI'].provinceId, 'P_ITA_COMO', 'Lecco nel 1936 è provincia di Como');
});

test('buildHydroPlants: fuori da ogni provincia e ambiguità non sono silenziose', () => {
  const row = { name: 'X', country: 'Y', place: 'Z', year: 1940, month: 3, mw: 10, coords: '0, 0', era: 'event' };
  assert.deepEqual(buildHydroPlants([row], { provincesAt: () => [] }).unmapped, ['HYD-X']);
  const f = (id) => ({ properties: { id } });
  assert.equal(buildHydroPlants([row], { provincesAt: () => [f('A'), f('B')] }).ambiguous.length, 1);
  assert.equal(buildHydroPlants([row], { provincesAt: () => [f('A')] }).plants[0].validFrom, '1940-03-01');
  const ov = new Map([['HYD-X', { province_id: 'B', reason: 'confine' }]]);
  const forced = buildHydroPlants([row], { provincesAt: () => [f('A')] }, { overrides: ov }).plants[0];
  assert.deepEqual([forced.provinceId, forced.provinceFromCoordinates, forced.provinceOverride], ['B', 'A', true]);
});

test('validatore idro: errori rilevati', () => {
  const ok = { schema: 'hydro-plants-v1', plants: [{ id: 'A', provinceId: 'P1', megawatts: 5, validFrom: '1940-03-01', era: 'event', quality: 'user_csv' }] };
  const ctx = { motherIds: new Set(['P1']) };
  assert.deepEqual(validateHydro(ok, ctx), []);
  const bad = (fn) => { const f = JSON.parse(JSON.stringify(ok)); fn(f.plants[0]); return validateHydro(f, ctx); };
  assert.ok(bad((p) => { p.provinceId = 'P9'; }).some((e) => e.includes('provincia inesistente')));
  assert.ok(bad((p) => { p.megawatts = 0; }).some((e) => e.includes('potenza')));
  assert.ok(bad((p) => { p.validFrom = '1940-13-01'; }).some((e) => e.includes('data')));
  assert.ok(bad((p) => { p.quality = 'storico'; }).some((e) => e.includes('qualità')));
  assert.ok(bad((p) => { p.era = 'pre1936'; }).some((e) => e.includes('incoerente')), 'una centrale del 1940 non può essere base');
  assert.ok(bad((p) => { p.provinceOverride = true; }).some((e) => e.includes('senza motivo')));
});

test('idro e centrale a carbone: nessun autoconsumo, idro senza ingressi', () => {
  const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
  const rec = json('industry/recipes.json');
  const power = rec.recipes.find((r) => r.factory === 'FCT-POWER');
  assert.equal(cat.byId.get('FCT-POWER').energy_consumption, 25, 'il Pack resta intatto');
  assert.equal(fullCapacityFlows(power, cat.byId.get('FCT-POWER')).energyMw, 0);
  assert.equal(fullCapacityFlows(rec.recipes.find((r) => r.factory === 'FCT-STEEL'), cat.byId.get('FCT-STEEL')).energyMw, 12, 'le altre fabbriche consumano');
  assert.deepEqual(rec.flows.find((x) => x.source === 'hydro').inputs, []);
});

test('fasi dello stesso sito: potenza additiva (Vemork, Cubatão), siti dichiarati nei dati', () => {
  const doc = json('resources/hydro_plants.json');
  const sites = {};
  for (const p of doc.plants) if (p.siteId) (sites[p.siteId] ??= []).push(p.id);
  assert.deepEqual(Object.keys(sites).sort(), ['SITE-CUBATAO', 'SITE-VEMORK']);
  assert.ok(Object.values(sites).every((l) => l.length === 2));
  const tel = (d) => installedMegawatts(doc, d, { provinceId: 'P_NOR_TELEMARK' });
  assert.equal(tel('1935-12-31'), 108);
  assert.equal(tel('1937-12-01'), 216, 'Vemork: 108 del 1911 + 108 del 1937');
  const sp = (d) => installedMegawatts(doc, d, { provinceId: 'P_BRA_SAO_PAULO' });
  assert.equal(sp('1936-04-30'), 84);
  assert.equal(sp('1936-05-01'), 524, 'Cubatão: 84 del 1926 + 440 del 1936');
  assert.equal(installedMegawatts(doc, '1935-12-31'), doc.plants.filter((p) => p.era === 'pre1936').reduce((t, p) => t + p.megawatts, 0));
  assert.equal(installedMegawatts(doc, '1945-12-31'), doc.plants.reduce((t, p) => t + p.megawatts, 0));
});
