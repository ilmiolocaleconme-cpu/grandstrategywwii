// Consumo di carburante per categoria (tabella dimezzata approvata il 26/10/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFuelConsumption, dailyFuel, unitsSupported } from '../src/data/fuel.js';
import { loadIndustryCatalog } from '../src/data/industry.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));

test('consumi: file valido, 7 categorie, unità ferma al 10%', () => {
  const f = json('military/fuel_consumption.json');
  assert.deepEqual(validateFuelConsumption(f, { resources: json('resources.json') }), []);
  assert.equal(f.categories.length, 7);
  assert.equal(dailyFuel(f, 'armor', true), 12);
  assert.equal(dailyFuel(f, 'armor', false), 1.2);
  assert.equal(dailyFuel(f, 'infantry_foot', false), 0.05);
  assert.equal(dailyFuel(f, 'ufo', true), null, 'categoria sconosciuta: null, non zero');
});

test('una raffineria del Pack regge 8 divisioni corazzate, il sintetico 5; la fanteria a piedi quasi nulla', () => {
  const f = json('military/fuel_consumption.json');
  const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
  const ref = cat.byId.get('FCT-REFINERY').base_capacity_per_day; const syn = cat.byId.get('FCT-SYNFUEL').base_capacity_per_day;
  assert.equal(Math.floor(unitsSupported(f, 'armor', ref)), 8);
  assert.equal(Math.floor(unitsSupported(f, 'armor', syn)), 5);
  assert.ok(unitsSupported(f, 'infantry_foot', ref) >= 200);
});

test('errori rilevati', () => {
  const base = json('military/fuel_consumption.json');
  const bad = (fn) => { const f = JSON.parse(JSON.stringify(base)); fn(f); return validateFuelConsumption(f, { resources: json('resources.json') }); };
  assert.ok(bad((f) => { f.categories[0].operational = 0; }).some((e) => e.includes('consumo non valido')));
  assert.ok(bad((f) => { f.categories[1].id = f.categories[0].id; }).some((e) => e.includes('duplicata')));
  assert.ok(bad((f) => { f.idleFactor = 2; }).some((e) => e.includes('idleFactor')));
  assert.ok(bad((f) => { f.categories = []; }).some((e) => e.includes('nessuna categoria')));
  assert.ok(validateFuelConsumption({ schema: 'x' }).length === 1);
});
