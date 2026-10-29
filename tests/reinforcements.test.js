// Rinforzi: passano dal pool, viaggiano verso le divisioni che ne hanno bisogno, il giocatore può sospenderli. Casi sintetici, non dati storici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setReinforcement, inTransit, netDeficit, planReinforcements, dispatch, applyArrivals, validateReinforcementFields, MANPOWER_ITEM } from '../src/rules/reinforcements.js';
import { validateForcesShape } from '../src/game/forcesState.js';

const U = (id) => ({ id, nation: 'DEU', echelon: 'division' });
const units = [U('A'), U('B'), U('C'), { id: 'X', nation: 'FRA', echelon: 'division' }];
const div = (planned, effective, extra = {}) => ({ templateId: 'T', since: '1936-01-01', items: { [MANPOWER_ITEM]: { planned, effective, source: 'ratio' }, horses: { planned: 10, effective: 4, source: 'ratio' } }, ...extra });
const base = () => ({ schema: 'forces-v1', initialized: true, divisions: { A: div(1000, 900), B: div(1000, 500), C: div(1000, 1000), X: div(1000, 100) } });
const ctx = { units, nation: 'DEU', date: '1936-02-01', poolAvailable: 1000, transitDays: () => 5 };

test('assegnazione: prima la divisione più scoperta, mai oltre la carenza né oltre il pool; altre nazioni escluse', () => {
  const r = planReinforcements(base(), { ...ctx, poolAvailable: 550 });
  const men = r.transfers.filter((t) => t.item === MANPOWER_ITEM);
  assert.deepEqual(men.map((t) => [t.divisionId, t.qty]), [['B', 500], ['A', 50]], 'B (50%) prima di A (90%); pool 550 esaurito');
  assert.equal(r.remaining.pool, 0);
  assert.ok(!r.transfers.some((t) => t.divisionId === 'X'), 'la Francia non è della nazione');
  assert.ok(!r.transfers.some((t) => t.divisionId === 'C'), 'C è al completo');
  assert.ok(r.skipped.some((s) => s.reason === 'no_resources' && s.item === 'horses'), 'cavalli senza scorte: nessuna assegnazione inventata');
});

test('la richiesta ha la precedenza e il pool insufficiente lascia la carenza (nessun rinforzo gratuito)', () => {
  const r = planReinforcements(base(), { ...ctx, poolAvailable: 60, requests: { A: true } });
  assert.deepEqual(r.transfers.filter((t) => t.item === MANPOWER_ITEM).map((t) => [t.divisionId, t.qty]), [['A', 60]]);
  assert.ok(r.skipped.some((s) => s.divisionId === 'B' && s.reason === 'no_resources'));
  const none = planReinforcements(base(), { ...ctx, poolAvailable: 0 });
  assert.equal(none.transfers.filter((t) => t.item === MANPOWER_ITEM).length, 0);
});

test('il giocatore può decidere di non rinforzare più una divisione (e di riprendere)', () => {
  const f0 = base();
  const off = setReinforcement(f0, 'B', false);
  assert.equal(f0.divisions.B.reinforce, undefined, 'stato originale intatto');
  const r = planReinforcements(off, ctx);
  assert.ok(!r.transfers.some((t) => t.divisionId === 'B'));
  assert.deepEqual(r.skipped.filter((s) => s.divisionId === 'B').map((s) => s.reason), ['disabled', 'disabled']);
  assert.ok(planReinforcements(setReinforcement(off, 'B', true), ctx).transfers.some((t) => t.divisionId === 'B'));
  assert.throws(() => setReinforcement(f0, 'ZZ', false), /senza istanza/);
  assert.throws(() => setReinforcement(f0, 'A', 'no'), /booleano/);
});

test('spostamento: i rinforzi arrivano dopo i giorni di trasferimento, riservano il pool e non si assegnano due volte', () => {
  const f0 = base();
  const p1 = planReinforcements(f0, { ...ctx, poolAvailable: 600, stocks: { horses: 20 }, transitDays: (id) => (id === 'A' ? 3 : 10) });
  assert.equal(p1.transfers.find((t) => t.divisionId === 'A' && t.item === MANPOWER_ITEM).arrivesOn, '1936-02-04');
  const f1 = dispatch(f0, p1.transfers);
  assert.equal(f1.divisions.A.items[MANPOWER_ITEM].effective, 900, 'nulla arriva subito');
  assert.equal(inTransit(f1, 'B', MANPOWER_ITEM), 500);
  assert.equal(netDeficit(f1, 'B', MANPOWER_ITEM), 0);
  const p2 = planReinforcements(f1, { ...ctx, poolAvailable: 600 });
  assert.equal(p2.transfers.filter((t) => t.item === MANPOWER_ITEM).length, 0, 'già in viaggio: nessun doppio invio');
  assert.throws(() => dispatch(f1, p1.transfers), /duplicato/);
  const early = applyArrivals(f1, '1936-02-03');
  assert.equal(early.arrived.length, 0);
  const a = applyArrivals(f1, '1936-02-04');
  assert.equal(a.forces.divisions.A.items[MANPOWER_ITEM].effective, 1000);
  assert.equal(a.forces.divisions.B.items[MANPOWER_ITEM].effective, 500, 'B arriva più tardi');
  assert.equal(a.forces.transfers.length, f1.transfers.length - a.arrived.length);
  assert.equal(applyArrivals(a.forces, '1936-02-11').forces.divisions.B.items[MANPOWER_ITEM].effective, 1000);
});

test('arrivo: l\'effettivo non supera il previsto, l\'eccedenza torna; i rinforzi in viaggio arrivano anche se sospesi dopo l\'invio', () => {
  const f = dispatch(base(), [{ id: 't1', divisionId: 'A', item: MANPOWER_ITEM, qty: 300, from: 'pool', sentOn: '1936-02-01', arrivesOn: '1936-02-02' }]);
  const r = applyArrivals(setReinforcement(f, 'A', false), '1936-02-02');
  assert.equal(r.forces.divisions.A.items[MANPOWER_ITEM].effective, 1000);
  assert.deepEqual(r.returned.map((t) => t.returnedQty), [200]);
});

test('transitDays è obbligatorio e valido; la forma dei campi opzionali è validata', () => {
  assert.throws(() => planReinforcements(base(), { ...ctx, transitDays: undefined }), /transitDays/);
  assert.throws(() => planReinforcements(base(), { ...ctx, transitDays: () => -1 }), /non validi/);
  assert.deepEqual(validateForcesShape(base()), []);
  const bad = base(); bad.divisions.A.reinforce = 'si';
  assert.ok(validateReinforcementFields(bad).some((e) => /reinforce/.test(e)));
  assert.ok(validateForcesShape(bad).some((e) => /reinforce/.test(e)));
  const t = { ...base(), transfers: [{ id: 'x', divisionId: 'Q', item: 'k', qty: 0, from: 'boh', sentOn: '1936-02-02', arrivesOn: '1936-02-01' }] };
  const errs = validateReinforcementFields(t).join('|');
  for (const re of [/senza istanza/, /quantità/, /origine/, /date/]) assert.match(errs, re);
});
