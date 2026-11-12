// Provincia = somma delle sponde (11–12/11/2026): slot per sponda, miniere divise per area, tetto +10%.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { provinceSum } from '../src/rules/provinceSum.js';
import { buildSlotCatalog, SLOT_CAPACITY } from '../src/rules/slots.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { bankIndex } from '../src/data/moveNet.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const sites = read('resources/mine_sites.json');
const economy = read('economy/economy.json');
const collection = await loadProvinces();
const bank = bankIndex(collection.features);

test('slot: 14 per ogni sponda, la madre accumula la somma', () => {
  const cat = buildSlotCatalog({ provinces: collection, zones: read('citta_grandi.json').features, nations: read('nations.json') });
  const banks = bank.banksOf('P_DEU_WESER_EMS');
  assert.equal(banks.length, 2);
  for (const b of banks) assert.equal(cat.provinces[b], SLOT_CAPACITY.province);
  assert.equal(cat.provinces.P_DEU_WESER_EMS, undefined, 'la madre divisa non ha slot propri');
  assert.equal(cat.byMother.P_DEU_WESER_EMS, 28);
  assert.equal(cat.provinces.P_USA_PENNSYLVANIA, 14);
});

test('miniere: tetto ×1,1 e giacimento diviso fra le sponde per area (la somma = la provincia)', () => {
  assert.equal(economy.mines.capFactor, 1.1);
  const pa = sites.byProvince.P_USA_PENNSYLVANIA.coal;
  assert.ok(pa.extraPerDay[2] > 0, 'anche dove la base era il massimo ora si cresce');
  const mother = sites.byProvince.P_BEL_HAINAUT.coal;
  assert.equal(mother.legacy, true);
  const parts = bank.banksOf('P_BEL_HAINAUT').map((b) => sites.byProvince[b].coal);
  const sum = parts.reduce((s, p) => s + p.extraPerDay[2], 0);
  assert.ok(Math.abs(sum - mother.extraPerDay[2]) < 0.01, `${sum} ≠ ${mother.extraPerDay[2]}`);
  assert.ok(Math.abs(parts.reduce((s, p) => s + p.share, 0) - 1) < 0.002);
});

test('accumulatore: la provincia somma fabbriche, slot e miniere delle sponde', () => {
  const [a, b] = bank.banksOf('P_BEL_HAINAUT');
  const catalog = { factories: new Map([['FCT-STEEL', { factory_class: 'industry' }]]) };
  const state = { nations: { BEL: {
    facilities: [{ id: 'f1', type: 'FCT-STEEL', provinceId: a }, { id: 'f2', type: 'FCT-STEEL', provinceId: b }, { id: 'f3', type: 'FCT-STEEL', provinceId: b }],
    construction: [],
    mines: [{ provinceId: b, resource: 'coal', level: 2 }],
  } } };
  const s = provinceSum(state, 'BEL', 'P_BEL_HAINAUT', [a, b], { slots: 14, sites, catalog, nameOf: (id) => id });
  assert.equal(s.total.slots, 28);
  assert.equal(s.total.factories, 3); assert.equal(s.total.used, 3);
  assert.equal(s.banks.find((r) => r.id === b).used, 2);
  assert.equal(s.total.extra.coal, sites.byProvince[b].coal.extraPerDay[1]);
  assert.equal(s.legacy, null);
});
