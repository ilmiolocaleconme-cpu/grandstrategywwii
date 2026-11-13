// Nomi delle nazioni (13/11/2026): il Mengjiang, che nasce dopo il 1/1/1936, compariva come «MENG» nell'elenco della diplomazia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('ogni nazione del gioco ha un nome: elenco delle nazioni prima, poi i territori del 1936', () => {
  const nations = JSON.parse(read('data/nations.json'));
  const political = JSON.parse(read('data/political_1936.json'));
  const names = { ...Object.fromEntries(nations.map((n) => [n.id, n.name])), ...Object.fromEntries(political.map((e) => [e.id, e.name])) };
  assert.equal(names.MENG, 'Mengjiang');
  assert.equal(names.DEU, 'Reich tedesco', 'i nomi del 1936 restano quelli di prima');
  for (const n of nations) assert.ok(names[n.id] && names[n.id] !== n.id, `${n.id} senza nome`);
  assert.match(read('src/App.jsx'), /const NATION_NAMES = \{ \.\.\.Object\.fromEntries\(nations\.map/);
});
