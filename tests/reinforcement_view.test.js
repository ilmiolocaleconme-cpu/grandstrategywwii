// Vista dei rinforzi di una divisione (scheda unità, sezione «Rinforzi»): solo lettura dello stato esistente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reinforcementNeeds, reinforcementGroups, needLine } from '../src/rules/reinforcementView.js';
import { sheetSections } from '../src/rules/unitSheet.js';

const forces = {
  divisions: {
    D1: { reinforce: true, items: {
      'manpower.war': { planned: 1000, effective: 800 }, horses: { planned: 100, effective: 100 },
      'equipment.ART-FRA-HOW155C': { planned: 12, effective: 4 }, 'equipment.carri': { planned: 10, effective: 10 }, 'equipment.ZZZ-NUOVO': { planned: 3, effective: 3 },
      'equipment.radio': { planned: 8, effective: 2 }, other: { planned: 5, effective: 0 },
    } },
    D2: { reinforce: false, cadre: true, items: { 'manpower.war': { planned: 50, effective: 50 } } },
  },
  transfers: [
    { id: 't1', divisionId: 'D1', item: 'manpower.war', qty: 150, from: 'pool', sentOn: '1936-01-01', arrivesOn: '1936-01-09' },
    { id: 't2', divisionId: 'D1', item: 'manpower.war', qty: 20, from: 'pool', sentOn: '1936-01-02', arrivesOn: '1936-01-07' },
    { id: 't3', divisionId: 'D1', item: 'equipment.ART-FRA-HOW155C', qty: 8, from: 'stock', sentOn: '1936-01-01', arrivesOn: '1936-01-12' },
    { id: 't4', divisionId: 'D2', item: 'manpower.war', qty: 5, from: 'pool', sentOn: '1936-01-01', arrivesOn: '1936-01-03' },
  ],
};
const stocks = { 'equipment.ART-FRA-HOW155C': 0, 'equipment.radio': 3.9, horses: 12 };

test('senza istanza di forza: null', () => {
  assert.equal(reinforcementNeeds({ forces, stocks, divisionId: 'X' }), null);
  assert.equal(reinforcementNeeds({ forces: null, stocks, divisionId: 'D1' }), null);
});

test('righe: solo ciò che manca o è in viaggio; carenza netta del viaggio, primo arrivo, scorta', () => {
  const n = reinforcementNeeds({ forces, stocks, divisionId: 'D1' });
  assert.equal(n.enabled, true); assert.equal(n.cadre, false);
  assert.deepEqual(n.rows.map((r) => r.item), ['manpower.war', 'equipment.radio', 'equipment.ART-FRA-HOW155C']);
  const men = n.rows[0];
  assert.deepEqual([men.kind, men.inTransit, men.deficit, men.arrivesOn, men.stock], ['uomini', 170, 30, '1936-01-07', null]);
  const how = n.rows.find((r) => r.code === 'ART-FRA-HOW155C');
  assert.deepEqual([how.deficit, how.inTransit, how.stock, how.arrivesOn], [0, 8, 0, '1936-01-12']);
  assert.equal(n.rows.find((r) => r.code === 'radio').stock, 3, 'la scorta è intera');
});

test('voci complete e voci non di dotazione non compaiono; scorta assente = 0', () => {
  const n = reinforcementNeeds({ forces, stocks: undefined, divisionId: 'D1' });
  assert.ok(!n.rows.some((r) => ['horses', 'equipment.carri', 'equipment.ZZZ-NUOVO', 'other'].includes(r.item)));
  assert.equal(n.rows.find((r) => r.code === 'radio').stock, 0);
});

test('rinforzi sospesi e quadro si leggono dalla divisione', () => {
  const n = reinforcementNeeds({ forces, stocks, divisionId: 'D2' });
  assert.equal(n.enabled, false); assert.equal(n.cadre, true);
  assert.equal(n.rows.length, 1); assert.equal(n.rows[0].inTransit, 5); assert.equal(n.rows[0].deficit, 0);
});

test('gruppi: uomini, cavalli, poi mezzi per categoria; voce ignota in «Non classificati»', () => {
  const rows = [
    { item: 'equipment.ZZZ', code: 'ZZZ', kind: 'mezzi', deficit: 1, inTransit: 0, stock: 0 },
    { item: 'equipment.radio', code: 'radio', kind: 'mezzi', deficit: 2, inTransit: 0, stock: 0 },
    { item: 'horses', code: 'horses', kind: 'cavalli', deficit: 3, inTransit: 0, stock: 0 },
    { item: 'manpower.war', code: 'manpower.war', kind: 'uomini', deficit: 4, inTransit: 0, stock: null },
  ];
  const g = reinforcementGroups(rows);
  assert.deepEqual(g.map((x) => x.label), ['Uomini', 'Cavalli', 'Trasmissioni', 'Non classificati']);
  assert.deepEqual(reinforcementGroups([]), []);
});

test('needLine', () => {
  assert.equal(needLine({ deficit: 12, inTransit: 5, arrivesOn: '1936-01-09', stock: 0 }), 'mancano 12 · in viaggio 5 (arrivo 1936-01-09) · in scorta 0');
  assert.equal(needLine({ deficit: 0, inTransit: 8, arrivesOn: null, stock: null }), 'in viaggio 8');
});

test('la sezione «Rinforzi» c\'è solo con il dato', () => {
  const av = (info) => sheetSections(info).find((s) => s.id === 'rinforzi').available;
  assert.equal(av({ reinforcements: { enabled: true, cadre: false, rows: [] } }), true);
  assert.equal(av({ reinforcements: null }), false);
});
