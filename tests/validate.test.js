import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from '../src/data/validate.js';
import { loadCatalog } from '../scripts/validate-data.js';

// Fixture sintetiche SOLO per i test: non sono dati geografici storici.
const base = () => ({
  nations: [{ id: 'AAA', name: 'Alfa', capital: 'Alfa City' }],
  resources: [{ id: 'coal', name: 'Carbone' }],
  rivers: [
    { id: 'r_main', name: 'Fiume A', class: 'main', navigable: true, approximate: false },
    {
      id: 'r_trib',
      name: 'Fiume B',
      class: 'tributary',
      flowsInto: 'r_main',
      navigable: false,
      approximate: false,
    },
  ],
  crossings: [
    {
      id: 'c1',
      type: 'bridge_road',
      riverId: 'r_main',
      state: 'intact',
      controller: 'AAA',
      approximate: false,
    },
  ],
});

test('i dati reali in data/ sono validi', async () => {
  const result = validateCatalog(await loadCatalog());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('un catalogo coerente è valido', () => {
  assert.equal(validateCatalog(base()).ok, true);
});

test('rileva id duplicati', () => {
  const c = base();
  c.resources.push({ id: 'coal', name: 'Carbone bis' });
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /id duplicato "coal"/);
});

test('rileva campi obbligatori mancanti', () => {
  const c = base();
  delete c.nations[0].capital;
  assert.match(validateCatalog(c).errors.join('\n'), /"capital"/);
});

test('un attraversamento deve riferire un fiume esistente', () => {
  const c = base();
  c.crossings[0].riverId = 'inesistente';
  assert.match(validateCatalog(c).errors.join('\n'), /fiume inesistente/);
});

test('il controllore di un attraversamento deve essere una nazione esistente', () => {
  const c = base();
  c.crossings[0].controller = 'ZZZ';
  assert.match(validateCatalog(c).errors.join('\n'), /controllore inesistente/);
});

test('un attraversamento senza controllore (null) è ammesso', () => {
  const c = base();
  c.crossings[0].controller = null;
  assert.equal(validateCatalog(c).ok, true);
});

test('rileva stato e tipo di attraversamento non validi', () => {
  const c = base();
  c.crossings[0].state = 'esploso';
  c.crossings[0].type = 'teleferica';
  const text = validateCatalog(c).errors.join('\n');
  assert.match(text, /stato non valido/);
  assert.match(text, /tipo non valido/);
});

test("un affluente deve confluire in un fiume esistente", () => {
  const c = base();
  c.rivers[1].flowsInto = 'nessuno';
  assert.match(validateCatalog(c).errors.join('\n'), /non esiste/);
});

test('un affluente senza flowsInto è un errore', () => {
  const c = base();
  delete c.rivers[1].flowsInto;
  assert.match(validateCatalog(c).errors.join('\n'), /non indica flowsInto/);
});

test('rileva cicli di confluenze', () => {
  const c = base();
  c.rivers[0].flowsInto = 'r_trib';
  assert.match(validateCatalog(c).errors.join('\n'), /ciclo/);
});

test('i fiumi approssimati generano un avviso, non un errore', () => {
  const c = base();
  c.rivers[0].approximate = true;
  const r = validateCatalog(c);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});

test('input nullo non va in crash', () => {
  assert.equal(validateCatalog(null).ok, false);
});
