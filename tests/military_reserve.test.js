// Riserva militare: divisioni intere, riserva di 30 giorni, copertura dell'attacco continuo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wholeDivisionsSupported, militaryReserve, activeDivisions, RESERVE_DAYS } from '../src/rules/militaryReserve.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const ammo = json('military/ammo_consumption.json');
const units = json('units/units.json');
const list = Array.isArray(units) ? units : units.units;

test('divisioni intere: una capacità frazionaria non conta la divisione a metà', () => {
  assert.deepEqual(wholeDivisionsSupported(100, [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]), { count: 12, leftover: 4 });
  assert.equal(wholeDivisionsSupported(49.8 * 8, Array(50).fill(8)).count, 49);
  assert.equal(wholeDivisionsSupported(0, [8]).count, 0);
  // le divisioni più economiche per prime
  assert.equal(wholeDivisionsSupported(10, [10, 5, 5]).count, 2);
});

test('riserva: consumo di attacco × 30 giorni, somma delle sole divisioni attive al 1/1/1936', () => {
  const div = activeDivisions(list, ammo);
  assert.ok(div.length > 0);
  assert.equal(RESERVE_DAYS, 30);
  const r = militaryReserve({ divisions: div, factories: {} });
  for (const [n, row] of Object.entries(r)) {
    const sum = div.filter((d) => d.nation === n).reduce((s, d) => s + d.daily, 0);
    assert.ok(Math.abs(row.reserve - sum * 30) < 0.01, n);
    assert.equal(row.supported, 0, 'senza fabbriche nessuna divisione è sostenuta');
  }
});

test('categoria di divisione senza consumo: errore, mai zero silenzioso', () => {
  assert.throws(() => activeDivisions([{ id: 'X', nation: 'ITA', echelon: 'division', category: 'marziano', startYear: 1900, endYear: null }], ammo), /senza consumo/);
});

test('copertura: due fabbriche (200 t/giorno) sostengono 25 fanterie in attacco, non 25,x', () => {
  const divs = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, nation: 'XX', daily: 8 }));
  const r = militaryReserve({ divisions: divs, factories: { XX: 2 } });
  assert.equal(r.XX.supported, 25);
  assert.equal(r.XX.covered, false);
  assert.equal(r.XX.reserve, 30 * 8 * 30);
});

test('scorte iniziali: la riserva di munizioni è nel file (30 giorni, solo le divisioni attive al 1936)', () => {
  const stocks = json('industry/initial_stocks.json').stocks;
  const div = activeDivisions(list, ammo);
  const expected = militaryReserve({ divisions: div, factories: {} });
  for (const [n, row] of Object.entries(expected)) assert.equal(stocks[n]?.munitions, row.reserve, n);
  assert.equal(stocks.DEU.munitions, 8100);
});
