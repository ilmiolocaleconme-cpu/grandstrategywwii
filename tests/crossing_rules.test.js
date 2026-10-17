import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canCross, applyCrossingAction, initialCrossingState, buildCrossingStates, crossingCapacity, CAPACITY, ACTIONS,
} from '../src/rules/crossings.js';
import { validateCatalog } from '../src/data/validate.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const crossings = read('crossings.json');
const byId = new Map(crossings.map((c) => [c.id, c]));
const get = (id) => byId.get(id);
const states = buildCrossingStates(crossings);

// Fixture sintetica per i tipi che nei dati non ci sono (guado, traghetto).
const synth = (type, carries = ['road']) => ({ id: 'X_T', type, carries, validFrom: '1900-01-01', validTo: '9999-12-31', state: 'intact', controller: null });

// ---- dati: carries ----

test('dati: carries è coerente con il tipo e con le fonti (Maxau e Colonia portano strada e ferrovia)', () => {
  for (const c of crossings) {
    assert.ok(Array.isArray(c.carries) && c.carries.length > 0, c.id);
    if (c.type === 'bridge_road') assert.ok(c.carries.includes('road'), c.id);
    if (c.type === 'bridge_rail') assert.ok(c.carries.includes('rail'), c.id);
  }
  assert.deepEqual([...get('X_RHINE_MAXAU_PONTONE').carries].sort(), ['rail', 'road']);
  assert.deepEqual([...get('X_RHINE_KOELN_HOHENZOLLERN').carries].sort(), ['rail', 'road']);
  assert.deepEqual(get('X_RHINE_REMAGEN_LUDENDORFF').carries, ['rail']);
});

test('validatore: carries obbligatorio, non vuoto, senza duplicati, coerente col tipo', async () => {
  const catalog = {
    nations: read('nations.json'), resources: read('resources.json'), rivers: read('rivers.json'),
    crossings, political: read('political_1936.json'), provinces: await loadProvinces(), riversGeo: read('rivers_geo.json'), lakes: read('lakes.json'),
  };
  assert.deepEqual(validateCatalog(catalog).errors, []);
  const errs = (patch, idx = 0) => {
    const c = structuredClone(catalog);
    if (patch === undefined) delete c.crossings[idx].carries; else c.crossings[idx].carries = patch;
    return validateCatalog(c).errors.join('\n');
  };
  assert.match(errs(undefined), /campo obbligatorio mancante "carries"/);
  assert.match(errs([]), /carries deve essere un elenco non vuoto/);
  assert.match(errs(['road', 'road']), /carries deve essere un elenco non vuoto/);
  assert.match(errs(['aereo']), /carries deve essere un elenco non vuoto/);
  assert.match(errs('road'), /carries deve essere un elenco non vuoto/);
  // idx 0 = Hohenzollern (bridge_rail): togliere la ferrovia è incoerente
  assert.match(errs(['road']), /ponte ferroviario ma carries non include "rail"/);
  // idx 6 = Waldshut strada (bridge_road): togliere la strada è incoerente
  assert.match(errs(['rail'], 6), /ponte stradale ma carries non include "road"/);
  // guadi e traghetti non portano la ferrovia
  const f = structuredClone(catalog);
  Object.assign(f.crossings[0], { type: 'ferry', carries: ['road', 'rail'] });
  assert.match(validateCatalog(f).errors.join('\n'), /ferry non può portare la ferrovia/);
});

// ---- stato iniziale e capacità ----

test('stato iniziale preso dal dato; tabella per tutti gli attraversamenti', () => {
  assert.deepEqual(initialCrossingState(get('X_RHINE_KOELN_HOHENZOLLERN')), { state: 'intact', controller: 'DEU' });
  assert.deepEqual(initialCrossingState(get('X_RHINE_WALDSHUT_STRADA')), { state: 'intact', controller: null });
  assert.equal(Object.keys(states).length, 9);
});

test('capacità qualitativa: intatto = full, danneggiato e temporaneo = reduced, distrutto = none', () => {
  assert.equal(crossingCapacity('intact'), CAPACITY.FULL);
  assert.equal(crossingCapacity('damaged'), CAPACITY.REDUCED);
  assert.equal(crossingCapacity('temporary'), CAPACITY.REDUCED);
  assert.equal(crossingCapacity('destroyed'), CAPACITY.NONE);
});

// ---- canCross sui dati reali ----

test('canCross: nel 1936 a Maxau passa il ponte di barche (strada e ferrovia), il ponte fisso non c\'è ancora', () => {
  const ctx = { date: '1936-01-01', actor: 'DEU' };
  const pont = get('X_RHINE_MAXAU_PONTONE');
  assert.deepEqual(canCross(pont, states[pont.id], { ...ctx, traffic: 'road' }), { ok: true, capacity: 'full', reason: null });
  assert.equal(canCross(pont, states[pont.id], { ...ctx, traffic: 'rail' }).ok, true);
  const fisso = get('X_RHINE_MAXAU_FISSO_STRADA');
  assert.deepEqual(canCross(fisso, states[fisso.id], { ...ctx, traffic: 'road' }), { ok: false, capacity: 'none', reason: 'not_built_yet' });
});

test('canCross: dopo l\'apertura del ponte fisso il ponte di barche non esiste più', () => {
  const pont = get('X_RHINE_MAXAU_PONTONE');
  assert.equal(canCross(pont, states[pont.id], { date: '1938-04-02', traffic: 'road', actor: 'DEU' }).ok, true);
  assert.equal(canCross(pont, states[pont.id], { date: '1938-04-03', traffic: 'road', actor: 'DEU' }).reason, 'no_longer_exists');
  const fisso = get('X_RHINE_MAXAU_FISSO_STRADA');
  assert.equal(canCross(fisso, states[fisso.id], { date: '1938-01-17', traffic: 'road', actor: 'DEU' }).ok, true);
});

test('canCross: la Waalbrug esiste dal 16/6/1936, non prima', () => {
  const w = get('X_RHINE_NIMEGA_WAALBRUG');
  assert.equal(canCross(w, states[w.id], { date: '1936-06-15', traffic: 'road', actor: 'NLD' }).reason, 'not_built_yet');
  assert.equal(canCross(w, states[w.id], { date: '1936-06-16', traffic: 'road', actor: 'NLD' }).ok, true);
});

test('canCross: un ponte ferroviario non porta la strada e viceversa; Colonia porta entrambe', () => {
  const rem = get('X_RHINE_REMAGEN_LUDENDORFF');
  assert.equal(canCross(rem, states[rem.id], { date: '1936-01-01', traffic: 'road', actor: 'DEU' }).reason, 'wrong_traffic');
  assert.equal(canCross(rem, states[rem.id], { date: '1936-01-01', traffic: 'rail', actor: 'DEU' }).ok, true);
  const maa = get('X_MEUSE_MAASTRICHT_WILHELMINA');
  assert.equal(canCross(maa, states[maa.id], { date: '1936-01-01', traffic: 'rail', actor: 'NLD' }).reason, 'wrong_traffic');
  const col = get('X_RHINE_KOELN_HOHENZOLLERN');
  for (const traffic of ['road', 'rail']) assert.equal(canCross(col, states[col.id], { date: '1936-01-01', traffic, actor: 'DEU' }).ok, true);
});

test('canCross: controllore nullo = ponte di frontiera libero; altrimenti serve essere il controllore o avere accesso', () => {
  const wald = get('X_RHINE_WALDSHUT_STRADA');
  assert.equal(canCross(wald, states[wald.id], { date: '1936-01-01', traffic: 'road', actor: 'FRA' }).ok, true);
  const col = get('X_RHINE_KOELN_HOHENZOLLERN');
  const ctx = { date: '1936-01-01', traffic: 'rail', actor: 'FRA' };
  assert.equal(canCross(col, states[col.id], ctx).reason, 'controller_denied');
  assert.equal(canCross(col, states[col.id], { ...ctx, access: ['DEU'] }).ok, true);
  assert.equal(canCross(col, states[col.id], { ...ctx, access: ['ITA'] }).reason, 'controller_denied');
  assert.equal(canCross(col, states[col.id], { ...ctx, actor: 'DEU' }).ok, true);
});

test('canCross: argomenti non validi sono errori di programmazione (eccezione), non verdetti', () => {
  const c = get('X_RHINE_KOELN_HOHENZOLLERN');
  assert.throws(() => canCross(c, states[c.id], { traffic: 'road', actor: 'DEU' }), TypeError);
  assert.throws(() => canCross(c, states[c.id], { date: '1936-01-01', traffic: 'aereo', actor: 'DEU' }), RangeError);
});

// ---- transizioni di stato ----

const run = (crossing, runtime, steps) => steps.reduce((rt, [action, opts]) => {
  const r = applyCrossingAction(crossing, rt, action, opts);
  assert.equal(r.ok, true, `${action}: ${r.reason}`);
  return r.runtime;
}, runtime);

test('transizioni: tabella completa stato x azione per un ponte', () => {
  const br = synth('bridge_road');
  const E = { engineers: true };
  // [stato di partenza, azione, opzioni, esito: nuovo stato oppure codice di errore]
  const table = [
    ['intact', 'damage', {}, 'damaged'], ['damaged', 'damage', {}, 'already_damaged'],
    ['temporary', 'damage', {}, 'destroyed'], ['destroyed', 'damage', {}, 'already_destroyed'],
    ['intact', 'destroy', {}, 'destroyed'], ['damaged', 'destroy', {}, 'destroyed'],
    ['temporary', 'destroy', {}, 'destroyed'], ['destroyed', 'destroy', {}, 'already_destroyed'],
    ['damaged', 'repair', E, 'intact'], ['intact', 'repair', E, 'nothing_to_repair'],
    ['temporary', 'repair', E, 'nothing_to_repair'], ['destroyed', 'repair', E, 'nothing_to_repair'],
    ['damaged', 'repair', {}, 'engineers_required'],
    ['destroyed', 'build_temporary', E, 'temporary'], ['intact', 'build_temporary', E, 'not_destroyed'],
    ['damaged', 'build_temporary', E, 'not_destroyed'], ['temporary', 'build_temporary', E, 'not_destroyed'],
    ['destroyed', 'build_temporary', {}, 'engineers_required'],
    ['destroyed', 'rebuild', E, 'intact'], ['temporary', 'rebuild', E, 'intact'],
    ['intact', 'rebuild', E, 'already_intact'], ['damaged', 'rebuild', E, 'use_repair'],
    ['destroyed', 'rebuild', {}, 'engineers_required'],
  ];
  for (const [from, action, opts, expected] of table) {
    const before = { state: from, controller: 'AAA' };
    const r = applyCrossingAction(br, before, action, opts);
    if (['intact', 'damaged', 'temporary', 'destroyed'].includes(expected)) {
      assert.equal(r.ok, true, `${from}+${action}`);
      assert.equal(r.runtime.state, expected, `${from}+${action}`);
    } else {
      assert.equal(r.ok, false, `${from}+${action}`);
      assert.equal(r.reason, expected, `${from}+${action}`);
      assert.equal(r.runtime, before, 'se fallisce lo stato resta lo stesso oggetto');
    }
    assert.equal(before.state, from, 'lo stato di ingresso non viene mai modificato');
    assert.equal(r.runtime.controller, 'AAA');
  }
});

test('transizioni: il genio costruisce un passaggio temporaneo solo sui ponti, non su guadi e traghetti', () => {
  const E = { engineers: true };
  for (const type of ['bridge_road', 'bridge_rail', 'bridge_pontoon']) {
    assert.equal(applyCrossingAction(synth(type), { state: 'destroyed', controller: null }, 'build_temporary', E).ok, true, type);
  }
  for (const type of ['ford', 'ferry']) {
    assert.equal(applyCrossingAction(synth(type), { state: 'destroyed', controller: null }, 'build_temporary', E).reason, 'not_a_bridge', type);
  }
});

test('transizioni: conquista cambia il controllore ma non lo stato', () => {
  const c = get('X_RHINE_KOELN_HOHENZOLLERN');
  const r = applyCrossingAction(c, states[c.id], 'capture', { by: 'FRA' });
  assert.deepEqual(r, { ok: true, runtime: { state: 'intact', controller: 'FRA' }, reason: null });
  assert.equal(applyCrossingAction(c, r.runtime, 'capture', { by: 'FRA' }).reason, 'already_controlled');
  assert.equal(applyCrossingAction(c, states[c.id], 'capture').reason, 'missing_nation');
  assert.equal(states[c.id].controller, 'DEU', 'lo stato iniziale non è stato modificato');
});

test('transizioni: azione sconosciuta = errore di programmazione', () => {
  const c = get('X_RHINE_KOELN_HOHENZOLLERN');
  assert.throws(() => applyCrossingAction(c, states[c.id], 'bombarda'), RangeError);
  assert.equal(ACTIONS.length, 6);
});

// ---- scenario completo sui dati reali ----

test('scenario Colonia: distrutto, nessun passaggio; ponte temporaneo = solo strada; ricostruzione = tutto', () => {
  const c = get('X_RHINE_KOELN_HOHENZOLLERN');
  const ctx = (traffic) => ({ date: '1945-03-06', traffic, actor: 'DEU' });
  let rt = run(c, states[c.id], [['destroy']]);
  assert.deepEqual(canCross(c, rt, ctx('rail')), { ok: false, capacity: 'none', reason: 'destroyed' });
  assert.equal(canCross(c, rt, ctx('road')).reason, 'destroyed');
  rt = run(c, rt, [['build_temporary', { engineers: true }]]);
  assert.deepEqual(canCross(c, rt, ctx('road')), { ok: true, capacity: 'reduced', reason: null });
  assert.equal(canCross(c, rt, ctx('rail')).reason, 'temporary_road_only');
  rt = run(c, rt, [['rebuild', { engineers: true }]]);
  assert.deepEqual(canCross(c, rt, ctx('rail')), { ok: true, capacity: 'full', reason: null });
  assert.equal(states[c.id].state, 'intact', 'lo stato iniziale dei dati è rimasto intatto');
});

test('scenario Maxau: danneggiato = passa con capacità ridotta; riparato = piena; conquistato = serve l\'accesso', () => {
  const c = get('X_RHINE_MAXAU_PONTONE');
  const ctx = { date: '1937-06-01', traffic: 'road', actor: 'DEU' };
  let rt = run(c, states[c.id], [['damage']]);
  assert.deepEqual(canCross(c, rt, ctx), { ok: true, capacity: 'reduced', reason: null });
  rt = run(c, rt, [['repair', { engineers: true }]]);
  assert.equal(canCross(c, rt, ctx).capacity, 'full');
  rt = run(c, rt, [['capture', { by: 'FRA' }]]);
  assert.equal(canCross(c, rt, ctx).reason, 'controller_denied');
  assert.equal(canCross(c, rt, { ...ctx, actor: 'FRA' }).ok, true);
  assert.equal(canCross(c, rt, { ...ctx, access: ['FRA'] }).ok, true);
});
