// Pool nazionale di uomini: quota base di esempio (5%) e modificatori (esempi sintetici, non leggi reali).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePopulation } from '../src/data/nationPopulation.js';
import { validateModifiers, manpowerShare, manpowerPoolState } from '../src/rules/manpowerPool.js';

const pop = JSON.parse(readFileSync(new URL('../data/population/population.json', import.meta.url), 'utf8'));
const political = JSON.parse(readFileSync(new URL('../data/political_1936.json', import.meta.url), 'utf8'));

test('dati: quota base 5% (esempio dell\'utente), non più MISSING_DATA, validata', () => {
  assert.equal(pop.recruitment.baseShare, 0.05);
  assert.equal(pop.recruitment.quality, 'USER_ESTIMATE');
  const errors = validatePopulation(pop, { ownerIds: new Set(Object.keys(pop.nations)) });
  assert.deepEqual(errors.filter((e) => /recruitment/.test(e)), []);
  for (const bad of [{ baseShare: 0, quality: 'USER_ESTIMATE' }, { baseShare: 1.5, quality: 'USER_ESTIMATE' }, { baseShare: 0.05, quality: 'boh' }]) {
    assert.ok(validatePopulation({ ...pop, recruitment: bad }, { ownerIds: new Set(Object.keys(pop.nations)) }).some((e) => /recruitment/.test(e)));
  }
  assert.ok(political.length > 0);
});

test('pool della Germania 1936: 5% di 68,5 milioni, con arruolati e senza modificatori', () => {
  const deu = pop.nations.DEU.population;
  const p = manpowerPoolState({ population: deu, baseShare: pop.recruitment.baseShare, enlisted: 30 * 17263 });
  assert.equal(p.share, 0.05);
  assert.equal(p.capacity, 3425000);
  assert.equal(p.available, 3425000 - 517890);
  assert.equal(p.overdrawn, false);
});

test('modificatori sintetici: età di leva +1 punto, mobilitazione totale +4 punti; quota e pool crescono, e si può andare oltre la capacità', () => {
  const mods = [{ id: 'SYN-ETA-LEVA', kind: 'add', value: 0.01, source: 'esempio di prova' }, { id: 'SYN-MOB-TOTALE', kind: 'add', value: 0.04, source: 'esempio di prova' }];
  assert.deepEqual(validateModifiers(mods), []);
  assert.ok(Math.abs(manpowerShare(0.05, mods) - 0.10) < 1e-12);
  assert.equal(manpowerPoolState({ population: 68500000, baseShare: 0.05, modifiers: mods }).capacity, 6850000);
  assert.equal(manpowerShare(0.9, [{ id: 'X', kind: 'add', value: 0.5, source: 's' }]), 1, 'mai oltre il 100%');
  assert.equal(manpowerShare(0.05, [{ id: 'X', kind: 'add', value: -0.2, source: 's' }]), 0, 'mai sotto lo 0%');
  const over = manpowerPoolState({ population: 1000000, baseShare: 0.05, enlisted: 60000 });
  assert.deepEqual([over.capacity, over.available, over.overdrawn], [50000, -10000, true]);
});

test('rifiuti: modificatori non validi, quota base e popolazione fuori scala, nessuna invenzione', () => {
  for (const [m, re] of [[[{ id: '', kind: 'add', value: 0.1, source: 's' }], /senza id/], [[{ id: 'A', kind: 'mul', value: 2, source: 's' }], /solo 'add'/],
    [[{ id: 'A', kind: 'add', value: NaN, source: 's' }], /valore non valido/], [[{ id: 'A', kind: 'add', value: 0.1, source: '' }], /senza fonte/],
    [[{ id: 'A', kind: 'add', value: 0.1, source: 's' }, { id: 'A', kind: 'add', value: 0.1, source: 's' }], /duplicato/]]) {
    assert.ok(validateModifiers(m).some((e) => re.test(e)), String(re));
    assert.throws(() => manpowerShare(0.05, m), /non validi/);
  }
  assert.throws(() => manpowerShare(0, []), RangeError); assert.throws(() => manpowerShare(1.2, []), RangeError);
  assert.throws(() => manpowerPoolState({ population: -1, baseShare: 0.05 }), RangeError);
  assert.throws(() => manpowerPoolState({ population: 100, baseShare: 0.05, enlisted: -5 }), RangeError);
});
