import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProvinceIndex } from '../src/data/geometry.js';

const provinces = JSON.parse(readFileSync(new URL('../data/provinces_1936.json', import.meta.url), 'utf8'));
const index = buildProvinceIndex(provinces);
const byOwner = (o) => provinces.features.filter((f) => f.properties.owner === o);
const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);

test('Europa orientale: numero di province, qualità e fonte', () => {
  const counts = { HUN: 20, ROM: 45, BGR: 26, GRC: 14, ALB: 12 };
  for (const [o, n] of Object.entries(counts)) {
    assert.equal(byOwner(o).length, n, o);
    assert.ok(byOwner(o).every((f) => f.properties.borderQuality === 'hypothesis' && f.properties.source && f.properties.license), o);
  }
  assert.equal(provinces.features.filter((f) => f.properties.id === 'P_ITA_DODECANESO').length, 1);
});

test('Romania 1936: Basarabia, Bucovina de Nord e Cadrilater ricostruite, province marcate come ricostruite', () => {
  for (const id of ['P_ROM_BASARABIA', 'P_ROM_BUCOVINA_DE_NORD', 'P_ROM_CADRILATER']) {
    const f = provinces.features.find((x) => x.properties.id === id);
    assert.ok(f, id);
    assert.ok(f.properties.knownIssues.includes('unita_storica_ricostruita'), id);
  }
  assert.ok(!provinces.features.some((f) => f.properties.owner === 'BGR' && /DOBRICH|SILISTRA/.test(f.properties.id)), 'Dobrič e Silistra erano rumene');
});

test('città note nella provincia attesa', () => {
  const cases = [
    ['Budapest', 19.04, 47.5, 'P_HUN_BUDAPEST'], ['Debrecen', 21.63, 47.53, 'P_HUN_HAJDU_BIHAR'], ['Szeged', 20.15, 46.25, 'P_HUN_CSONGRAD'],
    ['Pécs', 18.23, 46.07, 'P_HUN_BARANYA'], ['Bucarest', 26.1, 44.43, 'P_ROM_BUCURESTI'], ['Cluj', 23.6, 46.77, 'P_ROM_CLUJ'],
    ['Brașov', 25.6, 45.65, 'P_ROM_BRASOV'], ['Chișinău', 28.86, 47.02, 'P_ROM_BASARABIA'], ['Cernăuți', 25.94, 48.29, 'P_ROM_BUCOVINA_DE_NORD'],
    ['Ismail (Budjak)', 28.84, 45.35, 'P_ROM_BASARABIA'], ['Dobrič (Cadrilater)', 27.57, 43.57, 'P_ROM_CADRILATER'], ['Medgidia (Dobrugia)', 28.27, 44.25, 'P_ROM_CONSTANTA'],
    ['Sofia', 23.32, 42.7, 'P_BGR_SOFIA_CITTA'], ['Plovdiv', 24.75, 42.15, 'P_BGR_PLOVDIV'], ['Varna', 27.9, 43.2, 'P_BGR_VARNA'],
    ['Atene', 23.73, 37.98, 'P_GRC_ATTIKI'], ['Salonicco', 22.94, 40.64, 'P_GRC_KENTRIKI_MAKEDONIA'], ['Giannina', 20.85, 39.67, 'P_GRC_IPEIROS'],
    ['Candia (Creta)', 25.14, 35.3, 'P_GRC_KRITI'], ['Rodi', 28.0, 36.2, 'P_ITA_DODECANESO'], ['Tirana', 19.82, 41.33, 'P_ALB_TIRANE'],
  ];
  for (const [nome, lon, lat, id] of cases) assert.deepEqual(at(lon, lat), [id], nome);
});
