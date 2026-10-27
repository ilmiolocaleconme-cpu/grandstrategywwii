import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canStartBuild } from '../src/rules/construction.js';
import { mineCost } from '../src/data/economy.js';

const economy = JSON.parse(readFileSync(new URL('../data/economy/economy.json', import.meta.url), 'utf8'));
const have = { balance: 200, steel: 500, workers: 600, powerSurplusMw: 20, techs: new Set(['IND-001']) };

test('costruzione: parte se ci sono denaro, acciaio, manodopera, energia e tecnologia', () => {
  const r = canStartBuild({ cost: { ecv: 120, steel: 100, workers: 500, energyMw: 12 }, requires: 'IND-001' }, have);
  assert.deepEqual(r, { ok: true, missing: [] });
});

test('costruzione: elenca tutti i vincoli mancanti, senza fermarsi al primo', () => {
  const r = canStartBuild({ cost: { ecv: 300, steel: 600, workers: 700, energyMw: 30 }, requires: 'RA-038' }, have);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.what), ['ecv', 'steel', 'workers', 'energyMw', 'tech']);
  assert.deepEqual(r.missing[0], { what: 'ecv', need: 300, have: 200 });
});

test('costruzione: un vincolo a zero o assente non blocca; le tecnologie accettano anche un array', () => {
  assert.equal(canStartBuild({ cost: { ecv: 10 } }, { balance: 10 }).ok, true);
  assert.equal(canStartBuild({ cost: { ecv: 1 }, requires: 'X' }, { balance: 5, techs: ['X'] }).ok, true);
  assert.equal(canStartBuild({ cost: { ecv: 1 }, requires: 'X' }, { balance: 5 }).ok, false);
});

test('costruzione: il costo di una miniera dipende dalla difficoltà', () => {
  const facile = canStartBuild({ cost: mineCost(economy, 1, 'facile') }, { balance: 35, steel: 80, workers: 200 });
  assert.equal(facile.ok, true); // 30 ECV, 75 t, 200 lavoratori
  const reale = canStartBuild({ cost: mineCost(economy, 1, 'reale') }, { balance: 35, steel: 80, workers: 200 });
  assert.deepEqual(reale.missing.map((m) => m.what), ['ecv', 'steel']);
});
