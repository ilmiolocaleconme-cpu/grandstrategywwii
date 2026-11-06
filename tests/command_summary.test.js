// Riepilogo in alto dello stato maggiore: medie reali sulle divisioni del giocatore, null senza divisioni.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandSummary } from '../src/rules/commandSummary.js';

const cfg = JSON.parse(readFileSync(new URL('../data/units/condition_config.json', import.meta.url), 'utf8'));
const unitsById = new Map([
  ['D1', { id: 'D1', nation: 'ITA' }], ['D2', { id: 'D2', nation: 'ITA' }], ['D3', { id: 'D3', nation: 'FRA' }],
]);
const state = {
  nations: { ITA: { balance: 1406 } },
  forces: { divisions: { D1: {}, D2: {}, D3: {} } },
  conditions: { schema: 'conditions-v1', byUnit: { D1: { experience: 45, morale: 60, readiness: 80, policy: 'normal', isNew: false }, D2: { experience: 45, morale: 80, readiness: 60, policy: 'normal', isNew: false } } },
};

test('riepilogo: cassa dalla nazione, uomini disponibili, medie di prontezza e morale sulle divisioni del giocatore', () => {
  const s = commandSummary(state, { nation: 'ITA', unitsById, conditionConfig: cfg, availableMen: 412000, alerts: 3 });
  assert.equal(s.ecv, 1406);
  assert.equal(s.men, 412000);
  assert.equal(s.divisions, 2, 'la divisione francese non conta');
  assert.equal(s.readiness, 70);
  assert.equal(s.morale, 70);
  assert.equal(s.alerts, 3);
});

test('riepilogo: senza divisioni prontezza e morale sono null, non zero', () => {
  const s = commandSummary({ nations: {}, forces: { divisions: {} } }, { nation: 'ITA', unitsById, conditionConfig: cfg });
  assert.equal(s.readiness, null);
  assert.equal(s.morale, null);
  assert.equal(s.ecv, null);
});
