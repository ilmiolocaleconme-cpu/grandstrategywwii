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

// ---- scorte e depositi ----
import { validateFuelStorage, storageCapacity, stockAfterDay } from '../src/data/fuel.js';

test('depositi: valori approvati, agganciati al Pack e agli edifici', () => {
  const f = json('military/fuel_storage.json');
  const structureIds = new Set(text('infrastructure/structures.csv').split(/\r?\n/).slice(1).map((l) => l.split(',')[0]).filter(Boolean));
  const buildingIds = new Set(json('buildings.json').buildings.map((b) => b.id));
  assert.deepEqual(validateFuelStorage(f, { structureIds, buildingIds }), []);
  assert.deepEqual(f.depots.map((d) => d.capacity), [1500, 5000, 15000]);
  assert.equal(f.baseCapacity, 0, 'nessuno stoccaggio gratuito');
});

test('capacità: somma dei depositi costruiti; senza depositi = 0; struttura sconosciuta = errore', () => {
  const f = json('military/fuel_storage.json');
  assert.equal(storageCapacity(f, {}), 0);
  assert.equal(storageCapacity(f, { 'INF-012': 1 }), 15000);
  assert.equal(storageCapacity(f, { 'INF-010': 2, 'INF-011': 1, 'INF-012': 1 }), 23000);
  assert.throws(() => storageCapacity(f, { 'INF-999': 1 }), /sconosciuta/);
  assert.throws(() => storageCapacity(f, { 'INF-010': -1 }), RangeError);
});

test('scorta giornaliera: l\'eccesso oltre la capacità si perde, il consumo non coperto è carenza, il bilancio torna', () => {
  assert.deepEqual(stockAfterDay(100, 50, 30, 1000), { stock: 120, lost: 0, shortfall: 0 });
  assert.deepEqual(stockAfterDay(990, 50, 30, 1000), { stock: 1000, lost: 10, shortfall: 0 });
  assert.deepEqual(stockAfterDay(20, 0, 30, 1000), { stock: 0, lost: 0, shortfall: 10 });
  assert.deepEqual(stockAfterDay(5, 50, 0, 0), { stock: 0, lost: 55, shortfall: 0 }, 'senza depositi tutto va perso');
  // nessun carburante dal nulla: iniziale + prodotto = finale + consumato + perso − carenza
  for (const [s, p, c, cap] of [[100, 50, 30, 1000], [990, 50, 30, 1000], [20, 0, 30, 1000], [5, 50, 0, 0]]) {
    const r = stockAfterDay(s, p, c, cap);
    assert.equal(s + p, r.stock + (c - r.shortfall) + r.lost);
  }
});

test('un deposito strategico copre circa tre mesi di un esercito da 175 t/giorno', () => {
  const f = json('military/fuel_storage.json');
  const days = storageCapacity(f, { 'INF-012': 1 }) / 175;
  assert.ok(days > 80 && days < 90, `giorni ${days}`);
});

test('errori scorte rilevati', () => {
  const base = json('military/fuel_storage.json');
  const bad = (fn) => { const f = JSON.parse(JSON.stringify(base)); fn(f); return validateFuelStorage(f, { structureIds: new Set(['INF-010', 'INF-011', 'INF-012']), buildingIds: new Set(['depot']) }); };
  assert.ok(bad((f) => { f.depots[0].structure_id = 'INF-777'; }).some((e) => e.includes('non esiste nel Pack')));
  assert.ok(bad((f) => { f.depots[1].capacity = 100; }).some((e) => e.includes('maggiore del livello precedente')));
  assert.ok(bad((f) => { f.overflow = 'kept'; }).some((e) => e.includes('overflow')));
  assert.ok(bad((f) => { f.depots[0].building = 'castle'; }).some((e) => e.includes('edificio')));
  assert.ok(bad((f) => { f.depots.push({ ...f.depots[0], capacity: 99999 }); }).some((e) => e.includes('duplicato')));
});
