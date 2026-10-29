// Catalogo ufficiali e regola dei comandanti: automatico, ma il giocatore sceglie sempre (corpo d'armata e armata).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { officersBuilt } from '../scripts/build-officers.js';
import {
  validateOfficers, officerLevels, officerBranchType, parseSemicolonCsv, buildOfficers, isOfficerAvailable,
} from '../src/data/officers.js';
import {
  createCommanderState, managedCommands, eligibleOfficers, autoAssign, assignCommander, releaseCommander, validateCommanderState,
} from '../src/rules/commanders.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('officers/officers.json');
const units = json('units/units.json').units;
const nationIds = new Set(json('political_1936.json').map((e) => e.id));
const byName = (n, from) => doc.officers.find((o) => o.name === n && (!from || o.availableFrom === from));

test('officers.json: valido, allineato al CSV e alle revisioni, copie protette da sha256', async () => {
  assert.deepEqual(validateOfficers(doc, { nationIds }), []);
  assert.deepEqual(doc, JSON.parse(JSON.stringify(await officersBuilt())), 'rigenerare con npm run build:officers');
  assert.equal(doc.officers.length, 185);
  const sha = (f) => createHash('sha256').update(readFileSync(new URL(`../data/officers/${f}`, import.meta.url))).digest('hex');
  assert.equal(doc.source.sha256, sha(doc.source.file));
  assert.equal(doc.cardTemplate.sha256, sha(doc.cardTemplate.file));
  assert.deepEqual({ land: 111, air: 34, navy: 40 }, doc.officers.reduce((a, o) => ({ ...a, [o.branchType]: (a[o.branchType] ?? 0) + 1 }), {}));
});

test('livelli di comando e tipo di forza armata', () => {
  assert.deepEqual(officerLevels('Army/Army Group'), ['army_group', 'army']);
  assert.deepEqual(officerLevels('Corps/Panzer Corps'), ['corps']);
  assert.deepEqual(officerLevels('Division/Corps'), ['corps', 'division']);
  assert.deepEqual(officerLevels('Front/Army'), ['army_group', 'army']);
  assert.throws(() => officerLevels('Flotta misteriosa'), /non riconosciuto/);
  assert.equal(officerBranchType('IJA Air Service'), 'air'); assert.equal(officerBranchType('IJA'), 'land');
  assert.equal(officerBranchType('Marine Nationale / FNFL'), 'navy');
  assert.throws(() => officerBranchType('Guardia Svizzera'), /non riconosciuta/);
});

test('parseSemicolonCsv: campi, virgolette e righe malformate', () => {
  assert.deepEqual(parseSemicolonCsv('a;b\n1;2\n'), [{ a: '1', b: '2' }]);
  assert.throws(() => parseSemicolonCsv('a;b\n1;2;3'), /riga 2/);
  assert.throws(() => parseSemicolonCsv('a;b\n"1";2'), /virgolette/);
  assert.throws(() => buildOfficers([{ officer_id: 'OFF-0001', nazione: 'Atlantide' }]), /senza id/);
});

test('revisioni: Tovey duplicato, Rommel/Stumme/Guderian/Gariboldi dubbi; disponibilità con estremi inclusi', () => {
  assert.equal(doc.officers.find((o) => o.id === 'OFF-0111').review.status, 'duplicate');
  for (const id of ['OFF-0022', 'OFF-0025', 'OFF-0015', 'OFF-0047']) assert.equal(doc.officers.find((o) => o.id === id).review.status, 'date_doubt');
  const rommelDiv = doc.officers.find((o) => o.id === 'OFF-0025');
  assert.equal(isOfficerAvailable(rommelDiv, '1936-01-01'), false, 'strict: dubbio = non disponibile');
  assert.equal(isOfficerAvailable(rommelDiv, '1936-01-01', { policy: 'all' }), true);
  const w = byName('Erwin von Witzleben');
  assert.equal(isOfficerAvailable(w, '1935-01-01'), true); assert.equal(isOfficerAvailable(w, '1940-01-01'), true); assert.equal(isOfficerAvailable(w, '1940-01-02'), false);
  assert.throws(() => isOfficerAvailable(w, '1936-1-1'), /data non valida/);
});

test('validazione: duplicati senza revisione, livelli, date', () => {
  const o = doc.officers.find((x) => x.id === 'OFF-0026');
  const errs = (list) => validateOfficers({ ...doc, officers: list }, { nationIds });
  assert.ok(errs([o, { ...o, id: 'OFF-9999' }]).some((e) => /identici senza revisione/.test(e)));
  assert.ok(errs([{ ...o, availableTo: '1900-01-01' }]).some((e) => /precedente/.test(e)));
  assert.ok(errs([{ ...o, levels: [] }]).some((e) => /nessun livello/.test(e)));
  assert.ok(errs([{ ...o, nation: 'ZZZ' }]).some((e) => /inesistente/.test(e)));
  assert.ok(errs([{ ...o, id: 'X' }]).some((e) => /id non valido/.test(e)));
});

// --- Regola dei comandanti ---
const cmd = (id, name, level, nation = 'DEU') => ({ id, name, nation, category: 'command', echelon: 'command', commandLevel: level, startYear: 1935, endYear: null, review: null });
const off = (id, name, over = {}) => ({ id, name, nation: 'DEU', branchType: 'land', dating: 'date', levels: ['corps'], levelRaw: 'Corps', exampleFormation: '', availableFrom: '1935-01-01', availableTo: '1945-12-31', review: null, ...over });
const U = [cmd('C1', 'III. Armeekorps', 'corps'), cmd('C2', 'IV. Armeekorps', 'corps'), cmd('A1', 'Armata X', 'army'), cmd('D1', 'Wehrkreis I', 'district')];
const O = [off('O1', 'Uno', { exampleFormation: 'IV. Armeekorps' }), off('O2', 'Due'), off('O3', 'Tre', { levels: ['army'], levelRaw: 'Army' }),
  off('O4', 'Quattro', { nation: 'FRA' }), off('O5', 'Cinque', { branchType: 'air', levels: [] }), off('O6', 'Sei SS', { levelRaw: 'SS Division/Corps' })];
const D = '1936-06-01';

test('automatico: stesso livello e nazione, preferisce la stessa formazione, ignora distretti, SS e altre armi', () => {
  assert.deepEqual(managedCommands(U, D).map((c) => c.id), ['A1', 'C1', 'C2']);
  const { state, events } = autoAssign(createCommanderState(), { units: U, officers: O, date: D });
  assert.equal(state.assignments.C2.officerId, 'O1', 'IV. Armeekorps → ufficiale con quella formazione');
  assert.equal(state.assignments.C1.officerId, 'O2');
  assert.equal(state.assignments.A1.officerId, 'O3');
  assert.ok(!('D1' in state.assignments), 'i distretti non sono gestiti');
  assert.ok(Object.values(state.assignments).every((a) => a.source === 'auto' && !['O4', 'O5', 'O6'].includes(a.officerId)));
  assert.equal(events.length, 3);
  assert.deepEqual(validateCommanderState(state, { units: U, officers: O }), []);
  assert.deepEqual(autoAssign(state, { units: U, officers: O, date: D }).events, [], 'idempotente');
  assert.equal(eligibleOfficers({ command: U[0], officers: O, date: D, taken: new Set(['O1', 'O2']) }).length, 0);
});

test('il giocatore sceglie sempre: sovrascrive l\'automatico, non viene mai toccato dall\'automatico', () => {
  let { state } = autoAssign(createCommanderState(), { units: U, officers: O, date: D });
  const r = assignCommander(state, { commandId: 'C1', officerId: 'O1', units: U, officers: O, date: D });
  assert.equal(r.state.assignments.C1.source, 'player');
  assert.ok(!('C2' in r.state.assignments), 'O1 lascia C2 (un ufficiale, un comando)');
  assert.deepEqual(r.events.map((e) => e.type), ['vacated', 'replaced', 'player_assign']);
  assert.ok(r.warnings.some((w) => /lascia il comando di C2/.test(w)));
  state = r.state;
  // l'automatico riempie C2 con un altro, ma non tocca C1 del giocatore nemmeno se l'ufficiale diventa indisponibile
  const later = autoAssign(state, { units: U, officers: O, date: '1950-01-01' });
  assert.equal(later.state.assignments.C1.officerId, 'O1', 'scelta del giocatore intoccabile');
  assert.ok(!('C2' in later.state.assignments) || later.state.assignments.C2.source === 'auto');
});

test('scelta del giocatore: avvisi non bloccanti (data, dubbi, livello) e blocchi (nazione, arma, livello gestito, id)', () => {
  const st = createCommanderState();
  const early = off('E1', 'Presto', { availableFrom: '1940-01-01', review: { status: 'date_doubt', reason: 'dubbio' }, levels: ['division'] });
  const w = assignCommander(st, { commandId: 'C1', officerId: 'E1', units: U, officers: [...O, early], date: D }).warnings;
  assert.ok(w.some((x) => /non ancora disponibile/.test(x)) && w.some((x) => /dubbi/.test(x)) && w.some((x) => /fuori dal profilo/.test(x)));
  const a = (commandId, officerId) => () => assignCommander(st, { commandId, officerId, units: U, officers: O, date: D });
  assert.throws(a('C1', 'O4'), /FRA/); assert.throws(a('C1', 'O5'), /non è un ufficiale di terra/);
  assert.throws(a('D1', 'O1'), /non gestito/); assert.throws(a('C9', 'O1'), /comando inesistente/); assert.throws(a('C1', 'O9'), /ufficiale inesistente/);
});

test('rilascio: il comando torna libero e l\'automatico lo riassegna; automatico sostituito alla scadenza', () => {
  const p = assignCommander(createCommanderState(), { commandId: 'C1', officerId: 'O2', units: U, officers: O, date: D });
  const rel = releaseCommander(p.state, 'C1');
  assert.deepEqual(rel.state.assignments, {});
  assert.throws(() => releaseCommander(rel.state, 'C1'), /nessun comandante/);
  const timed = [off('T1', 'Breve', { availableTo: '1937-01-01' }), off('T2', 'Dopo', { availableFrom: '1937-01-02' })];
  const s1 = autoAssign(createCommanderState(), { units: [U[0]], officers: timed, date: '1936-06-01' });
  assert.equal(s1.state.assignments.C1.officerId, 'T1');
  const s2 = autoAssign(s1.state, { units: [U[0]], officers: timed, date: '1937-06-01' });
  assert.equal(s2.state.assignments.C1.officerId, 'T2');
  assert.deepEqual(s2.events.map((e) => e.type), ['auto_release', 'auto_assign']);
});

test('validateCommanderState: errori su id, nazione, livello, doppio incarico, origine', () => {
  const bad = { schema: 'commanders-v1', assignments: { C9: { officerId: 'O1', source: 'auto' }, C1: { officerId: 'O4', source: 'boh' }, D1: { officerId: 'O2', source: 'auto' }, A1: { officerId: 'O2', source: 'auto' } } };
  const e = validateCommanderState(bad, { units: U, officers: O });
  for (const re of [/comando C9 inesistente/, /FRA/, /origine boh/, /livello district/, /comanda sia/]) assert.ok(e.some((x) => re.test(x)), String(re));
  assert.deepEqual(validateCommanderState({ schema: 'x' }, { units: U, officers: O }).length, 1);
});

test('dati reali al 1/1/1936: solo 1 comando trova un ufficiale con la stessa formazione; senza data vera il resto resta libero', () => {
  const real = autoAssign(createCommanderState(), { units, officers: doc.officers, date: '1936-01-01' });
  const names = Object.entries(real.state.assignments).map(([c, a]) => [units.find((u) => u.id === c).name, doc.officers.find((o) => o.id === a.officerId).name]);
  assert.deepEqual(names, [['Kwantung Army', 'Jiro Minami']], 'Minami ha la formazione "Kwantung Army"; gli altri ufficiali hanno date di comodo (1935-01-01) e nessuna formazione corrispondente');
  const lenient = autoAssign(createCommanderState(), { units, officers: doc.officers, date: '1936-01-01', fallback: 'any' });
  assert.equal(Object.keys(lenient.state.assignments).length, 2, 'fallback any: schiera anche Witzleben al I. Armeekorps (scelta non storica)');
  assert.deepEqual(validateCommanderState(real.state, { units, officers: doc.officers }), []);
  assert.equal(managedCommands(units, '1936-01-01').length, 13, '12 Armeekorps tedeschi + Armata del Kwantung (i corpi sovietici sono inattivi per dubbio)');
  const player = assignCommander(real.state, { commandId: units.find((u) => u.name === 'II. Armeekorps').id, officerId: byName('Heinz Guderian').id, units, officers: doc.officers, date: '1936-01-01' });
  assert.ok(player.warnings.some((w) => /non ancora disponibile \(dal 1939-01-01\)/.test(w)), 'Guderian nel 1936: scelta permessa con avviso');
});

// --- Comandanti nello stato di gioco (schema 4) ---
import { newGame, validateState, STATE_SCHEMA } from '../src/game/state.js';
import { parseSave, serializeSave, SAVE_FORMAT, MIGRATIONS } from '../src/game/save.js';
import { migrateV3toV4, validateCommandersShape, commandersSystem, playerAssignCommander, playerReleaseCommander } from '../src/game/commandersState.js';
import { advanceDays } from '../src/game/engine.js';

const political = json('political_1936.json');
const nationList = json('nations.json').map((n) => n.id);
const newState = (nation = 'DEU') => newGame({ nation, political, ownersWithProvinces: nationList }).state;
const corpsId = (n) => units.find((u) => u.name === n).id;

test('schema 4: nuova partita con comandanti vuoti, migrazione 3→4 senza perdere nulla, validazione di forma', () => {
  assert.equal(STATE_SCHEMA, 5);
  const s = newState();
  assert.deepEqual(s.commanders, { schema: 'commanders-v1', assignments: {} });
  assert.deepEqual(validateState(s), []);
  const { commanders: _c, orbat: _o, ...rest } = s;
  const v3 = { ...rest, schema: 3 };
  const r = parseSave(JSON.stringify({ format: SAVE_FORMAT, schema: 3, savedAt: null, label: 'v3', state: v3 }));
  assert.equal(r.ok, true); assert.equal(r.migratedFrom, 3); assert.deepEqual(r.state, s);
  const { orbat: _skip, ...s4 } = s;
  assert.deepEqual(migrateV3toV4(v3), { ...s4, schema: 4 });
  assert.equal(typeof MIGRATIONS[3], 'function');
  for (const [bad, re] of [[{ schema: 'x', assignments: {} }, /schema/], [{ schema: 'commanders-v1', assignments: [] }, /assignments/], [null, /oggetto/],
    [{ schema: 'commanders-v1', assignments: { C1: { officerId: 'O1', source: 'boh', since: '1936-01-01' } } }, /origine/],
    [{ schema: 'commanders-v1', assignments: { C1: { officerId: 'O1', source: 'auto', since: 'x' }, C2: { officerId: 'O1', source: 'auto', since: 'x' } } }, /comanda sia/]]) {
    assert.ok(validateCommandersShape(bad).some((e) => re.test(e)), String(re));
  }
  assert.ok(validateState({ ...s, commanders: undefined }).some((e) => /comandanti/.test(e)), 'uno stato senza commanders non è valido');
});

test('sistema giornaliero: schiera in automatico, è deterministico e riproducibile dal salvataggio', () => {
  const system = commandersSystem({ units, officers: doc.officers, fallback: 'any' });
  const strict = commandersSystem({ units, officers: doc.officers });
  const s0 = newState('DEU');
  assert.deepEqual(advanceDays(s0, 1, [strict]).commanders.assignments, {}, 'default: il 2/1/1936 Minami non è più disponibile e nessun altro ha una data vera');
  const s1 = advanceDays(s0, 1, [system]);
  assert.equal(Object.keys(s1.commanders.assignments).length, 2, 'con fallback any: I. Armeekorps (Witzleben) e Kwantung (un ufficiale giapponese qualsiasi)');
  assert.equal(s1.commanders.assignments[corpsId('I. Armeekorps')].officerId, byName('Erwin von Witzleben').id);
  assert.equal(advanceDays(s1, 0, [system]), s1);
  const again = advanceDays(s0, 1, [system]);
  assert.deepEqual(again, s1, 'stesso stato, stesso risultato');
  assert.deepEqual(parseSave(serializeSave(s1)).state, s1, 'andata e ritorno del salvataggio');
  const s2 = advanceDays(s1, 365, [system]);
  assert.deepEqual(validateCommanderState(s2.commanders, { units, officers: doc.officers }), []);
  assert.deepEqual(validateState(s2), []);
});

test('scelta del giocatore sullo stato: solo la propria nazione, con avvisi, e resta nel tempo', () => {
  const system = commandersSystem({ units, officers: doc.officers, fallback: 'any' });
  const s = advanceDays(newState('DEU'), 1, [system]);
  const second = corpsId('II. Armeekorps'); const guderian = byName('Heinz Guderian').id;
  const r = playerAssignCommander(s, { commandId: second, officerId: guderian, units, officers: doc.officers });
  assert.equal(r.state.commanders.assignments[second].source, 'player');
  assert.ok(r.warnings.some((w) => /non ancora disponibile/.test(w)));
  assert.deepEqual(validateState(r.state), []);
  assert.throws(() => playerAssignCommander(s, { commandId: corpsId('Kwantung Army'), officerId: byName('Jiro Minami').id, units, officers: doc.officers }), /JPN/);
  const later = advanceDays(r.state, 800, [system]);
  assert.equal(later.commanders.assignments[second].officerId, guderian, 'dopo anni la scelta del giocatore è ancora lì (Guderian ora disponibile)');
  assert.equal(later.commanders.assignments[second].source, 'player');
  const released = playerReleaseCommander(later, second, { units });
  assert.ok(!(second in released.state.commanders.assignments));
  assert.throws(() => playerReleaseCommander(s, corpsId('Kwantung Army'), { units }), /JPN/);
});

// --- Inquadramento (schema 5): teatro → armata → corpo → divisione → supporto ---
import {
  ORBAT_SCHEMA, orbatLevel, createOrbatState, canAttach, attach, detach, childrenOf, chainOf, unassigned, validateOrbatState,
} from '../src/rules/orbat.js';
import { migrateV4toV5, validateOrbatShape, playerAttach, playerDetach } from '../src/game/orbatState.js';

const unitU = (id, name, over = {}) => ({ id, name, nation: 'DEU', branch: 'Heer', category: 'infantry', echelon: 'division', startYear: 1936, endYear: null, commandLevel: null, review: null, ...over });
const cmdU = (id, name, level, over = {}) => unitU(id, name, { category: 'command', echelon: 'command', commandLevel: level, ...over });
const TU = [cmdU('TU', 'Teatro', 'theater'), cmdU('A', 'Armata', 'army'), cmdU('C1', 'Corpo 1', 'corps'), cmdU('C2', 'Corpo 2', 'corps'),
  unitU('D1', 'Div 1'), unitU('D2', 'Div 2'), unitU('B1', 'Brig 1', { category: 'armored', echelon: 'brigade' }), unitU('S1', 'Art 1', { category: 'artillery', echelon: 'regiment' }),
  cmdU('W1', 'Wehrkreis', 'district'), cmdU('H', 'OKW', 'high_command'), unitU('F1', 'Divisione francese', { nation: 'FRA' }), unitU('L1', 'Divisione futura', { startYear: 1940 })];
const DAY = '1936-01-01';

test('orbat: livelli (comandi, divisioni, brigate, supporto) e unità fuori catena', () => {
  assert.deepEqual(['TU', 'A', 'C1', 'D1', 'B1', 'S1', 'W1', 'H'].map((id) => orbatLevel(TU.find((x) => x.id === id))), ['theater', 'army', 'corps', 'division', 'division', 'support', null, null]);
  assert.equal(orbatLevel(unitU('X', 'Aereo', { category: 'fighter', echelon: 'wing' })), null);
});

test('orbat: attach, spostamento, cicli, nazioni, livelli e date', () => {
  let o = createOrbatState();
  assert.equal(o.schema, ORBAT_SCHEMA);
  for (const [c, p] of [['A', 'TU'], ['C1', 'A'], ['C2', 'TU'], ['D1', 'C1'], ['B1', 'C1'], ['S1', 'D1']]) o = attach(o, { childId: c, parentId: p, units: TU, date: DAY }).state;
  assert.deepEqual(chainOf(o, 'S1'), ['D1', 'C1', 'A', 'TU']);
  assert.deepEqual(childrenOf(o, 'C1'), ['B1', 'D1']);
  const moved = attach(o, { childId: 'D1', parentId: 'C2', units: TU, date: DAY });
  assert.deepEqual(moved.events, [{ type: 'moved', unitId: 'D1', from: 'C1', to: 'C2', date: DAY }]);
  assert.deepEqual(childrenOf(moved.state, 'C1'), ['B1'], 'un figlio ha un solo padre');
  assert.equal(attach(o, { childId: 'D1', parentId: 'C1', units: TU, date: DAY }).state, o, 'stesso padre: nessun cambiamento');
  const bad = (c, p, re) => assert.throws(() => attach(o, { childId: c, parentId: p, units: TU, date: DAY }), re, `${c}→${p}`);
  bad('TU', 'A', /livello più alto/); bad('D1', 'D2', /livello più alto/); bad('C1', 'C1', /sé stessa/); bad('F1', 'C1', /FRA/);
  bad('D2', 'S1', /non può comandare/); bad('D2', 'W1', /non può comandare/); bad('W1', 'TU', /non è inquadrabile/); bad('D2', 'H', /non può comandare/);
  bad('L1', 'C1', /non è attiva/); bad('Z', 'C1', /inesistente/); bad('D2', 'Z', /inesistente/);
  assert.equal(canAttach(o, { childId: 'D2', parentId: 'C1', units: TU, date: DAY }).ok, true);
  assert.deepEqual(chainOf({ links: { X: { parent: 'Y' }, Y: { parent: 'X' } } }, 'X'), ['Y'], 'catena con ciclo: termina senza girare a vuoto');
  assert.deepEqual(validateOrbatState(o, TU), []);
  assert.ok(validateOrbatState({ ...o, links: { ...o.links, D2: { parent: 'D1', source: 'player', since: DAY } } }, TU).some((e) => /livello|division/.test(e)));
  assert.ok(validateOrbatState({ ...o, links: { D2: { parent: 'Z', source: 'player', since: DAY } } }, TU).some((e) => /non esiste/.test(e)));
});

test('orbat: detach e unità non assegnate', () => {
  let o = attach(createOrbatState(), { childId: 'D1', parentId: 'C1', units: TU, date: DAY }).state;
  assert.deepEqual(unassigned(o, TU, DAY, { nation: 'DEU' }).map((x) => x.id), ['A', 'B1', 'C1', 'C2', 'D2', 'S1'], 'solo unità inquadrabili e attive, teatri esclusi');
  const d = detach(o, 'D1', { date: DAY });
  assert.deepEqual(d.events, [{ type: 'detached', unitId: 'D1', from: 'C1', to: null, date: DAY }]);
  assert.deepEqual(d.state.links, {});
  assert.equal(detach(d.state, 'D1').state, d.state);
});

test('schema 5: nuova partita con inquadramento vuoto, migrazione 4→5, salvataggio, validazione di forma', () => {
  const s = newState();
  assert.deepEqual(s.orbat, { schema: 'orbat-v1', links: {} });
  const { orbat: _o, ...rest } = s;
  const v4 = { ...rest, schema: 4 };
  const r = parseSave(JSON.stringify({ format: SAVE_FORMAT, schema: 4, savedAt: null, label: 'v4', state: v4 }));
  assert.equal(r.ok, true); assert.equal(r.migratedFrom, 4); assert.deepEqual(r.state, s);
  assert.deepEqual(migrateV4toV5(v4), s);
  assert.equal(typeof MIGRATIONS[4], 'function');
  for (const [bad, re] of [[{ schema: 'x', links: {} }, /schema/], [{ schema: 'orbat-v1', links: [] }, /links/], [null, /oggetto/],
    [{ schema: 'orbat-v1', links: { A: { parent: 'A', source: 'player', since: DAY } } }, /sé stessa/],
    [{ schema: 'orbat-v1', links: { A: { parent: 'B', source: 'boh', since: DAY } } }, /origine/]]) assert.ok(validateOrbatShape(bad).some((e) => re.test(e)), String(re));
  assert.ok(validateState({ ...s, orbat: undefined }).some((e) => /orbat/.test(e)));
});

test('orbat sullo stato: il giocatore inquadra solo la propria nazione; dati reali (Wehrkreis fuori catena, nessun collegamento storico)', () => {
  const s = newState('DEU');
  const id = (n) => units.find((x) => x.name === n).id;
  const corps = id('I. Armeekorps'); const div = id('1. Infanterie-Division'); const wk = id('Wehrkreis I');
  assert.equal(orbatLevel(units.find((x) => x.id === wk)), null);
  assert.equal(orbatLevel(units.find((x) => x.id === corps)), 'corps');
  const r = playerAttach(s, { unitId: div, parentId: corps, units });
  assert.deepEqual(r.state.orbat.links[div], { parent: corps, source: 'player', since: '1936-01-01' });
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(validateOrbatState(r.state.orbat, units), []);
  assert.deepEqual(parseSave(serializeSave(r.state)).state, r.state);
  assert.throws(() => playerAttach(s, { unitId: units.find((x) => x.nation === 'FRA' && x.category === 'infantry').id, parentId: corps, units }), /FRA|giocatore/);
  assert.equal(playerDetach(r.state, div, { units }).state.orbat.links[div], undefined);
  assert.equal(unassigned(s.orbat, units, '1936-01-01', { nation: 'DEU' }).length > 0, true, 'nessun inquadramento storico dato per scontato');
});
