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

test('entrata: valore aggiunto, la catena non conta due volte; elettricità senza entrata', () => {
  const terr = { provinces: 10, cities: 2, capitals: 1 }; // 4 ECV
  // un'acciaieria: produce 100 t di acciaio, consuma 160 t di ferro e 80 t di carbone
  const inc = dailyIncome({ goods: { steel: 100, electricity: 500 }, inputs: { iron_ore: 160, coal: 80 }, territory: terr }, economy, 'media');
  assert.equal(inc.goods, 3);
  assert.equal(inc.inputs, 1.36);
  assert.equal(inc.valueAdded, 1.64);
  assert.equal(inc.territory, 4);
  assert.equal(inc.total, 5.64);
  assert.deepEqual(inc.byGood, { steel: 3 });
  assert.equal(dailyIncome({ goods: { steel: 100 }, inputs: { iron_ore: 160, coal: 80 }, territory: terr }, economy, 'facile').total, 7.332);
  assert.equal(dailyIncome({ goods: { steel: 100 }, inputs: { iron_ore: 160, coal: 80 }, territory: terr }, economy, 'reale').total, 5.076);
  assert.throws(() => dailyIncome({}, economy, 'x'));
});

test('entrata: estrarre ferro e farne acciaio vale quanto il valore aggiunto, non la somma lorda', () => {
  const estrazione = dailyIncome({ goods: { iron_ore: 160, coal: 80 } }, economy, 'media').total; // 1.36
  const catena = dailyIncome({ goods: { iron_ore: 160, coal: 80, steel: 100 }, inputs: { iron_ore: 160, coal: 80 } }, economy, 'media').total;
  assert.equal(estrazione, 1.36);
  assert.equal(catena, 3); // 1.36 estratti + 1.64 dell'acciaieria = valore dell'acciaio, non 4.36
});

test('entrata: la centrale brucia carbone senza ricavo (costo), l\'entrata non scende sotto zero', () => {
  const inc = dailyIncome({ goods: { electricity: 120 }, inputs: { coal: 60 } }, economy, 'media');
  assert.equal(inc.valueAdded, -0.3);
  assert.equal(inc.total, 0);
});

test('economia: ogni ricetta ha valore aggiunto positivo e il validatore rifiuta il contrario', () => {
  const bad = structuredClone(economy);
  bad.prices.steel = 0.01;
  assert.match(validateEconomy(bad, { resources, recipes }).join('|'), /REC-STEEL-001 ha valore aggiunto non positivo/);
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
