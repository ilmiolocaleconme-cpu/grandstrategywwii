import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const provinces = await loadProvinces();
const index = buildProvinceIndex(provinces);
const byOwner = (o) => provinces.features.filter((f) => f.properties.owner === o);
const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);

test('Francia 1936: 90 dipartimenti, Senna, Senna e Oise e Corsica uniti, Belfort presente', () => {
  const fra = byOwner('FRA');
  assert.equal(fra.length, 90);
  const ids = new Set(fra.map((f) => f.properties.id));
  for (const id of ['P_FRA_SEINE', 'P_FRA_SEINE_ET_OISE', 'P_FRA_CORSE', 'P_FRA_TERRITOIRE_DE_BELFORT', 'P_FRA_BAS_RHIN', 'P_FRA_HAUT_RHIN', 'P_FRA_MOSELLE']) assert.ok(ids.has(id), id);
  for (const id of ['P_FRA_PARIS', 'P_FRA_HAUTS_DE_SEINE', 'P_FRA_ESSONNE', 'P_FRA_YVELINES', 'P_FRA_CORSE_DU_SUD', 'P_FRA_HAUTE_CORSE']) assert.ok(!ids.has(id), `${id} non esisteva nel 1936`);
  assert.ok(fra.every((f) => f.properties.borderQuality === 'hypothesis' && f.properties.license && f.properties.source));
});

test('Francia: città note nel dipartimento atteso', () => {
  const cases = [
    ['Parigi', 2.35, 48.86, 'P_FRA_SEINE'], ['Versailles', 2.13, 48.80, 'P_FRA_SEINE_ET_OISE'], ['Lione', 4.84, 45.76, 'P_FRA_RHONE'],
    ['Marsiglia', 5.37, 43.30, 'P_FRA_BOUCHES_DU_RHONE'], ['Strasburgo', 7.75, 48.58, 'P_FRA_BAS_RHIN'], ['Metz', 6.18, 49.12, 'P_FRA_MOSELLE'],
    ['Belfort', 6.86, 47.64, 'P_FRA_TERRITOIRE_DE_BELFORT'], ['Corte', 9.15, 42.30, 'P_FRA_CORSE'], ['Sartène', 8.97, 41.62, 'P_FRA_CORSE'],
    ['Lilla', 3.06, 50.63, 'P_FRA_NORD'], ['Bordeaux', -0.58, 44.84, 'P_FRA_GIRONDE'], ['Brest', -4.49, 48.39, 'P_FRA_FINISTERE'],
    ['Nizza', 7.27, 43.70, 'P_FRA_ALPES_MARITIMES'], ['Tolosa', 1.44, 43.60, 'P_FRA_HAUTE_GARONNE'], ['Nantes', -1.55, 47.22, 'P_FRA_LOIRE_ATLANTIQUE'],
  ];
  for (const [nome, lon, lat, id] of cases) assert.deepEqual(at(lon, lat), [id], nome);
});

test('Svizzera e Liechtenstein: 25 cantoni (il Giura è parte di Berna), città note', () => {
  const che = byOwner('CHE');
  assert.equal(che.length, 25);
  assert.ok(!che.some((f) => f.properties.id === 'P_CHE_JURA'), 'il cantone Giura nasce nel 1979');
  assert.equal(byOwner('LIE').length, 1);
  const cases = [
    ['Berna', 7.45, 46.95, 'P_CHE_BERN'], ['Delémont (Giura, nel 1936 bernese)', 7.34, 47.36, 'P_CHE_BERN'], ['Zurigo', 8.54, 47.37, 'P_CHE_ZURICH'],
    ['Ginevra', 6.14, 46.22, 'P_CHE_GENEVE'], ['Basilea', 7.59, 47.56, 'P_CHE_BASEL_STADT'], ['Lugano', 8.95, 46.01, 'P_CHE_TICINO'],
    ['Coira', 9.53, 46.85, 'P_CHE_GRAUBUNDEN'], ['Appenzello', 9.41, 47.33, 'P_CHE_APPENZELL_INNERRHODEN'], ['Vaduz', 9.52, 47.14, 'P_LIE_LIECHTENSTEIN'],
  ];
  for (const [nome, lon, lat, id] of cases) assert.deepEqual(at(lon, lat), [id], nome);
});

test('Francia e Svizzera: confini con i vicini senza buchi evidenti né sovrapposizioni', () => {
  // punti sul confine storico noto: ciascuno deve cadere in esattamente una provincia
  const probes = [
    ['Strasburgo-Kehl (Reno)', 7.80, 48.58, 'DEU'], ['Lauterbourg', 8.10, 48.97, null], ['Basilea', 7.60, 47.58, null],
    ['Mentone (Italia a est)', 7.55, 43.80, 'ITA'], ['Dunkerque', 2.37, 51.03, 'FRA'], ['Longwy', 5.76, 49.52, null],
  ];
  for (const [nome, lon, lat] of probes) assert.ok(at(lon, lat).length <= 1, `${nome}: sovrapposizione ${at(lon, lat)}`);
  assert.equal(at(7.94, 48.47)[0]?.split('_')[1], 'DEU', 'Offenburg è tedesca');
  assert.equal(at(7.60, 48.40)[0]?.split('_')[1], 'FRA', 'Erstein è francese');
  assert.equal(at(7.55, 43.80)[0]?.split('_')[1], 'ITA', 'Ventimiglia-lato italiano');
});
