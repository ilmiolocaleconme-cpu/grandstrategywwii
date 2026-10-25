import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  START_DATE, parseDate, addDays, daysBetween, formatDate, isValidDate,
} from '../src/game/calendar.js';
import {
  newGame, playableNations, validateState, initialControl, STATE_SCHEMA,
} from '../src/game/state.js';
import { advanceDay, advanceDays } from '../src/game/engine.js';
import {
  serializeSave, parseSave, createSaveStore, SAVE_FORMAT,
} from '../src/game/save.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const political = JSON.parse(readFileSync(new URL('../data/political_1936.json', import.meta.url), 'utf8'));
const provinces = await loadProvinces();
const owners = new Set(provinces.features.map((f) => f.properties.owner));
const fresh = (nation = 'ITA') => {
  const r = newGame({ nation, political, ownersWithProvinces: owners });
  assert.equal(r.ok, true, `newGame(${nation}) -> ${r.reason}`);
  return r.state;
};

// ---------- calendario ----------
test('calendario: 1936 è bisestile, 1937 no', () => {
  assert.equal(addDays('1936-02-28', 1), '1936-02-29');
  assert.equal(addDays('1936-02-29', 1), '1936-03-01');
  assert.equal(addDays('1937-02-28', 1), '1937-03-01');
  assert.equal(daysBetween('1936-01-01', '1937-01-01'), 366);
  assert.equal(daysBetween('1937-01-01', '1938-01-01'), 365);
});

test('calendario: fine anno, indietro, e andata e ritorno', () => {
  assert.equal(addDays('1936-12-31', 1), '1937-01-01');
  assert.equal(addDays('1936-01-01', -1), '1935-12-31');
  for (const d of ['1936-01-01', '1939-09-01', '1945-05-08', '1946-12-31']) {
    assert.equal(addDays(addDays(d, 1000), -1000), d);
  }
  assert.equal(daysBetween('1939-09-01', '1945-09-02'), 2193);
});

test('calendario: date non valide rifiutate, formato italiano', () => {
  for (const bad of ['1937-02-29', '1936-13-01', '1936-1-1', '', null, 19360101, '1936-04-31']) {
    assert.equal(isValidDate(bad), false, String(bad));
    assert.throws(() => parseDate(bad), TypeError);
  }
  assert.throws(() => addDays('1936-01-01', 1.5), TypeError);
  assert.equal(formatDate('1936-01-01'), '1 gennaio 1936');
  assert.equal(formatDate('1939-09-01'), '1 settembre 1939');
});

// ---------- nuova partita ----------
test('nazioni scegliibili: solo giocabili con province (senza le sue province una nazione giocabile viene scartata)', () => {
  const list = playableNations(political, owners).map((e) => e.id);
  assert.ok(list.includes('DEU') && list.includes('ITA'));
  assert.ok(list.includes('JPN') && list.includes('USA') && list.includes('CHN'), 'ora anche Giappone, USA e Cina hanno province');
  for (const id of list) assert.ok(owners.has(id));
  // il dataset politico dichiara JPN giocabile: se le sue province mancassero, lo scarto sarebbe esplicito, non un bug silenzioso
  const senzaJpn = playableNations(political, [...owners].filter((o) => o !== 'JPN')).map((e) => e.id);
  assert.ok(!senzaJpn.includes('JPN') && political.find((e) => e.id === 'JPN').playable === true);
});

test('nuova partita: stato iniziale coerente', () => {
  const s = fresh('DEU');
  assert.equal(s.schema, STATE_SCHEMA);
  assert.equal(s.date, START_DATE);
  assert.equal(s.day, 0);
  assert.equal(s.player, 'DEU');
  assert.deepEqual(validateState(s), []);
  assert.deepEqual(s.control, initialControl(political));
  assert.equal(s.control.LBA, 'ITA'); // la Libia è controllata dall'Italia nel 1936
});

test('nuova partita: rifiuti con motivo', () => {
  const g = (nation, extra = {}) => newGame({ nation, political, ownersWithProvinces: owners, ...extra });
  assert.equal(g('XXX').reason, 'unknown_nation');
  assert.equal(g('JPN', { ownersWithProvinces: [...owners].filter((o) => o !== 'JPN') }).reason, 'no_provinces'); // JPN ha province: lo scarto si prova togliendole
  assert.equal(g('LBA').reason, 'not_playable'); // territorio, non nazione
  assert.equal(g('').reason, 'invalid_nation');
  assert.equal(g(undefined).reason, 'invalid_nation');
  assert.equal(g('ITA', { startDate: '1936-02-30' }).reason, 'invalid_date');
  const nonPlayable = political.find((e) => e.type === 'country' && e.playable === false);
  assert.equal(g(nonPlayable.id).reason, 'not_playable');
});

test('stato: la mappa degli id è una copia (non condivide riferimenti con il catalogo)', () => {
  const a = fresh(); const b = fresh();
  a.control.ITA = 'DEU';
  assert.equal(b.control.ITA, 'ITA');
});

// ---------- motore ----------
test('motore: un tick = un giorno, puro e deterministico', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  const n = advanceDay(s);
  assert.equal(JSON.stringify(s), before, 'lo stato in ingresso non viene modificato');
  assert.equal(n.date, '1936-01-02');
  assert.equal(n.day, 1);
  assert.deepEqual(advanceDays(s, 366), advanceDays(advanceDays(s, 100), 266));
  assert.equal(advanceDays(s, 366).date, '1937-01-01');
  assert.deepEqual(validateState(advanceDays(s, 1000)), []);
  assert.throws(() => advanceDays(s, -1), RangeError);
  assert.throws(() => advanceDays(s, 1.2), RangeError);
});

test('motore: i sistemi girano in ordine a ogni giorno', () => {
  const order = [];
  const a = (st) => { order.push(`a${st.day}`); return st; };
  const b = (st) => { order.push(`b${st.day}`); return { ...st, flag: st.day }; };
  const out = advanceDays(fresh(), 2, [a, b]);
  assert.deepEqual(order, ['a1', 'b1', 'a2', 'b2']);
  assert.equal(out.flag, 2);
});

// ---------- salvataggi ----------
test('salvataggio: andata e ritorno identica', () => {
  const s = advanceDays(fresh('DEU'), 45);
  const r = parseSave(serializeSave(s, { savedAt: '2026-10-17T10:00:00Z', label: 'prova' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
  assert.equal(r.label, 'prova');
  assert.equal(r.migratedFrom, undefined);
});

test('salvataggio: riprodurre la partita da un salvataggio dà lo stesso risultato', () => {
  const s = advanceDays(fresh(), 30);
  const loaded = parseSave(serializeSave(s)).state;
  assert.deepEqual(advanceDays(loaded, 200), advanceDays(s, 200));
});

test('salvataggio: errori distinti e nessuna eccezione', () => {
  const s = fresh();
  const good = JSON.parse(serializeSave(s));
  const cases = [
    ['{non json', 'invalid_json'],
    ['null', 'wrong_format'],
    ['[]', 'wrong_format'],
    [JSON.stringify({ ...good, format: 'altro' }), 'wrong_format'],
    [JSON.stringify({ ...good, schema: 0 }), 'wrong_format'],
    [JSON.stringify({ ...good, schema: 99 }), 'newer_version'],
    [JSON.stringify({ ...good, state: { ...good.state, day: 7 } }), 'invalid_state'], // date != startDate + day
    [JSON.stringify({ ...good, state: { ...good.state, control: [] } }), 'invalid_state'],
    [JSON.stringify({ ...good, state: { ...good.state, player: 'ZZZ' } }), 'invalid_state'],
  ];
  for (const [text, reason] of cases) {
    const r = parseSave(text);
    assert.equal(r.ok, false, reason);
    assert.equal(r.reason, reason, `atteso ${reason}, ottenuto ${r.reason}: ${r.detail}`);
  }
});

test('salvataggio: catena di migrazioni (schema sintetico) e migrazione mancante', () => {
  const doc = (schema, state) => JSON.stringify({ format: SAVE_FORMAT, schema, savedAt: null, label: '', state });
  const migrations = {
    1: (st) => ({ ...st, a: 1 }),
    2: (st) => ({ ...st, b: st.a + 1 }),
  };
  const ok = parseSave(doc(1, { x: 1 }), { migrations, currentSchema: 3 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.state, { x: 1, a: 1, b: 2 });
  assert.equal(ok.migratedFrom, 1);
  const missing = parseSave(doc(1, { x: 1 }), { migrations: { 2: (s) => s }, currentSchema: 3 });
  assert.equal(missing.reason, 'missing_migration');
  const boom = parseSave(doc(1, {}), { migrations: { 1: () => { throw new Error('rotto'); } }, currentSchema: 2 });
  assert.equal(boom.reason, 'invalid_state');
});

// archivio finto con le stesse regole di localStorage
function fakeStorage({ failWrites = false, failReads = false } = {}) {
  const m = new Map();
  return {
    m,
    getItem(k) { if (failReads) throw new Error('bloccato'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (failWrites) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

test('archivio: scrivi, leggi, info', () => {
  const st = fakeStorage();
  const store = createSaveStore(st);
  assert.equal(store.read('auto').reason, 'empty');
  const s = advanceDays(fresh(), 10);
  assert.equal(store.write('auto', s, { savedAt: 'T', label: 'auto' }).ok, true);
  assert.deepEqual(store.read('auto').state, s);
  assert.deepEqual(store.info('auto'), { slot: 'auto', savedAt: 'T', label: 'auto', date: '1936-01-11', player: 'ITA' });
  assert.equal(store.info('manual'), null);
  assert.equal(store.write('x', s).reason, 'invalid_slot');
  assert.equal(store.read('x').reason, 'invalid_slot');
});

test('archivio: se la scrittura fallisce il salvataggio precedente resta intatto', () => {
  const st = fakeStorage();
  const store = createSaveStore(st);
  const s1 = fresh();
  store.write('manual', s1, {});
  const raw = st.m.get('gswwii.save.manual');
  st.setItem = () => { throw new Error('QuotaExceededError'); };
  const r = store.write('manual', advanceDays(s1, 5), {});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'write_failed');
  assert.equal(st.m.get('gswwii.save.manual'), raw);
});

test('archivio: lettura bloccata e scrittura bloccata non lanciano', () => {
  const s = fresh();
  assert.equal(createSaveStore(fakeStorage({ failReads: true })).read('auto').reason, 'read_failed');
  assert.equal(createSaveStore(fakeStorage({ failWrites: true })).write('auto', s).reason, 'write_failed');
});

test('archivio: un salvataggio illeggibile viene copiato in .broken, mai cancellato', () => {
  const st = fakeStorage();
  const store = createSaveStore(st);
  st.m.set('gswwii.save.auto', '{corrotto');
  const r = store.read('auto');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_json');
  assert.equal(r.backedUp, true);
  assert.equal(st.m.get('gswwii.save.auto.broken'), '{corrotto');
  assert.equal(st.m.get('gswwii.save.auto'), '{corrotto', 'l\'originale non viene toccato');
  // salvataggio di una versione futura: stesso trattamento
  const future = JSON.stringify({ format: SAVE_FORMAT, schema: 99, state: {} });
  st.m.set('gswwii.save.manual', future);
  const f = store.read('manual');
  assert.equal(f.reason, 'newer_version');
  assert.equal(st.m.get('gswwii.save.manual.broken'), future);
});
