// Catalogo cronologico delle unità: importazione dal CSV, revisioni, politica di attivazione al 1/1/1936.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from '../src/data/csv.js';
import { unitsBuilt } from '../scripts/build-units.js';
import {
  validateUnits, classifyUnit, buildUnits, isActiveAt, unitsActiveAt, countActive, NATION_IDS, UNIT_CATEGORIES, validateOobEstimates, normalizeUnitName, parseOob1936Csv, mergeOob1936, makeDivisionPlaceholders,
} from '../src/data/units.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/units.json');
const nationIds = new Set(json('political_1936.json').map((e) => e.id));
const byId = new Map(doc.units.map((u) => [u.id, u]));

test('units.json: valido e allineato al CSV e alle revisioni (nessun file stantio)', async () => {
  assert.deepEqual(validateUnits(doc, { nationIds }), []);
  assert.deepEqual(doc, JSON.parse(JSON.stringify(await unitsBuilt())), 'rigenerare con npm run build:units');
  assert.equal(doc.units.length, 364 + 20 + 33 + 49 + 46, '364 CSV + Francia 20 + Germania 33 + URSS 49 + 46 segnaposto fucilieri');
  const src = Object.fromEntries(doc.sources1936.map((x) => [x.nation, x]));
  assert.deepEqual(Object.keys(src).sort(), ['DEU', 'FRA', 'USSR']);
  assert.equal(src.FRA.repairedRows, 32, 'virgola in più delle righe terrestri del file francese');
  assert.deepEqual(src.FRA.notImported.map((x) => x.type).sort(), ['Aviazione navale', 'Divisione aerea', 'Divisione aerea', 'Divisione aerea', 'Raggruppamento coloniale', 'Sommergibili', 'Squadra navale', 'Squadra navale']);
  assert.deepEqual(src.DEU.malformedRows.map((x) => x.name), ['Flotte del Mare del Nord', 'Flotta del Baltico'], 'righe navali con campi spostati: non lette');
  assert.equal(src.USSR.malformedRows.length, 5, 'le 5 righe navali sovietiche hanno 14 campi: non lette');
  for (const x of doc.sources1936) assert.equal(x.sha256, createHash('sha256').update(readFileSync(new URL(`../data/units/${x.file}`, import.meta.url))).digest('hex'));
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

test('conteggio 1936: Francia dal file utente, Italia e USA ancora scarse', () => {
  const n = countActive(doc.units, '1936-01-01');
  assert.deepEqual(n.DEU, { infantry: 30, armored: 3 });
  assert.deepEqual(n.FRA, { infantry: 20, cavalry: 4, mechanized: 1 }, 'le DIC e la 5ª cavalleria restano inattive (data dubbia)');
  assert.deepEqual(n.ITA, { mountain: 4 }, 'manca la Pusteria (5ª alpina) citata in UNITA_E_PRODUZIONE.md');
});

test('Francia: le divisioni che diventano motorizzate non si contano due volte', () => {
  const at = (d) => countActive(doc.units, d).FRA;
  assert.equal(at('1938-12-31').infantry, 20);
  const d3 = doc.units.find((u) => u.name === "3e Division d'infanterie");
  assert.equal(d3.supersededBy, 'U00048'); assert.equal(d3.endYear, 1938);
  assert.equal(at('1939-09-01').motorized, 5);
  assert.ok(doc.units.find((u) => u.id === 'U00035').review.basis === 'user_file', 'data anticipata dal file utente, non certa');
});

test('mergeOob1936 e parseOob1936Csv: riparazione ammessa solo per la virgola in più', () => {
  assert.equal(normalizeUnitName("1re Division d'infanterie"), normalizeUnitName("1re Division d'Infanterie"));
  assert.equal(normalizeUnitName('1ère Division'), normalizeUnitName('1re Division'));
  const head = 'a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,data_riferimento,note';
  const ok = `${head}\nx,x,x,x,x,x,x,,,,,,,n,,,1936-01-01,nota`;
  assert.equal(parseOob1936Csv(ok).repaired, 1);
  assert.equal(parseOob1936Csv(ok).rows[0].data_riferimento, '1936-01-01');
  const odd = parseOob1936Csv(`${head}\nx,x,x,x,x,x,x,x,x,x,x,x,x,n,,1936-01-01,nota\ny,z`);
  assert.equal(odd.rows.length, 1); assert.deepEqual(odd.malformed, [{ line: 3, name: 'y', type: 'z', fields: 2 }]);
  assert.throws(() => parseOob1936Csv(`${head}\ny,z`), /nessuna riga valida/);
  const row = { unita: 'Nuova Division d\'infanterie', tipo_unita: 'Divisione fanteria', provincia_stazione: 'p', corpo_assegnazione: 'c', armata_assegnazione: 'a', data_riferimento: '1936-01-01', note_fonte: '' };
  const m = mergeOob1936([row, { ...row, unita: 'Flotte', tipo_unita: 'Squadra navale' }], [], { nation: 'FRA' });
  assert.equal(m.units.length, 1); assert.equal(m.units[0].id, 'S36-FRA-001'); assert.equal(m.skipped.length, 1);
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

test('stime aggregate 1936: nazioni esistenti, intervalli validi, fonte e certezza dichiarate', () => {
  const rows = parseCsv(readFileSync(new URL('../data/units/oob_1936_stime.csv', import.meta.url), 'utf8'), { name: 'oob_1936_stime' });
  assert.deepEqual(validateOobEstimates(rows, { nationIds }), []);
  const bad = { nation: 'ZZZ', category: 'ufo', echelon: 'x', count_min: '5', count_max: '3', confidence: 'forse', source: '' };
  assert.equal(validateOobEstimates([bad], { nationIds }).length, 6);
  assert.ok(validateOobEstimates([], { nationIds }).some((e) => /vuoto/.test(e)));
});

test('Germania e URSS 1936: Germania invariata, divisioni dubbie e corpi non verificati inattivi', () => {
  const at = (id, d = '1936-01-01') => isActiveAt(byId.get(id), d);
  const named = (n) => doc.units.find((u) => u.name === n);
  const act = (n) => isActiveAt(named(n), '1936-01-01');
  assert.deepEqual(countActive(doc.units, '1936-01-01').DEU, { infantry: 30, armored: 3 }, 'invariata: 31ª–36ª e cavalleria restano dubbie');
  assert.equal(act('36. Infanterie-Division'), false); assert.equal(act('2. Kavallerie-Division'), false);
  assert.equal(act('Wehrkreis I'), true, 'i distretti sono comandi attivi');
  assert.equal(named('Wehrkreis I').commandLevel, 'district'); assert.equal(named('XII. Armeekorps').commandLevel, 'corps');
  assert.equal(at('U00061'), false);
  const ussr = countActive(doc.units, '1936-01-01', { includeCommands: true }).USSR;
  assert.equal(ussr.command, 13, '12 distretti + Black Sea Fleet (1935)');
  assert.equal(ussr.airborne, 3);
  assert.equal(act('1° Corpo meccanizzato'), false, 'numerazione in conflitto con Wikipedia (11º e 45º)');
  assert.equal(act('7° Corpo di cavalleria'), false); assert.equal(act('23° Corpo fucilieri'), false);
});

test('segnaposto fucilieri URSS: 46 divisioni anonime inattive, 2 per corpo, template senza numeri inventati', () => {
  const ph = doc.units.filter((u) => u.placeholder);
  assert.equal(ph.length, 46);
  assert.ok(ph.every((u) => u.nation === 'USSR' && u.category === 'infantry' && u.variant === 'rifle' && u.review.status === 'placeholder' && !isActiveAt(u, '1936-01-01')));
  assert.ok(ph.every((u) => isActiveAt(u, '1936-01-01', { policy: 'all' })), 'solo la politica strict li esclude');
  assert.equal(ph.filter((u) => u.corps === '1° Corpo fucilieri').length, 2);
  assert.equal(new Set(ph.map((u) => u.corps)).size, 23);
  assert.equal(countActive(doc.units, '1936-01-01').USSR.infantry, 15, 'i segnaposto non entrano nel conteggio');
  const tpl = json('units/templates/divisione_fucilieri_urss_1936.json');
  assert.equal(tpl.status, 'DA_DEFINIRE');
  assert.ok([tpl.manpowerPeace, tpl.manpowerWar, tpl.regimentsInfantry, ...Object.values(tpl.equipmentCategories)].every((v) => v === null), 'nessun valore inventato');
  const two = makeDivisionPlaceholders({ nation: 'USSR', idPrefix: 'S36-USSR-F', namePrefix: 'X', category: 'infantry', variant: 'rifle', corps: ['a', 'b'], perCorps: 3, startYear: 1936, reason: 'r' });
  assert.deepEqual(two.map((u) => u.corps), ['a', 'a', 'a', 'b', 'b', 'b']);
  assert.equal(two[5].id, 'S36-USSR-F-006');
});

test('riferimenti template divisioni: ogni valore ha anno e fonte, nessun dato 1936 non verificato spacciato per certo', () => {
  const ref = json('units/templates/divisioni_1936_riferimenti.json');
  assert.equal(ref.status, 'DA_VERIFICARE');
  const leaves = [];
  const walk = (o, path) => {
    if (o && typeof o === 'object' && 'referenceYear' in o) { leaves.push([path, o]); return; }
    if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  walk(ref.nations, 'nations');
  assert.ok(leaves.length > 30);
  for (const [path, l] of leaves) {
    assert.ok(String(l.source ?? '').trim(), `${path}: senza fonte`);
    assert.ok(['verificato', 'non_verificato'].includes(l.appliesTo1936), path);
    if (l.value === null) assert.equal(l.referenceYear, null, `${path}: valore nullo con anno`);
    else assert.ok(Number.isInteger(l.referenceYear), `${path}: manca l'anno di riferimento`);
    if (l.appliesTo1936 === 'verificato') assert.ok(l.referenceYear <= 1939, `${path}: verificato per il 1936 ma anno ${l.referenceYear}`);
  }
  assert.equal(ref.nations.USA.formation.value, 'square');
  assert.equal(ref.nations.DEU.artillery.totalGuns.value, 48);
});
