// Formazione dei comandi creati dal giocatore: uomini dal pool riservati, tempi 20/45 giorni, registrazione nel registro, ORBAT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUnitRegistry, unitOf } from '../src/rules/unitRegistry.js';
import { validateCommandTemplates, startFormation, completeFormations, availableManpower, reservedManpower, commandName } from '../src/rules/commandFormation.js';
import { createOrbatState } from '../src/rules/orbat.js';
import { validateUnitRegistry } from '../src/rules/unitRegistry.js';

const template = JSON.parse(readFileSync(new URL('../data/units/command_templates.json', import.meta.url), 'utf8'));
const catalog = new Map([
  ['C1', { id: 'C1', name: 'I Corpo', nation: 'GER', echelon: 'command', category: 'command', commandLevel: 'corps', startYear: 1900, endYear: null }],
  ['A1', { id: 'A1', name: 'Prima Armata', nation: 'GER', echelon: 'command', category: 'command', commandLevel: 'army', startYear: 1900, endYear: null }],
]);
const base = () => ({ date: '1936-01-01', player: 'GER', orbat: createOrbatState(), unitRegistry: createUnitRegistry() });

test('template: valori dei comandi validi (ipotesi approvate)', () => {
  assert.deepEqual(validateCommandTemplates(template), []);
  assert.equal(template.levels.corps.formationDays, 20);
  assert.equal(template.levels.army.formationDays, 45);
  assert.equal(template.levels.corps.formationManpower, 300);
  assert.equal(template.levels.army.formationManpower, 600);
});

test('avvio: riserva gli uomini e fissa la fine dopo i giorni del livello', () => {
  const r = startFormation(base(), { nation: 'GER', level: 'corps', date: '1936-01-01', template, pool: 1000, catalog });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.formation.end, '1936-01-21', '20 giorni');
  assert.equal(reservedManpower(r.state, 'GER'), 300);
  assert.equal(availableManpower(r.state, 'GER', 1000), 700, 'il pool sottrae gli uomini in formazione');
});

test('avvio: uomini insufficienti, superiore sbagliato o livello sconosciuto sono rifiutati', () => {
  assert.equal(startFormation(base(), { nation: 'GER', level: 'army', date: '1936-01-01', template, pool: 500, catalog }).reason, 'uomini');
  assert.equal(startFormation(base(), { nation: 'GER', level: 'corps', parentId: 'C1', date: '1936-01-01', template, pool: 1000, catalog }).reason, 'superiore', 'un corpo non va sotto un corpo');
  assert.equal(startFormation(base(), { nation: 'FRA', level: 'corps', parentId: 'A1', date: '1936-01-01', template, pool: 1000, catalog }).reason, 'superiore', 'nazione diversa');
  assert.equal(startFormation(base(), { nation: 'GER', level: 'theater', date: '1936-01-01', template, pool: 1000, catalog }).reason, 'livello');
});

test('completamento: alla data il comando entra nel registro con il suo nome e nell\'ORBAT sotto l\'armata', () => {
  const s0 = base();
  const f = startFormation(s0, { nation: 'GER', level: 'corps', parentId: 'A1', date: '1936-01-01', template, pool: 1000, catalog });
  const early = completeFormations(f.state, { date: '1936-01-20', units: null, catalog });
  assert.equal(Object.keys(early.unitRegistry.units).length, 0, 'prima della fine: nulla');
  const done = completeFormations(f.state, { date: '1936-01-21', units: null, catalog });
  const id = Object.keys(done.unitRegistry.units)[0];
  const unit = unitOf(done, id, catalog);
  assert.equal(unit.name, commandName('corps', 'GER', 1));
  assert.equal(unit.commandLevel, 'corps');
  assert.equal(done.orbat.links[id].parent, 'A1', 'inquadrato sotto l\'armata scelta');
  assert.deepEqual(done.unitRegistry.forming, [], 'la formazione esce dalla lista');
  assert.deepEqual(validateUnitRegistry(done.unitRegistry), []);
});

test('armata: nessun superiore; due formazioni hanno id diversi e nomi progressivi', () => {
  let s = base();
  const a = startFormation(s, { nation: 'GER', level: 'army', date: '1936-01-01', template, pool: 2000, catalog }); s = a.state;
  const b = startFormation(s, { nation: 'GER', level: 'army', date: '1936-01-02', template, pool: 2000, catalog }); s = b.state;
  assert.notEqual(a.formation.id, b.formation.id);
  s = completeFormations(s, { date: '1937-03-01', units: null, catalog });
  const names = Object.values(s.unitRegistry.units).map((u) => u.name).sort();
  assert.deepEqual(names, [commandName('army', 'GER', 1), commandName('army', 'GER', 2)].sort());
});

test('pool: gli uomini in formazione non risultano disponibili per altre formazioni', () => {
  const s = startFormation(base(), { nation: 'GER', level: 'corps', date: '1936-01-01', template, pool: 350, catalog }).state;
  const second = startFormation(s, { nation: 'GER', level: 'corps', date: '1936-01-02', template, pool: 350, catalog });
  assert.equal(second.reason, 'uomini', 'restano 50 uomini: non bastano');
});
