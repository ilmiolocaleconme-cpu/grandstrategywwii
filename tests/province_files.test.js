import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { checkProvinceParts, fileName, loadProvincesFrom, mergeProvinceParts, META_SCHEMA } from '../src/data/provinces.js';
import { listProvinceFiles, loadProvinces } from '../scripts/load-provinces.js';
import { checkPrecache, hasMarker, precacheUrls, provinceMarkers } from '../scripts/check-precache.js';
import { buildMapModel, nationalBorderPath } from '../src/map/geo.js';

// Fixture sintetiche SOLO per i test: non sono dati geografici storici.
const feat = (id, owner) => ({ type: 'Feature', id, properties: { id, owner }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
const part = (owner, ...ids) => ({ type: 'FeatureCollection', owner, features: ids.map((id) => feat(id, owner)) });
const meta = (order = ['AAA', 'BBB']) => ({ schema: META_SCHEMA, order, metadata: { asOf: '1936-01-01' } });
const parts = () => ({ AAA: part('AAA', 'P_AAA_1', 'P_AAA_2'), BBB: part('BBB', 'P_BBB_1') });

test('unione: ordine di _meta.order, poi ordine del file; metadati conservati', () => {
  const merged = mergeProvinceParts(meta(['BBB', 'AAA']), parts());
  assert.deepEqual(merged.features.map((f) => f.properties.id), ['P_BBB_1', 'P_AAA_1', 'P_AAA_2']);
  assert.equal(merged.type, 'FeatureCollection');
  assert.deepEqual(merged.metadata, { asOf: '1936-01-01' });
});

test('unione: rileva file mancante, file non elencato, owner sbagliato, id duplicato, schema errato', () => {
  const run = (m, p) => checkProvinceParts(m, p);
  assert.match(run(meta(['AAA', 'BBB', 'CCC']), parts()).join('|'), /manca il file CCC\.json/);
  assert.match(run(meta(['AAA']), parts()).join('|'), /BBB\.json non è elencato/);
  const wrongOwner = parts();
  wrongOwner.BBB.features.push(feat('P_AAA_9', 'AAA'));
  assert.match(run(meta(), wrongOwner).join('|'), /"P_AAA_9" ha owner "AAA" ma sta in BBB\.json/);
  const dup = parts();
  dup.BBB.features.push(feat('P_AAA_1', 'BBB'));
  assert.match(run(meta(), dup).join('|'), /id duplicato "P_AAA_1" \(AAA\.json e BBB\.json\)/);
  assert.match(run({ ...meta(), schema: 'x' }, parts()).join('|'), /_meta\.schema/);
  assert.match(run(meta(['AAA', 'AAA']), parts()).join('|'), /duplicati/);
  const badOwnerField = parts();
  badOwnerField.AAA.owner = 'ZZZ';
  assert.match(run(meta(), badOwnerField).join('|'), /AAA\.json dichiara owner "ZZZ"/);
  assert.throws(() => mergeProvinceParts(meta(), dup), (e) => Array.isArray(e.errors) && e.errors.length === 1 && /Province non valide/.test(e.message));
});

test('caricamento: tutti i file partono subito, in parallelo, prima che il primo sia finito', async () => {
  let started = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const mod = (value) => async () => { started += 1; await gate; return { default: value }; };
  const modules = {
    '../../data/provinces/_meta.json': mod(meta()),
    '../../data/provinces/AAA.json': mod(parts().AAA),
    '../../data/provinces/BBB.json': mod(parts().BBB),
  };
  const promise = loadProvincesFrom(modules);
  await new Promise((r) => setImmediate(r));
  assert.equal(started, 3, 'nessun caricamento sequenziale');
  release();
  const merged = await promise;
  assert.equal(merged.features.length, 3);
});

test('caricamento: se un file manca la mappa non parte e l\'errore li elenca tutti', async () => {
  const ok = (value) => async () => ({ default: value });
  const fail = async () => { throw new Error('offline'); };
  await assert.rejects(
    loadProvincesFrom({ 'x/_meta.json': ok(meta()), 'x/AAA.json': fail, 'x/BBB.json': fail }),
    (e) => e.failed.join() === 'AAA,BBB' && /AAA\.json, BBB\.json/.test(e.message),
  );
  await assert.rejects(loadProvincesFrom({ 'x/AAA.json': ok(parts().AAA) }), /manca _meta\.json/);
});

test('fileName ricava il nome dal percorso', () => {
  assert.equal(fileName('../../data/provinces/DEU.json'), 'DEU');
  assert.equal(fileName('assets/_meta.json'), '_meta');
});

// --- dati reali ---

const EXPECTED = { DEU: 32, POL: 16, AUT: 8, BEL: 9, LUX: 3, CZE: 4, NLD: 11, ITA: 20, YUG: 33, DANZIG: 1, EST: 10, LVA: 6, LTU: 11, DNK: 5, NOR: 19, SWE: 21, FIN: 19, CHE: 25, LIE: 1, FRA: 90, HUN: 20, ROM: 45, BGR: 26, GRC: 14, ALB: 12, ESP: 50, MAR_ES: 1, PRT: 22, MAR: 12, GBR: 88, ALG: 48, TUN: 23, LBA: 5, EGY: 27, PAL: 8, JOR: 12, SYR: 15, LBN: 6, TUR: 80, CYP: 6, MLT: 1, GIB: 1, USSR: 177 };

test('dati reali: un file per nazione più _meta, nessun file monolitico', async () => {
  const names = (await listProvinceFiles()).map(fileName).sort();
  assert.deepEqual(names, [...Object.keys(EXPECTED), '_meta'].sort());
  assert.equal(existsSync(new URL('../data/provinces_1936.json', import.meta.url)), false, 'il file unico non deve tornare: duplicherebbe i dati');
});

test('dati reali: unione di 1043 province, conteggi per nazione, id unici, owner = file', async () => {
  const merged = await loadProvinces();
  assert.equal(merged.features.length, 1043);
  const counts = {};
  for (const f of merged.features) counts[f.properties.owner] = (counts[f.properties.owner] ?? 0) + 1;
  assert.deepEqual(counts, EXPECTED);
  assert.equal(new Set(merged.features.map((f) => f.properties.id)).size, 1043);
  assert.equal(merged.metadata.asOf, '1936-01-01');
  // le tre province che nel vecchio file unico stavano fuori dal blocco della propria nazione
  const owner = (id) => merged.features.find((f) => f.properties.id === id)?.properties.owner;
  assert.deepEqual(['P_CZE_SLOVAKIA', 'P_ITA_ZARA', 'P_ITA_DODECANESO'].map(owner), ['CZE', 'ITA', 'ITA']);
});

test('dati reali: l\'unione è una sola collezione e il modello della mappa non dipende dall\'ordine dei file', async () => {
  const merged = await loadProvinces();
  assert.equal(buildMapModel(merged), buildMapModel(merged), 'stesso oggetto, un solo modello in cache');
  const reversed = { ...merged, features: [...merged.features].reverse() };
  const sub = (d) => d.split('M').filter(Boolean).sort();
  assert.deepEqual(sub(nationalBorderPath(reversed)), sub(nationalBorderPath(merged)));
  assert.equal(sub(nationalBorderPath(merged)).length > 0, true);
});

// --- precache ---

const SW = 'precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/index-1.js",revision:null},{url:"assets/DEU-2.js",revision:null},{"url":"assets/_meta-3.js","revision":null}])';

test('precache: legge gli indirizzi di un sw.js minificato', () => {
  assert.deepEqual([...precacheUrls(SW)].sort(), ['assets/DEU-2.js', 'assets/_meta-3.js', 'assets/index-1.js', 'index.html']);
  assert.equal(precacheUrls('nulla').size, 0);
});

// Forme in cui un id di provincia compare in un chunk: oggetto minificato, JSON.parse("...") con escape, JSON quotato.
const DEU_OBJ = '{id:"P_DEU_X",name:"A"}';
const DEU_ESC = 'JSON.parse("{\\"id\\":\\"P_DEU_X\\",\\"name\\":\\"A\\"}")';
const DEU_JSON = '{"id":"P_DEU_X"}';

test('precache: ogni file delle province deve stare in un chunk proprio e nel precache', () => {
  const markers = { DEU: 'P_DEU_X', _meta: 'provinces-meta-v1' };
  const chunks = { 'assets/index-1.js': 'app', 'assets/DEU-2.js': DEU_ESC, 'assets/_meta-3.js': '"provinces-meta-v1"' };
  assert.deepEqual(checkPrecache({ chunks, swText: SW, markers }), []);
  // chunk fuori dal precache
  assert.match(checkPrecache({ chunks: { ...chunks, 'assets/DEU-9.js': DEU_OBJ, 'assets/DEU-2.js': 'x' }, swText: SW, markers }).join('|'), /DEU-9\.js non è nel precache/);
  // dati finiti nel bundle principale insieme ad altri
  assert.match(checkPrecache({ chunks: { ...chunks, 'assets/index-1.js': `${DEU_OBJ} provinces-meta-v1` }, swText: SW, markers }).join('|'), /presente in più chunk/);
  // file non trovato nella build
  assert.match(checkPrecache({ chunks: { 'assets/index-1.js': 'app' }, swText: SW, markers }).join('|'), /DEU\.json: non trovato/);
  // due nazioni nello stesso chunk
  assert.match(checkPrecache({ chunks: { 'assets/index-1.js': 'app', 'assets/_meta-3.js': `${DEU_OBJ} provinces-meta-v1`, 'assets/DEU-2.js': DEU_OBJ }, swText: SW, markers }).join('|'), /contiene anche/);
  assert.match(checkPrecache({ chunks, swText: 'vuoto', markers }).join('|'), /nessun indirizzo nel precache/);
});

test('precache: un id citato da un altro dato (sideA in crossings.json) nel bundle principale non è un dato di provincia', () => {
  assert.equal(hasMarker(DEU_OBJ, 'P_DEU_X'), true);
  assert.equal(hasMarker(DEU_ESC, 'P_DEU_X'), true);
  assert.equal(hasMarker(DEU_JSON, 'P_DEU_X'), true);
  // riferimenti: non sono definizioni di provincia
  assert.equal(hasMarker('{"sideA":"P_DEU_X","sideB":"P_DEU_X"}', 'P_DEU_X'), false);
  assert.equal(hasMarker('{sideA:"P_DEU_X"}', 'P_DEU_X'), false);
  assert.equal(hasMarker('JSON.parse("[{\\"sideA\\":\\"P_DEU_X\\"}]")', 'P_DEU_X'), false);
  assert.equal(hasMarker('{riverId:"P_DEU_X"}', 'P_DEU_X'), false);
  // altro id con lo stesso prefisso: non deve combaciare
  assert.equal(hasMarker('{id:"P_DEU_XY"}', 'P_DEU_X'), false);
  // la sentinella di _meta (non è un id) resta una ricerca di testo
  assert.equal(hasMarker('..provinces-meta-v1..', 'provinces-meta-v1'), true);
  // bundle principale con crossings.json e senza dati di provincia: il controllo non lo conta
  const markers = { DEU: 'P_DEU_X' };
  const chunks = { 'assets/index-1.js': '{"sideA":"P_DEU_X"}', 'assets/DEU-2.js': DEU_ESC };
  assert.deepEqual(checkPrecache({ chunks, swText: SW, markers }), []);
});

test('precache: le sentinelle dei dati reali esistono, sono distinte e non stanno nel codice', async () => {
  const markers = await provinceMarkers();
  assert.equal(Object.keys(markers).length, 44);
  assert.equal(markers._meta.length, 30);
  assert.equal(readFileSync(new URL('../src/data/provinces.js', import.meta.url), 'utf8').includes(markers._meta), false, 'la sentinella di _meta non deve comparire nel codice dell\'app');
  assert.equal(new Set(Object.values(markers)).size, 44);
  assert.equal(markers.DEU.startsWith('P_DEU_'), true);
});
