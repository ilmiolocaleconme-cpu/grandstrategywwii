import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvRows, toCsv } from '../src/data/csv.js';

test('csv: BOM, CRLF e righe vuote', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n\r\n3,4\r\n'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});
test('csv: campi tra virgolette con virgole, "" e a capo', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi""\nok"\n'), [{ a: 'x, y', b: 'say "hi"\nok' }]);
});
test('csv: campi vuoti e ultima riga senza a capo', () => {
  assert.deepEqual(parseCsvRows('a,b,c\n1,,3'), [['a', 'b', 'c'], ['1', '', '3']]);
  assert.deepEqual(parseCsvRows('a,b\n1,'), [['a', 'b'], ['1', '']]);
});
test('csv: errori espliciti, mai dati troncati', () => {
  assert.throws(() => parseCsv('a,b\n1,2,3\n', { name: 'x.csv' }), /x\.csv: riga 2 con 3 colonne/);
  assert.throws(() => parseCsv('a,a\n1,2\n'), /duplicate/);
  assert.throws(() => parseCsv('a,b\n"1,2\n'), /virgolette non chiuse/);
});
test('csv: toCsv e parseCsv sono inversi', () => {
  const recs = [{ a: 'x, y', b: 'q"r' }, { a: '', b: 'multi\nriga' }];
  assert.deepEqual(parseCsv(toCsv(['a', 'b'], recs)), recs);
});
