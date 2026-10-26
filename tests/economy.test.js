import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEconomy, difficulty, mineCost, minePoints } from '../src/data/economy.js';
import { dailyIncome, spend } from '../src/rules/treasury.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const economy = read('data/economy/economy.json');
const resources = read('data/resources.json');
const recipes = read('data/industry/recipes.json');

test('economia: i dati reali sono validi', () => {
  assert.deepEqual(validateEconomy(economy, { resources, recipes }), []);
});

test('economia: il validatore rifiuta prezzo mancante, elettricità con prezzo e difficoltà base alterata', () => {
  const bad = structuredClone(economy);
  delete bad.prices.steel;
  bad.prices.electricity = 1;
  bad.difficulty.levels.find((l) => l.id === 'media').costMul = 2;
  const e = validateEconomy(bad, { resources, recipes }).join('|');
  assert.match(e, /manca il prezzo di steel/);
  assert.match(e, /elettricità/);
  assert.match(e, /tutti i moltiplicatori a 1/);
});

test('economia: livelli miniera con costi crescenti e 3 parti', () => {
  assert.equal(economy.mines.levels.length, economy.mines.gapParts);
  const bad = structuredClone(economy);
  bad.mines.levels[2].ecv = 10;
  assert.match(validateEconomy(bad, { resources, recipes }).join('|'), /costa meno/);
});

test('miniere: costo e difficoltà', () => {
  assert.deepEqual(mineCost(economy, 1, 'media'), { ecv: 60, days: 30, steel: 150, workers: 200 });
  assert.deepEqual(mineCost(economy, 3, 'facile'), { ecv: 50, days: 35, steel: 200, workers: 400 });
  assert.deepEqual(mineCost(economy, 2, 'reale'), { ecv: 120, days: 52, steel: 375, workers: 300 });
  assert.equal(mineCost(economy, 4, 'media'), null);
  assert.equal(mineCost(economy, 1, 'inesistente'), null);
});

test('miniere: punti da base verso max, mai oltre max', () => {
  assert.equal(minePoints(economy, 4.45, 12.85, 0), 4.45);
  assert.equal(minePoints(economy, 4.45, 12.85, 3), 12.85);
  assert.equal(minePoints(economy, 4.45, 12.85, 9), 12.85);
  assert.equal(minePoints(economy, 4.45, 12.85, 1), 7.25);
  assert.equal(minePoints(economy, 19.27, 19.27, 2), 19.27); // URSS ferro: nessun margine
});

test('entrata: acciaieria a pieno regime e tempo di ripagamento ~75 giorni', () => {
  const margin = 100 * economy.prices.steel - (160 * economy.prices.iron_ore + 80 * economy.prices.coal);
  assert.ok(Math.abs(margin - 1.64) < 1e-9);
  const days = 120 / margin;
  assert.ok(days > 65 && days < 85, `ripagamento ${days}`);
});

test('entrata: merci, territorio e difficoltà; elettricità senza entrata', () => {
  const inc = dailyIncome({ goods: { steel: 100, electricity: 500, wheat: 90 }, territory: { provinces: 10, cities: 2, capitals: 1 } }, economy, 'media');
  assert.equal(inc.goods, 3);
  assert.equal(inc.territory, 4); // 10*0.2 + 2*0.5 + 1
  assert.equal(inc.total, 7);
  assert.deepEqual(inc.byGood, { steel: 3 });
  assert.equal(dailyIncome({ goods: { steel: 100 }, territory: { provinces: 10, cities: 2, capitals: 1 } }, economy, 'facile').total, 9.1);
  assert.equal(dailyIncome({ goods: { steel: 100 }, territory: { provinces: 10, cities: 2, capitals: 1 } }, economy, 'reale').total, 6.3);
  assert.throws(() => dailyIncome({}, economy, 'x'));
});

test('tesoreria: la spesa non porta mai il saldo sotto zero', () => {
  assert.deepEqual(spend(100, 60), { ok: true, balance: 40 });
  assert.deepEqual(spend(40, 60), { ok: false, balance: 40, missing: 20 });
  assert.throws(() => spend(10, -1));
});

test('entrata: deterministica (stesso input, stesso risultato)', () => {
  const a = dailyIncome({ goods: { steel: 55.5, coal: 1000 }, territory: { provinces: 3 } }, economy, 'media');
  const b = dailyIncome({ goods: { coal: 1000, steel: 55.5 }, territory: { provinces: 3 } }, economy, 'media');
  assert.deepEqual(a, b);
});

test('difficoltà: la predefinita è Media', () => {
  assert.equal(difficulty(economy).id, 'media');
});
