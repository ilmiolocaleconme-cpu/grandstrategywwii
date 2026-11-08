// Stato dei nodi dell'albero di comando e spunte degli ordini («Seleziona tutte»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nodeStats, statusDot, nodeCaption, checkAll, checkNone, toggleCheck, keepAvailable } from '../src/rules/commandStatus.js';

const cfg = JSON.parse(readFileSync(new URL('../data/units/condition_config.json', import.meta.url), 'utf8'));
const forces = { divisions: {
  D1: { items: { 'manpower.war': { planned: 10000, effective: 8000 } } },
  D2: { items: { 'manpower.war': { planned: 4400, effective: 4000 } } },
  D3: { items: {} },
} };
const conditions = { schema: 'conditions-v1', byUnit: {
  D1: { experience: 45, morale: 60, readiness: 80, policy: 'normal', isNew: false },
  D2: { experience: 45, morale: 80, readiness: 60, policy: 'normal', isNew: false },
} };

test('nodeStats: uomini sommati, prontezza e morale medi', () => {
  const s = nodeStats({ divisionIds: ['D1', 'D2'], forces, conditions, conditionConfig: cfg, nation: 'ITA' });
  assert.equal(s.divisions, 2);
  assert.deepEqual(s.men, { effective: 12000, planned: 14400, ratio: 12000 / 14400 });
  assert.equal(s.readiness, 70);
  assert.equal(s.morale, 70);
});

test('nodeStats: un id ripetuto conta una volta; senza dato uomini è null, non zero', () => {
  const s = nodeStats({ divisionIds: ['D3', 'D3'], forces, conditions, conditionConfig: cfg, nation: 'ITA' });
  assert.equal(s.divisions, 1);
  assert.equal(s.men, null);
});

test('nodeStats: nessuna divisione → null ovunque', () => {
  const s = nodeStats({ divisionIds: [], forces, conditions, conditionConfig: cfg, nation: 'ITA' });
  assert.equal(s.divisions, 0);
  assert.equal(s.men, null);
  assert.equal(s.readiness, null);
  assert.equal(s.morale, null);
});

test('statusDot: dalla sola distanza dal comando', () => {
  const far = new Set(['D2', 'D3']);
  assert.equal(statusDot([], far), null);
  assert.equal(statusDot(['D1'], far), 'g');
  assert.equal(statusDot(['D1', 'D2'], far), 'y');
  assert.equal(statusDot(['D2', 'D3'], far), 'r');
  assert.equal(statusDot(['D1'], undefined), 'g');
});

test('nodeCaption', () => {
  assert.equal(nodeCaption({ divisions: 0, readiness: null }, null), 'nessuna divisione');
  assert.equal(nodeCaption({ divisions: 1, readiness: 74 }, 'g'), '1 divisione · 74%');
  assert.equal(nodeCaption({ divisions: 3, readiness: 74 }, 'y'), '3 divisioni · 74%');
  assert.equal(nodeCaption({ divisions: 2, readiness: 50 }, 'r'), '2 divisioni · fuori comando');
  assert.equal(nodeCaption({ divisions: 2, readiness: null }, 'g'), '2 divisioni');
});

test('spunte: tutte, nessuna, togli una, mantieni solo le disponibili', () => {
  const all = checkAll(['D1', 'D2', 'D3']);
  assert.equal(all.size, 3);
  const less = toggleCheck(all, 'D2');
  assert.deepEqual([...less], ['D1', 'D3']);
  assert.equal(all.size, 3, 'non modifica l\'insieme di partenza');
  assert.deepEqual([...toggleCheck(less, 'D2')].sort(), ['D1', 'D2', 'D3']);
  assert.equal(checkNone().size, 0);
  assert.deepEqual([...keepAvailable(all, ['D1', 'D9'])], ['D1']);
});
