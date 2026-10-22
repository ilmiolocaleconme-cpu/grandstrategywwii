// Slot uguali per tutti: parte di città 10, provincia 14, capitale 14 per parte (src/rules/slots.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLOT_CAPACITY, buildSlotCatalog, slotsOf } from '../src/rules/slots.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const sq = (x0, y0) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]] });
const tile = (id, extra = {}) => ({ type: 'Feature', id, properties: { id, owner: 'X', name: id, ...extra }, geometry: sq(0, 0) });
const zone = (id, name, city, mother) => ({ type: 'Feature', id, properties: { id, name, owner: 'X', cittaId: city, parentProvince: mother, kind: 'citta' }, geometry: sq(0, 0) });

test('costanti: 10, 14, 14', () => assert.deepEqual({ ...SLOT_CAPACITY }, { cityPart: 10, province: 14, capitalPart: 14 }));

test('sintetico: sponde di una provincia contano una volta, città 10 per parte, capitale 14 per ogni parte, provincia-città senza slot di provincia', () => {
  const provinces = { features: [tile('P_X_A_SP1', { parentProvince: 'P_X_A' }), tile('P_X_A_SP2', { parentProvince: 'P_X_A' }), tile('P_X_B'), tile('P_X_CAP', { kind: 'citta' })] };
  const zones = [zone('Z1', 'Gamma', 'G', 'P_X_A'), zone('Z2', 'Gamma sud', 'G', 'P_X_A'), zone('Z3', 'Capitalia', 'C', 'P_X_B'), zone('Z4', 'Capitalia sud', 'C', 'P_X_B')];
  const cat = buildSlotCatalog({ provinces, zones, nations: [{ id: 'X', capital: 'Capitalia' }] });
  assert.equal(slotsOf(cat, 'P_X_A'), 14);
  assert.equal(slotsOf(cat, 'P_X_B'), 14);
  assert.equal(cat.provinces.P_X_CAP, 0); // provincia = città: niente slot di provincia
  assert.equal(cat.cityParts.P_X_CAP, 10); // conta come parte di città
  assert.equal(slotsOf(cat, 'Z1'), 10);
  assert.equal(slotsOf(cat, 'Z2'), 10);
  assert.equal(slotsOf(cat, 'Z3'), 14);
  assert.equal(slotsOf(cat, 'Z4'), 14);
  assert.deepEqual(cat.capitalParts.sort(), ['Z3', 'Z4']);
  assert.equal(slotsOf(cat, 'inesistente'), null);
});

test('dati reali: una provincia madre = 14 (tranne le 3 province-città), ogni zona 10 o 14, totali coerenti', async () => {
  const provinces = await loadProvinces();
  const zones = read('citta_grandi.json').features;
  const cat = buildSlotCatalog({ provinces, zones, nations: read('nations.json') });
  const mothers = new Set(provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id));
  assert.equal(Object.keys(cat.provinces).length, mothers.size);
  const zero = Object.entries(cat.provinces).filter(([, v]) => v === 0).map(([k]) => k).sort();
  assert.deepEqual(zero, ['P_HUN_BUDAPEST', 'P_LVA_RIGA', 'P_ROM_BUCURESTI']);
  assert.ok(Object.values(cat.provinces).every((v) => v === 0 || v === 14));
  assert.equal(Object.keys(cat.cityParts).length, zones.length);
  assert.ok(Object.values(cat.cityParts).every((v) => v === 10 || v === 14));
  assert.equal(cat.totals.cityPartSlots, 10 * zones.length + 4 * cat.capitalParts.length);
  assert.equal(cat.totals.slots, cat.totals.provinceSlots + cat.totals.cityPartSlots);
  // le parti di Budapest (capitale, divisa dal Danubio) hanno 14 slot ciascuna
  const bud = Object.entries(cat.cityParts).filter(([id]) => id.includes('BUDAPEST'));
  assert.ok(bud.length >= 2 && bud.every(([, v]) => v === 14));
  // Sofia: le zone si chiamano "Sofia (città)", la capitale va riconosciuta lo stesso
  const sof = Object.entries(cat.cityParts).filter(([id]) => id.includes('SOFIA'));
  assert.ok(sof.length >= 2 && sof.some(([, v]) => v === 14), 'Sofia capitale: 14 slot sulle sue parti');
});
