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

// --- Dataset politico (fixture sintetiche, non dati storici) ---
const withPolitical = () => ({
  ...base(),
  political: [
    { id: 'AAA', name: 'Alfa', type: 'country', owner: 'AAA', controller: 'AAA', status: 'independent', playable: true },
    { id: 'BBB', name: 'Beta', type: 'colony', owner: 'AAA', controller: 'AAA', status: 'colony', playable: false },
    { id: 'MND', name: 'Mandato', type: 'colony', owner: 'LEAGUE', controller: 'AAA', status: 'mandate', playable: false },
  ],
});

test('un dataset politico coerente è valido (LEAGUE ammesso come owner)', () => {
  assert.equal(validateCatalog(withPolitical()).ok, true);
});

test('political: owner e controller devono esistere', () => {
  const c = withPolitical();
  c.political[1].owner = 'ZZZ';
  c.political[2].controller = 'LEAGUE';
  const text = validateCatalog(c).errors.join('\n');
  assert.match(text, /owner inesistente "ZZZ"/);
  assert.match(text, /controller inesistente "LEAGUE"/);
});

test('political: type, status e playable devono essere validi', () => {
  const c = withPolitical();
  c.political[0].type = 'impero';
  c.political[0].status = 'annesso';
  c.political[0].playable = 'si';
  const text = validateCatalog(c).errors.join('\n');
  assert.match(text, /type non valido/);
  assert.match(text, /status non valido/);
  assert.match(text, /playable deve essere booleano/);
});

test('political: id duplicati e campi mancanti sono errori', () => {
  const c = withPolitical();
  c.political.push({ ...c.political[0] });
  delete c.political[1].name;
  const text = validateCatalog(c).errors.join('\n');
  assert.match(text, /id duplicato "AAA"/);
  assert.match(text, /"name"/);
});

test('political: ogni nazione di nations.json deve esistere nel dataset politico', () => {
  const c = withPolitical();
  c.nations.push({ id: 'XXX', name: 'Senza politica', capital: 'X' });
  assert.match(validateCatalog(c).errors.join('\n'), /"XXX" non esiste in political_1936/);
});

test('political: senza dataset politico la validazione precedente resta invariata', () => {
  assert.equal(validateCatalog(base()).ok, true);
});

test('political_1936 reale: invarianti storiche del 1/1/1936', async () => {
  const { political } = await loadCatalog();
  const byId = new Map(political.map((e) => [e.id, e]));
  const expect = (id, fields) => assert.deepEqual({ ...byId.get(id) }, { ...byId.get(id), ...fields });
  expect('ETH', { owner: 'ETH', controller: 'ETH', status: 'independent', playable: true });
  expect('MAN', { type: 'puppet', owner: 'MAN', controller: 'JPN', status: 'puppet', playable: true });
  expect('MENG', { type: 'puppet', owner: 'MENG', controller: 'JPN', status: 'puppet', playable: false });
  expect('PHL', { type: 'special', owner: 'USA', controller: 'PHL', status: 'commonwealth', playable: false });
  expect('DANZIG', { type: 'special', owner: 'LEAGUE', controller: 'DANZIG', status: 'free_city', playable: false });
  expect('SWA', { owner: 'LEAGUE', controller: 'ZAF', status: 'mandate' });
  expect('TIB', { type: 'special', status: 'de_facto', playable: false });
  // Eventi successivi al 1/1/1936: nessuna entità per Saar, Memel; AUT e CZE integri.
  for (const absent of ['SAAR', 'MEMEL']) assert.equal(byId.has(absent), false);
  expect('AUT', { owner: 'AUT', controller: 'AUT', status: 'independent' });
  expect('CZE', { owner: 'CZE', controller: 'CZE', status: 'independent' });
  // Solo i sette campi previsti.
  for (const e of political) {
    assert.deepEqual(Object.keys(e), ['id', 'name', 'type', 'owner', 'controller', 'status', 'playable']);
  }
});
