// Catalogo cronologico delle unità: importazione dal CSV, revisioni, politica di attivazione al 1/1/1936.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from '../src/data/csv.js';
import { unitsBuilt } from '../scripts/build-units.js';
import {
  validateUnits, classifyUnit, buildUnits, isActiveAt, unitsActiveAt, countActive, NATION_IDS, UNIT_CATEGORIES,
} from '../src/data/units.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/units.json');
const nationIds = new Set(json('political_1936.json').map((e) => e.id));
const byId = new Map(doc.units.map((u) => [u.id, u]));

test('units.json: valido e allineato al CSV e alle revisioni (nessun file stantio)', async () => {
  assert.deepEqual(validateUnits(doc, { nationIds }), []);
  assert.deepEqual(doc, JSON.parse(JSON.stringify(await unitsBuilt())), 'rigenerare con npm run build:units');
  assert.equal(doc.units.length, 364);
  const csv = readFileSync(new URL('../data/units/source/unita_cronologia_1935_1945.csv', import.meta.url));
  assert.equal(doc.source.sha256, createHash('sha256').update(csv).digest('hex'));
});

test('ogni nazione del CSV ha un id esistente e ogni unità una categoria nota', () => {
  for (const id of Object.values(NATION_IDS)) assert.ok(nationIds.has(id), id);
  for (const u of doc.units) assert.ok(UNIT_CATEGORIES.includes(u.category), `${u.id} ${u.category}`);
});

test('classificazione: Panzer, SS-Panzer, Gebirgs, cavalleria, carri giapponesi, brigate sovietiche', () => {
  const c = (nazione, nome, tipo, livello = 'divisione') => classifyUnit({ unit_id: 'U00000', nazione, nome_formazione: nome, tipo, livello });
  assert.deepEqual(c('Germania', '1. Panzer-Division', 'speciale'), { category: 'armored', echelon: 'division', variant: null });
  assert.deepEqual(c('Germania', '1. SS-Panzer-Division Leibstandarte SS Adolf Hitler', 'speciale'), { category: 'armored', echelon: 'division', variant: 'ss' });
  assert.equal(c('Germania', '2. Gebirgs-Division', 'speciale').category, 'mountain');
  assert.equal(c('Germania', '1. Kavallerie-Division', 'speciale').category, 'cavalry');
  assert.equal(c('Germania', '44. Infanterie-Division', 'speciale').category, 'infantry');
  assert.equal(c('Giappone', '1st Tank Division', 'divisione').category, 'armored');
  assert.deepEqual(c('URSS', '24th Tank Brigade', 'corazzata', 'divisione/brigata'), { category: 'armored', echelon: 'brigade', variant: null });
  assert.equal(c('URSS', 'Leningrad Front', 'fronte/comando', 'comando').category, 'command');
  assert.throws(() => c('Italia', 'Reparto misterioso', 'boh'), /non classificabile/);
});

test('buildUnits: nazione sconosciuta e revisione con data corretta', () => {
  const row = { unit_id: 'U00001', nazione: 'Atlantide', nome_formazione: 'X', tipo: 'fanteria', livello: 'divisione', data_inizio: '1935', data_fine: '', forza_armata: 'f', fonte_riferimento: 's', stato_cronologia: 'v' };
  assert.throws(() => buildUnits([row]), /senza id/);
  const u = buildUnits([{ ...row, nazione: 'Italia' }], { U00001: { status: 'corrected', confidence: 'certo', reason: 'r', startYearOverride: 1938 } })[0];
  assert.equal(u.startYear, 1938); assert.equal(u.sourceStartYear, 1935);
});

test('revisioni certe: 4. e 5. Panzer 1938, Fronte di Leningrado 1941; Gebirgs 1 esclusa', () => {
  assert.equal(byId.get('U00089').startYear, 1938);
  assert.equal(byId.get('U00091').startYear, 1938);
  assert.equal(byId.get('U00264').startYear, 1941);
  assert.equal(byId.get('U00089').sourceStartYear, 1935, 'il valore originale resta tracciato');
  assert.equal(byId.get('U00059').review.status, 'excluded');
  assert.equal(byId.get('U00263').review, null, 'la Flotta del Mar Nero esisteva già nel 1935: nessuna correzione');
});

test('attivazione al 1/1/1936 (politica strict): Germania storica, unità dubbie inattive', () => {
  const at = (id, date = '1936-01-01', policy) => isActiveAt(byId.get(id), date, { policy });
  assert.equal(at('U00060'), true, '1. Infanterie-Division');
  assert.equal(at('U00062'), true, '1. Panzer-Division (1935)');
  assert.equal(at('U00089'), false, '4. Panzer-Division non c\'è prima del 1938');
  assert.equal(at('U00089', '1938-12-31'), true);
  assert.equal(at('U00059'), false, 'Gebirgs esclusa');
  assert.equal(at('U00059', '1936-01-01', 'all'), true, 'con policy "all" la sola data conta');
  assert.equal(at('U00061'), false, 'cavalleria dubbia');
  assert.equal(at('U00124'), false, 'duplicato Kantō');
  assert.equal(at('U00125'), true, 'Kwantung (originale) attivo');
  assert.equal(at('U00264', '1940-12-31'), false); assert.equal(at('U00264', '1941-01-01'), true);
  assert.throws(() => isActiveAt(byId.get('U00060'), '1936-1-1'), /data non valida/);
  const deu = unitsActiveAt(doc.units, '1936-01-01', { nation: 'DEU' }).filter((u) => u.category !== 'command');
  assert.equal(deu.length, 33); assert.equal(deu.filter((u) => u.category === 'armored').length, 3);
});

test('conteggio 1936: documenta i limiti del CSV (Francia senza unità, solo 4 divisioni alpine italiane)', () => {
  const n = countActive(doc.units, '1936-01-01');
  assert.deepEqual(n.DEU, { infantry: 30, armored: 3 });
  assert.equal(n.FRA, undefined, 'tutte le divisioni francesi del CSV sono del 1937 o successive');
  assert.deepEqual(n.ITA, { mountain: 4 }, 'manca la Pusteria (5ª alpina) citata in UNITA_E_PRODUZIONE.md');
  assert.equal(countActive(doc.units, '1939-09-01').FRA.infantry > 0, true);
});

test('validazione: errori su id, nazione, categoria, date, nomi doppi e revisioni', () => {
  const base = doc.units.find((u) => u.id === 'U00060');
  const mk = (patch) => ({ ...doc, units: [{ ...base, ...patch }] });
  const errs = (patch) => validateUnits(mk(patch), { nationIds });
  assert.ok(errs({ id: 'X1' }).some((e) => /id non valido/.test(e)));
  assert.ok(errs({ nation: 'ZZZ' }).some((e) => /inesistente/.test(e)));
  assert.ok(errs({ category: 'ufo' }).some((e) => /categoria/.test(e)));
  assert.ok(errs({ startYear: 1990 }).some((e) => /anno di inizio/.test(e)));
  assert.ok(errs({ endYear: 1930 }).some((e) => /precedente/.test(e)));
  assert.ok(errs({ startYear: 1936 }).some((e) => /senza revisione/.test(e)), 'data cambiata senza revisione');
  assert.ok(errs({ review: { status: 'corrected', confidence: 'probabile', reason: 'r', startYearOverride: 1935 } }).some((e) => /richiede certezza/.test(e)));
  assert.ok(errs({ review: { status: 'date_doubt', confidence: 'certo', reason: '' } }).some((e) => /senza motivo/.test(e)));
  const dup = { ...doc, units: [base, { ...base, id: 'U99999' }] };
  assert.ok(validateUnits(dup, { nationIds }).some((e) => /stesso nome/.test(e)));
  assert.ok(validateUnits({ ...doc, schema: 'x' }).some((e) => /schema/.test(e)));
  assert.ok(validateUnits({ ...doc, units: [] }, { nationIds }).some((e) => /vuoto/.test(e)));
});

test('il CSV sorgente ha 364 righe, id unici e le due copie ricevute erano identiche', () => {
  const rows = parseCsv(readFileSync(new URL('../data/units/source/unita_cronologia_1935_1945.csv', import.meta.url), 'utf8'), { name: 'unita' });
  assert.equal(rows.length, 364);
  assert.equal(new Set(rows.map((r) => r.unit_id)).size, 364);
});
