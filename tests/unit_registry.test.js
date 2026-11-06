// Registro unità create in partita (schema 8): id stabili X#####, ricerca unica catalogo→registro, migrazione 7→8, validazione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnitRegistry, registerUnit, unitOf, unitsView, validateUnitRegistry, registryId } from '../src/rules/unitRegistry.js';
import { migrateV7toV8, validateUnitRegistryShape } from '../src/game/unitRegistryState.js';

const catalog = new Map([['U00001', { id: 'U00001', name: 'Catalogo', nation: 'GER' }]]);

test('id: prefisso X e contatore a 5 cifre, mai riusato', () => {
  assert.equal(registryId(1), 'X00001');
  let reg = createUnitRegistry();
  const a = registerUnit(reg, { name: 'Corpo A', nation: 'GER' }); reg = a.registry;
  const b = registerUnit(reg, { name: 'Corpo B', nation: 'GER' }); reg = b.registry;
  assert.equal(a.id, 'X00001');
  assert.equal(b.id, 'X00002');
  assert.equal(reg.next, 3);
  assert.equal(reg.units.X00001.id, 'X00001', 'id interno coerente');
});

test('registrare non modifica il registro ricevuto', () => {
  const reg = createUnitRegistry();
  registerUnit(reg, { name: 'X', nation: 'GER' });
  assert.deepEqual(reg, createUnitRegistry());
});

test('ricerca: il catalogo ha la precedenza, poi il registro della partita', () => {
  const r = registerUnit(createUnitRegistry(), { name: 'Nuovo', nation: 'GER' });
  const state = { unitRegistry: r.registry };
  assert.equal(unitOf(state, 'U00001', catalog).name, 'Catalogo');
  assert.equal(unitOf(state, r.id, catalog).name, 'Nuovo');
  assert.equal(unitOf(state, 'X99999', catalog), null);
  assert.equal(unitOf(null, 'U00001', catalog).name, 'Catalogo', 'senza stato resta il catalogo');
});

test('vista unificata: contiene catalogo e registro; senza registro è il catalogo stesso', () => {
  const r = registerUnit(createUnitRegistry(), { name: 'Nuovo', nation: 'GER' });
  const view = unitsView({ unitRegistry: r.registry }, catalog);
  assert.equal(view.get(r.id).name, 'Nuovo');
  assert.equal(view.get('U00001').name, 'Catalogo');
  assert.equal(unitsView({}, catalog), catalog);
});

test('migrazione 7→8: il registro nasce vuoto e lo stato resta com\'è', () => {
  const v7 = { schema: 7, date: '1936-01-01', player: 'ITA' };
  const v8 = migrateV7toV8(v7);
  assert.equal(v8.schema, 8);
  assert.deepEqual(v8.unitRegistry, createUnitRegistry());
  assert.equal(v8.player, 'ITA');
  assert.deepEqual(validateUnitRegistryShape(v8), []);
});

test('validazione: id non validi, contatore indietro e id interni diversi sono errori', () => {
  const r = registerUnit(createUnitRegistry(), { name: 'A', nation: 'GER' }).registry;
  assert.deepEqual(validateUnitRegistry(r), []);
  assert.ok(validateUnitRegistry({ ...r, next: 1 }).some((e) => /contatore/.test(e)));
  assert.ok(validateUnitRegistry({ ...r, units: { Y00001: { id: 'Y00001' } } }).some((e) => /non valido/.test(e)));
  assert.ok(validateUnitRegistry({ ...r, units: { X00001: { id: 'X00009' } } }).some((e) => /id interno/.test(e)));
  assert.deepEqual(validateUnitRegistry(undefined), [], 'assente: nessun errore');
});

import { unitsList } from '../src/rules/unitRegistry.js';

test('liste per i sistemi: l\'array del catalogo più le unità create; senza registro, lo stesso array', () => {
  const arr = [{ id: 'U00001' }];
  const r = registerUnit(createUnitRegistry(), { name: 'Nuovo', nation: 'GER' });
  const list = unitsList({ unitRegistry: r.registry }, arr);
  assert.equal(list.length, 2);
  assert.equal(list[1].id, r.id);
  assert.equal(unitsList({}, arr), arr);
  assert.equal(unitsList({ unitRegistry: r.registry }, arr), list, 'ricostruita solo se cambia il registro');
});
