import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { featureAreaKm2 } from '../src/map/geo.js';

// Inghilterra (GBR) e Mediterraneo (ALG, TUN, LBA, EGY, PAL, JOR, SYR, LBN, TUR, CYP, MLT, GIB):
// Natural Earth (confini attuali), qualita hypothesis. Soglie larghe: intercettano rotture, non certificano precisione.

const provinces = await loadProvinces();
const index = buildProvinceIndex(provinces);
const byOwner = (o) => provinces.features.filter((f) => f.properties.owner === o);
const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => f.properties.id);

test('conteggi per nazione e id con il codice del proprietario', () => {
  const N = { GBR: 40, ALG: 48, TUN: 23, LBA: 22, EGY: 27, PAL: 8, JOR: 12, SYR: 15, LBN: 6, TUR: 80, CYP: 6, MLT: 1, GIB: 1 };
  for (const [o, n] of Object.entries(N)) {
    const fs = byOwner(o);
    assert.equal(fs.length, n, o);
    assert.ok(fs.every((f) => f.properties.id.startsWith(`P_${o}_`) && f.properties.borderQuality === 'hypothesis'), o);
  }
});

test('citta note nella provincia attesa', () => {
  assert.deepEqual(at(-0.12, 51.5), ['P_GBR_LONDRA']);
  assert.deepEqual(at(-1.26, 51.75), ['P_GBR_OXFORDSHIRE']);
  assert.deepEqual(at(-2.24, 53.48), ['P_GBR_LANCASHIRE']);
  assert.deepEqual(at(-1.55, 53.8), ['P_GBR_YORKSHIRE']);
  assert.deepEqual(at(3.05, 36.75), ['P_ALG_ALGER']);
  assert.deepEqual(at(10.18, 36.8), ['P_TUN_TUNIS']);
  assert.deepEqual(at(31.24, 30.04), ['P_EGY_AL_QAHIRAH']);
  assert.deepEqual(at(35.22, 31.78), ['P_PAL_JERUSALEM']);
  assert.deepEqual(at(36.29, 33.51), ['P_SYR_DAMASCUS']);
  assert.deepEqual(at(35.5, 33.89), ['P_LBN_BEIRUT']);
  assert.deepEqual(at(32.85, 39.93), ['P_TUR_ANKARA']);
  assert.deepEqual(at(14.4, 35.9), ['P_MLT_MALTA']);
  assert.deepEqual(at(-5.35, 36.14), ['P_GIB_GIBRALTAR']);
});

test('Hatay (Alessandretta) e in Siria, non in Turchia, nel 1936', () => {
  assert.deepEqual(at(36.16, 36.2), ['P_SYR_HATAY']);
  assert.equal(byOwner('TUR').some((f) => f.properties.id === 'P_TUR_HATAY'), false);
});

test('Inghilterra: 40 contee, area totale ~130 mila km2, Cumbria unita e Londra = County of London', () => {
  const total = byOwner('GBR').reduce((s, f) => s + featureAreaKm2(f), 0);
  assert.ok(total > 125000 && total < 135000, String(Math.round(total)));
  const london = featureAreaKm2(byOwner('GBR').find((f) => f.properties.id === 'P_GBR_LONDRA'));
  assert.ok(london > 250 && london < 360, String(Math.round(london)));
  assert.ok(byOwner('GBR').every((f) => f.properties.knownIssues.includes('raggruppata_da_unita_attuali')));
});

test('confini internazionali agganciati: nessuna sovrapposizione tra Stati (campionamento a 0,02 gradi)', () => {
  const boxes = { Maghreb: [-3, 29, 12, 37.5], 'Algeria-Marocco': [-9, 27, -0.5, 36], 'Libia-Egitto': [11, 22, 36, 33], Levante: [34, 29, 42, 38], 'Spagna-Portogallo-Marocco': [-10, 34, -1, 38] };
  for (const [name, [x0, y0, x1, y1]] of Object.entries(boxes)) {
    let overlapping = 0;
    for (let lat = y0; lat < y1; lat += 0.02) for (let lon = x0; lon < x1; lon += 0.02) if (at(lon, lat).length > 1) overlapping += 1;
    assert.equal(overlapping, 0, `${name}: ${overlapping} celle sovrapposte`);
  }
  // Turchia-Grecia-Bulgaria: poche celle (~2 km2) per fonti diverse sul tratto di Edirne
  let tr = 0;
  for (let lat = 39.5; lat < 42.5; lat += 0.02) for (let lon = 24; lon < 30; lon += 0.02) if (at(lon, lat).length > 1) tr += 1;
  assert.ok(tr <= 10, `Turchia-Grecia-Bulgaria: ${tr}`);
});
