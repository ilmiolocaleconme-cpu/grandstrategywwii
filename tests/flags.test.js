// Bandiere e descrizioni per la scelta della nazione (dati in data/flags.json e data/nation_descriptions.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFlags, validateDescriptions } from '../src/data/flags.js';
import { playableNations } from '../src/game/state.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));

async function choosable() {
  const provinces = await loadProvinces();
  return playableNations(json('political_1936.json'), provinces.features.map((f) => f.properties.owner)).map((n) => n.id);
}

test('ogni nazione scegliibile ha una bandiera valida e una voce di descrizione', async () => {
  const ids = await choosable();
  assert.ok(ids.length >= 24);
  const wheel = json('nation_order.json').order; // scegliibili + eventuali bloccate
  for (const id of ids) assert.ok(wheel.includes(id), `${id} nella ruota`);
  assert.deepEqual(validateFlags(json('flags.json'), { nationIds: wheel }), []);
  assert.deepEqual(validateDescriptions(json('nation_descriptions.json'), { nationIds: wheel }), []);
  for (const id of wheel) assert.ok(id in json('nation_descriptions.json').descriptions, `descrizione di ${id}`);
});

test('il validatore rifiuta forme sconosciute, colori non esadecimali e bandiere mancanti', () => {
  const ok = { schema: 'flags-v1', flags: { AAA: { w: 30, h: 20, shapes: [{ t: 'rect', x: 0, y: 0, w: 30, h: 20, fill: '#112233' }] } } };
  assert.deepEqual(validateFlags(ok, { nationIds: ['AAA'] }), []);
  assert.match(validateFlags(ok, { nationIds: ['BBB'] })[0], /manca la bandiera di BBB/);
  const bad = { schema: 'flags-v1', flags: { AAA: { w: 30, h: 20, shapes: [{ t: 'star', x: 0 }, { t: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 'red' }] } } };
  const e = validateFlags(bad).join('|');
  assert.match(e, /forma sconosciuta/);
  assert.match(e, /colore non valido/);
  assert.match(validateFlags({ schema: 'x' })[0], /schema/);
});

test('la Germania ha una bandiera provvisoria dichiarata come tale', () => {
  assert.match(json('flags.json').flags.DEU.note, /provvisoria/);
});
