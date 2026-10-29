import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitInfo, NOT_MODELED } from '../src/rules/unitInfo.js';

const units = [
  { id: 'C1', name: 'I. Armeekorps', nation: 'DEU', echelon: 'command', category: 'command', commandLevel: 'corps' },
  { id: 'D1', name: '1. Infanterie-Division', nation: 'DEU', echelon: 'division', category: 'infantry' },
  { id: 'D2', name: '2. Infanterie-Division', nation: 'DEU', echelon: 'division', category: 'infantry' },
];
const unitsById = new Map(units.map((u) => [u.id, u]));
const officersById = new Map([['O1', { id: 'O1', name: 'Wilhelm Ritter von Leeb', rank: 'General' }]]);
const initial = new Map([['C1', 'P_A'], ['D1', 'P_A']]);
const ctx = { unitsById, officersById, initial, provinceName: (x) => `nome ${x}` };
const state = {
  commanders: { assignments: { C1: { officerId: 'O1', source: 'auto', since: '1936-01-01' } } },
  orbat: { links: { D1: { parent: 'C1' }, D2: { parent: 'C1' } } },
  forces: { divisions: { D1: { templateId: 'T', items: { 'manpower.war': { planned: 1000, effective: 300 }, 'equipment.carri': { planned: 100, effective: 20 }, 'equipment.cannoni': { planned: 50, effective: 40 } }, cadre: true, reinforce: false } } },
  movement: { positions: {}, orders: { D1: { path: ['P_A', 'P_B', 'P_C'], leg: 0, daysLeft: 3, totalDays: 8, category: 'infantry' } } },
};

test('scheda del corpo: comandante assegnato, forze assegnate (figli), posizione ferma', () => {
  const i = unitInfo(state, units[0], ctx);
  assert.deepEqual([i.commander.status, i.commander.name, i.commander.source], ['assegnato', 'Wilhelm Ritter von Leeb', 'auto']);
  assert.deepEqual(i.children.map((c) => c.id), ['D1', 'D2']);
  assert.equal(i.movement.province, 'P_A');
  assert.equal(i.movement.order, null);
  assert.equal(i.strength, null);
});

test('scheda della divisione: quadro al 30%, rinforzi sospesi, inquadrata nel corpo, ordine di marcia con giorni', () => {
  const i = unitInfo(state, units[1], ctx);
  assert.deepEqual(i.commander, { status: 'non_gestito', reason: 'i comandanti sono modellati solo per corpi e armate' });
  assert.deepEqual(i.chain.map((c) => c.id), ['C1']);
  assert.equal(i.strength.cadre, true);
  assert.equal(i.strength.reinforce, false);
  assert.equal(i.strength.manpower.ratio, 0.3);
  assert.deepEqual(i.equipment.map((e) => [e.item, e.ratio]), [['carri', 0.2], ['cannoni', 0.8]], 'dotazione in ordine di carenza');
  assert.deepEqual([i.movement.order.toName, i.movement.order.nextName, i.movement.order.daysLeft, i.movement.order.totalDays], ['nome P_C', 'nome P_B', 3, 8]);
});

test('comando senza ufficiale: vacante; senza dotazione: strength nulla; fatica e morale dichiarati non modellati', () => {
  const i = unitInfo({ ...state, commanders: { assignments: {} } }, units[0], ctx);
  assert.equal(i.commander.status, 'vacante');
  assert.equal(unitInfo(state, units[2], ctx).strength, null);
  assert.ok(NOT_MODELED.some((n) => n.id === 'rifornimento') && NOT_MODELED.some((n) => n.id === 'sanità'));
  assert.ok(!NOT_MODELED.some((n) => ['morale', 'esperienza', 'stato operativo'].includes(n.id)), 'ora modellati in divisionCondition.js');
  assert.ok(!NOT_MODELED.some((n) => n.id === 'fatica'), 'la fatica non è in nessun documento guida');
  assert.ok(NOT_MODELED.every((n) => n.rule.length > 10));
  assert.deepEqual(i.notModeled, NOT_MODELED);
});
