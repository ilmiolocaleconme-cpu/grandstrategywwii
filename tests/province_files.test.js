import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { checkProvinceParts, fileName, LOAD_DEFAULTS, loadProvincesFrom, mergeProvinceParts, META_SCHEMA } from '../src/data/provinces.js';
import { listProvinceFiles, loadProvinces } from '../scripts/load-provinces.js';
import { checkPrecache, hasMarker, precacheUrls, provinceMarkers } from '../scripts/check-precache.js';
import { loadingPercent } from '../src/ui/loadingPercent.js';
import { buildMapModel, nationalBorderPath } from '../src/map/geo.js';
import { vistaProvince, madreId } from './famiglie.js';

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

test('caricamento: i file partono insieme (entro il limite), prima che il primo sia finito', async () => {
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
    loadProvincesFrom({ 'x/_meta.json': ok(meta()), 'x/AAA.json': fail, 'x/BBB.json': fail }, undefined, FAST),
    (e) => e.failed.join() === 'AAA,BBB' && /AAA\.json, BBB\.json/.test(e.message),
  );
  await assert.rejects(loadProvincesFrom({ 'x/AAA.json': ok(parts().AAA) }), /manca _meta\.json/);
});

const FAST = { sleep: async () => {} };

test('caricamento: un file che fallisce una volta viene riprovato e la mappa parte', async () => {
  let attempts = 0;
  const flaky = async () => { attempts += 1; if (attempts < 3) throw new Error('rete'); return { default: parts().AAA }; };
  const merged = await loadProvincesFrom({
    '../../data/provinces/_meta.json': async () => ({ default: meta() }),
    '../../data/provinces/AAA.json': flaky,
    '../../data/provinces/BBB.json': async () => ({ default: parts().BBB }),
  }, undefined, FAST);
  assert.equal(attempts, 3, 'due fallimenti e un successo');
  assert.equal(merged.features.length, 3);
});

test('caricamento: dopo i tentativi un file sempre rotto fa fallire tutto, con 1 + retries tentativi', async () => {
  let attempts = 0;
  const broken = async () => { attempts += 1; throw new Error('404'); };
  await assert.rejects(
    loadProvincesFrom({ '../../data/provinces/_meta.json': async () => ({ default: meta() }), '../../data/provinces/AAA.json': broken }, undefined, FAST),
    (e) => e.failed.join() === 'AAA',
  );
  assert.equal(attempts, 1 + LOAD_DEFAULTS.retries);
});

test('caricamento: mai più richieste insieme del limite di concorrenza', async () => {
  let running = 0;
  let peak = 0;
  const mod = (value) => async () => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((r) => setImmediate(r));
    running -= 1;
    return { default: value };
  };
  const modules = { '../../data/provinces/_meta.json': mod(meta()) };
  for (let i = 0; i < 20; i += 1) modules[`../../data/provinces/F${i}.json`] = mod({ type: 'FeatureCollection', owner: 'AAA', features: [] });
  await loadProvincesFrom(modules, undefined, { ...FAST, concurrency: 4 }).catch(() => {});
  assert.ok(peak <= 4, `picco di richieste insieme: ${peak}`);
  assert.ok(peak >= 2, 'ma non sequenziale');
});

test('fileName ricava il nome dal percorso', () => {
  assert.equal(fileName('../../data/provinces/DEU.json'), 'DEU');
  assert.equal(fileName('assets/_meta.json'), '_meta');
});

// --- dati reali ---

const EXPECTED = { DEU: 32, POL: 16, AUT: 8, BEL: 9, LUX: 3, CZE: 4, NLD: 11, ITA: 62, YUG: 33, DANZIG: 1, CHE: 25, LIE: 1, FRA: 91, HUN: 20, ROM: 45, BGR: 25, GRC: 14, ALB: 12, ESP: 50, PRT: 22, MAR: 12, MAR_ES: 1, GBR: 94, ALG: 19, TUN: 23, LBA: 5, EGY: 27, PAL: 8, JOR: 12, SYR: 15, LBN: 6, TUR: 80, CYP: 6, MLT: 1, GIB: 1, EST: 10, LVA: 6, LTU: 11, DNK: 5, NOR: 20, SWE: 21, FIN: 19, USSR: 177, IRL: 5, ISL: 1, CAN: 12, NFL: 1, USA: 53, MAL: 13, NLD_EI: 33, COD: 11, CHN: 27, MAN: 3, TIB: 1, AFG: 34, IRN: 31, IRQ: 18, SAU: 13, YEM: 20, MNG: 22, ETH: 10, LBR: 15, ARG: 23, BOL: 9, BRA: 28, COL: 32, CRI: 8, CUB: 16, DOM: 31, ECU: 24, SLV: 14, GTM: 22, HTI: 10, HND: 17, MEX: 33, NIC: 17, PAN: 12, PRY: 17, PER: 25, URY: 19, VEN: 23, AUS: 10, NZL: 6, ZAF: 9, BTN: 1, JPN: 48, KEN: 8, NGA: 37, GHA: 10, SLE: 4, UGA: 4, MWI: 6, SEN: 14, MRT: 13, MLI: 8, NER: 8, BFA: 13, CIV: 19, GIN: 7, BEN: 11, GAB: 9, COG: 11, CAF: 16, TCD: 21, MDG: 22, DJI: 1, AGO: 18, MOZ: 10, GNB: 7, CPV: 1, STP: 1, SUR: 8, ERI: 6, SOM: 12, TWN: 4, NRU: 1, WSM: 1, GNQ: 1, GRL: 6, CMR: 10, TGO: 1, TZA: 26, PHL: 17, NEP: 14, SIA: 6, CHL: 17, CEY: 9, BUR: 14, GAM: 1, ZAM: 10, ZIM: 9, BOT: 9, LES: 1, SWZ: 1, MAU: 1, SEY: 1, TIM: 1, SWA: 13, NHEB: 1, IND: 48, SUD: 27, INDO: 54, RWA: 21, KOR: 24, PAP: 5, NGU: 14, ESH: 2, OMN: 11, BGU: 10, FGU: 1, BLZ: 6, JAM: 1, TTO: 1, BHS: 1, ANTB: 7, ANTF: 2, RUN: 1, COM: 2, FLK: 2, FJI: 5, SLB: 10, NCL: 3, PYF: 1, KUW: 1, QAT: 1, BHR: 1, TRU: 1, BSO: 1, BNB: 4, PRI: 1, SVA: 1, FRO: 1, MDV: 1, GUM: 1, HKG: 1, ANT: 3, JPN_MANDATE: 4, KAR: 1 };

test('dati reali: un file per nazione più _meta, nessun file monolitico', async () => {
  const names = (await listProvinceFiles()).map(fileName).sort();
  assert.deepEqual(names, [...Object.keys(EXPECTED), '_meta'].sort());
  assert.equal(existsSync(new URL('../data/provinces_1936.json', import.meta.url)), false, 'il file unico non deve tornare: duplicherebbe i dati');
});

test('dati reali: unione di 3088 pezzi (2602 province, di cui molte divise in sponde, senza le sponde sotto 200 km²), conteggi per nazione, id unici, owner = file', async () => {
  const merged = await loadProvinces();
  // Sofia città è ora nel livello delle città (data/citta_grandi.json), non nel file della Bulgaria
  assert.equal(merged.features.length, 3088);
  const counts = {};
  for (const f of vistaProvince(merged).features) counts[f.properties.owner] = (counts[f.properties.owner] ?? 0) + 1;
  assert.deepEqual(counts, EXPECTED);
  assert.equal(new Set(merged.features.map((f) => f.properties.id)).size, 3088);
  assert.equal(merged.metadata.asOf, '1936-01-01');
  // le tre province che nel vecchio file unico stavano fuori dal blocco della propria nazione
  const owner = (id) => merged.features.find((f) => madreId(f.properties.id) === id)?.properties.owner;
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

test('precache: un dato che cita solo alcuni id di un file (sideA in crossings.json) non è quel file', () => {
  const ids = ['P_DEU_A', 'P_DEU_B', 'P_DEU_C'];
  const crossingsText = '{"sideA":"P_DEU_A","sideB":"P_DEU_B"}';
  const provinceText = 'JSON.parse("[{\\"id\\":\\"P_DEU_A\\"},{\\"id\\":\\"P_DEU_B\\"},{\\"id\\":\\"P_DEU_C\\"}]")';
  assert.equal(hasMarker(crossingsText, ids), false);
  assert.equal(hasMarker(provinceText, ids), true);
  // una sentinella singola (stringa) resta una semplice ricerca di testo, es. _meta
  assert.equal(hasMarker('..provinces-meta-v1..', 'provinces-meta-v1'), true);
  assert.equal(hasMarker('niente', 'provinces-meta-v1'), false);
  // bundle principale con crossings.json + chunk con tutti i dati del file: nessun errore
  const chunks = { 'assets/index-1.js': crossingsText, 'assets/DEU-2.js': provinceText };
  assert.deepEqual(checkPrecache({ chunks, swText: SW, markers: { DEU: ids } }), []);
  // i dati del file nel bundle principale insieme al resto restano un errore
  assert.match(checkPrecache({ chunks: { ...chunks, 'assets/index-1.js': `${crossingsText}${provinceText}` }, swText: SW, markers: { DEU: ids } }).join('|'), /presente in più chunk/);
  // un chunk con solo alcuni id non basta: il file risulta non trovato
  assert.match(checkPrecache({ chunks: { 'assets/index-1.js': crossingsText }, swText: SW, markers: { DEU: ids } }).join('|'), /DEU\.json: non trovato/);
});

test('precache: le sentinelle dei dati reali esistono, sono distinte e non stanno nel codice', async () => {
  const markers = await provinceMarkers();
  assert.equal(Object.keys(markers).length, 179);
  assert.equal(markers._meta.length, 30);
  assert.equal(readFileSync(new URL('../src/data/provinces.js', import.meta.url), 'utf8').includes(markers._meta), false, 'la sentinella di _meta non deve comparire nel codice dell\'app');
  assert.equal(new Set(Object.values(markers).map((v) => JSON.stringify(v))).size, 179);
  const idsDeu = markers.DEU.filter((m) => m.startsWith('P_DEU_'));
  assert.equal(idsDeu.length > 10, true);
  // per le nazioni piccole le sentinelle includono anche il testo della fonte (assente nei dati delle città, che citano solo gli id delle madri)
  for (const name of ['LIE', 'ISL']) assert.equal(markers[name].length > markers[name].filter((m) => m.startsWith(`P_${name}_`)).length, true, `${name}: manca la fonte nella sentinella`);
  const cities = readFileSync(new URL('../data/citta_grandi.json', import.meta.url), 'utf8');
  for (const name of ['LIE', 'ISL']) assert.equal(hasMarker(cities, markers[name]), false, `${name}: il file delle città non deve sembrare il file delle province`);
});

test('caricamento: l\'avanzamento parte da 0/totale, cresce di uno a file (anche se fallisce) e finisce a totale/totale', async () => {
  const ok = (value) => async () => ({ default: value });
  const modules = {
    '../../data/provinces/_meta.json': ok(meta()),
    '../../data/provinces/AAA.json': ok(parts().AAA),
    '../../data/provinces/BBB.json': ok(parts().BBB),
  };
  const calls = [];
  await loadProvincesFrom(modules, (d, t) => calls.push([d, t]));
  assert.deepEqual(calls, [[0, 3], [1, 3], [2, 3], [3, 3]]);
  const failing = { ...modules, '../../data/provinces/BBB.json': async () => { throw new Error('offline'); } };
  const calls2 = [];
  await assert.rejects(loadProvincesFrom(failing, (d, t) => calls2.push([d, t]), FAST), /BBB\.json/);
  assert.deepEqual(calls2.at(-1), [3, 3]);
});

test('barra di caricamento: percentuale limitata a 0..100 e 0 se il totale è ignoto', () => {
  assert.equal(loadingPercent(0, 0), 0);
  assert.equal(loadingPercent(1, 3), 33);
  assert.equal(loadingPercent(3, 3), 100);
  assert.equal(loadingPercent(5, 3), 100);
  assert.equal(loadingPercent(-1, 3), 0);
});
