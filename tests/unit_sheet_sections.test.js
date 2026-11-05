// Scheda unità, fase 2: affiliazione, simbolo NATO semplificato, sezioni (sola lettura dei dati del motore).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affiliationOf, natoSpec, echelonMarks, sheetSections, NATO_GLYPH } from '../src/rules/unitSheet.js';

const alliedState = { player: 'ITA', diplomacy: { alliances: { 'GER|ITA': { since: '1936-01-01' } } }, war: { pairs: {} } };
const warState = { player: 'ITA', diplomacy: { alliances: {} }, war: { pairs: { 'FRA|ITA': { since: '1936-01-01' } } } };

test('affiliazione: giocatore e alleati amici, nazioni in guerra nemiche, le altre neutrali', () => {
  assert.equal(affiliationOf(alliedState, 'ITA'), 'amico');
  assert.equal(affiliationOf(alliedState, 'GER'), 'amico', 'alleato');
  assert.equal(affiliationOf(alliedState, 'FRA'), 'neutrale');
  assert.equal(affiliationOf(warState, 'FRA'), 'nemico');
  assert.equal(affiliationOf(warState, 'GBR'), 'neutrale');
  assert.equal(affiliationOf({}, 'ITA'), 'neutrale', 'senza giocatore: neutrale');
  assert.equal(affiliationOf(alliedState, null), 'neutrale');
});

test('simbolo: cornice diversa per affiliazione (forma, non solo colore); categoria sconosciuta senza glifo', () => {
  const div = { echelon: 'division', category: 'infantry' };
  assert.equal(natoSpec(div, 'amico').frame, 'rect');
  assert.equal(natoSpec(div, 'nemico').frame, 'diamond');
  assert.equal(natoSpec(div, 'neutrale').frame, 'square');
  assert.equal(natoSpec(div, 'boh').affiliation, 'neutrale', 'affiliazione ignota: neutrale');
  assert.equal(natoSpec({ echelon: 'division', category: 'marziano' }, 'amico').glyph, 'none', 'nessun glifo inventato');
});

test('glifi per categoria: fanteria X, corazzata ovale, cavalleria barra; lo stesso dato per ogni unità della categoria', () => {
  assert.equal(NATO_GLYPH.infantry, 'x');
  assert.equal(NATO_GLYPH.armored, 'oval');
  assert.equal(NATO_GLYPH.cavalry, 'slash');
  assert.equal(natoSpec({ echelon: 'division', category: 'armored' }, 'amico').glyph, 'oval');
});

test('scaglione: divisione 2, brigata 1, corpo 3, armata 4, altro 0', () => {
  assert.equal(echelonMarks({ echelon: 'division' }), 2);
  assert.equal(echelonMarks({ echelon: 'brigade' }), 1);
  assert.equal(echelonMarks({ echelon: 'command', commandLevel: 'corps' }), 3);
  assert.equal(echelonMarks({ echelon: 'command', commandLevel: 'army' }), 4);
  assert.equal(echelonMarks({ echelon: 'command', commandLevel: 'theater' }), 0);
});

test('sezioni: panoramica e comando sempre presenti; logistica, sanità e storia mai disponibili (dato non ancora modellato)', () => {
  const full = { strength: { manpower: { effective: 10, planned: 12, ratio: 0.83 } }, composition: { rows: [] }, equipment: [{ item: 'fucili' }], condition: { morale: 50 } };
  const s = sheetSections(full);
  const av = (id) => s.find((x) => x.id === id).available;
  assert.equal(av('panoramica'), true);
  assert.equal(av('comando'), true);
  assert.equal(av('operazioni'), true);
  assert.equal(av('organico'), true);
  assert.equal(av('composizione'), true);
  assert.equal(av('equipaggiamento'), true);
  assert.equal(av('condizione'), true);
  assert.equal(av('logistica'), false);
  assert.equal(av('sanita'), false);
  assert.equal(av('storia'), false);
});

test('sezioni senza dato: unità senza istanza di forza o senza template non mostrano valori inventati', () => {
  const bare = { strength: null, composition: null, equipment: [], condition: null };
  const s = sheetSections(bare);
  for (const id of ['organico', 'composizione', 'equipaggiamento', 'condizione']) assert.equal(s.find((x) => x.id === id).available, false, id);
  assert.equal(s.find((x) => x.id === 'panoramica').available, true);
});
