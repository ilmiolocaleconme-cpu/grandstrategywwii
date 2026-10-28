import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROVINCE_DATASETS, provinceEntry, validateProvinceDataset } from '../src/data/provinceData.js';
import { PROVINCE_STATE_FIELDS, patchProvinceState, provinceStateOf, validateProvinceStates } from '../src/game/provinceState.js';
import { newGame, validateState } from '../src/game/state.js';
import { buildProvinceView, logisticsStatus, provinceLinkStats } from '../src/rules/provinceView.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { loadIndustryCatalog } from '../src/data/industry.js';

// Fixture sintetiche SOLO per i test: non sono dati storici.
const MOTHERS = new Set(['P_AAA_1', 'P_AAA_2']);
const file = (kind, byProvince = {}, over = {}) => ({ schema: PROVINCE_DATASETS[kind].schema, quality: 'DESIGN_DEFAULT', note: 'fixture', byProvince, ...over });
const errs = (kind, f, ctx = { motherIds: MOTHERS }) => validateProvinceDataset(kind, f, ctx).join('|');

test('dataset per provincia: file vuoto e voci valide passano', () => {
  assert.deepEqual(validateProvinceDataset('population', file('population'), { motherIds: MOTHERS }), []);
  assert.deepEqual(validateProvinceDataset('population', file('population', { P_AAA_1: { population: 1000, workforce: 400, growthPerYear: 0.01, quality: 'USER_ESTIMATE' } }), { motherIds: MOTHERS }), []);
  assert.deepEqual(validateProvinceDataset('agriculture', file('agriculture', { P_AAA_2: { potential: 7, wheatShare: 0.4 } }), { motherIds: MOTHERS }), []);
  assert.deepEqual(validateProvinceDataset('military', file('military', { P_AAA_1: { garrison: 500, hq: true, fortifications: 2, antiAir: 0, radar: 1, installations: ['INF-010'] } }), { motherIds: MOTHERS, structureIds: new Set(['INF-010']) }), []);
});

test('dataset per provincia: schema, qualità, nota e byProvince sbagliati', () => {
  assert.match(errs('population', { ...file('population'), schema: 'x' }), /schema "x"/);
  assert.match(errs('population', file('population', {}, { quality: 'boh' })), /qualità del file/);
  assert.match(errs('population', file('population', {}, { note: ' ' })), /nota di origine/);
  assert.match(errs('population', file('population', {}, { byProvince: [] })), /byProvince/);
  assert.match(errs('nope', file('population')), /dataset sconosciuto/);
});

test('dataset per provincia: id inesistenti, campi sconosciuti, valori fuori limite, riferimenti al Pack', () => {
  assert.match(errs('population', file('population', { P_ZZZ: { population: 1 } })), /P_ZZZ non è una provincia madre/);
  assert.match(errs('population', file('population', { P_AAA_1: { abitanti: 1 } })), /campo sconosciuto "abitanti"/);
  assert.match(errs('population', file('population', { P_AAA_1: { population: -5 } })), /population non valido/);
  assert.match(errs('population', file('population', { P_AAA_1: { population: 10.5 } })), /population non valido/);
  assert.match(errs('population', file('population', { P_AAA_1: { population: 10, workforce: 11 } })), /più forza lavoro che abitanti/);
  assert.match(errs('agriculture', file('agriculture', { P_AAA_1: { potential: 11 } })), /potential non valido/);
  assert.match(errs('agriculture', file('agriculture', { P_AAA_1: { wheatShare: 1.2 } })), /wheatShare non valido/);
  assert.match(errs('military', file('military', { P_AAA_1: { fortifications: 4 } })), /fortifications non valido/);
  assert.match(errs('military', file('military', { P_AAA_1: { installations: ['INF-999'] } }), { motherIds: MOTHERS, structureIds: new Set(['INF-010']) }), /INF-999, che non esiste nel Pack/);
  assert.match(errs('military', file('military', { P_AAA_1: { installations: ['A', 'A'] } })), /installations non valido/);
  assert.match(errs('population', file('population', { P_AAA_1: { population: 1, quality: 'x' } })), /qualità non valida/);
});

test('provinceEntry: una sponda legge la voce della madre', () => {
  const f = file('population', { P_AAA_1: { population: 10 } });
  assert.deepEqual(provinceEntry(f, { id: 'P_AAA_1_SP1', parentProvince: 'P_AAA_1' }), { population: 10 });
  assert.equal(provinceEntry(f, { id: 'P_AAA_2' }), null);
  assert.equal(provinceEntry(null, { id: 'P_AAA_1' }), null);
});

test('dati reali: i tre file validano contro le province madri e il Pack, e nessun id è una sponda', async () => {
  const provinces = await loadProvinces();
  const motherIds = new Set(provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id));
  const industry = loadIndustryCatalog({
    factoriesCsv: readFileSync(new URL('../data/industry/factories.csv', import.meta.url), 'utf8'),
    structuresCsv: readFileSync(new URL('../data/infrastructure/structures.csv', import.meta.url), 'utf8'),
    categoriesCsv: readFileSync(new URL('../data/industry/production_categories.csv', import.meta.url), 'utf8'),
  });
  const files = { population: 'population/province_population.json', agriculture: 'agriculture/province_agriculture.json', military: 'military/province_presence.json' };
  for (const [kind, path] of Object.entries(files)) {
    const doc = JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8'));
    assert.deepEqual(validateProvinceDataset(kind, doc, { motherIds, structureIds: industry.structures }), [], path);
  }
});

test('stato provincia: default, patch pura, ritorno al default toglie la voce, errori netti', () => {
  const base = { schema: 1, provinces: undefined };
  assert.equal(provinceStateOf(base, 'P_AAA_1').occupation, 'none');
  assert.equal(provinceStateOf(base, 'P_AAA_1').controller, null);
  const s1 = patchProvinceState(base, 'P_AAA_1', { damage: 0.4, occupation: 'occupied' });
  assert.deepEqual(s1.provinces.P_AAA_1, { damage: 0.4, occupation: 'occupied' });
  assert.equal(base.provinces, undefined, 'lo stato in ingresso non cambia');
  const s2 = patchProvinceState(s1, 'P_AAA_1', { damage: 0, occupation: 'none' });
  assert.deepEqual(s2.provinces, {}, 'tutto al default: la voce sparisce');
  assert.throws(() => patchProvinceState(base, 'P_AAA_1', { damage: 2 }), RangeError);
  assert.throws(() => patchProvinceState(base, 'P_AAA_1', { colore: 'blu' }), RangeError);
  assert.throws(() => patchProvinceState(base, '', { damage: 0.1 }), RangeError);
  assert.ok(Object.keys(PROVINCE_STATE_FIELDS).includes('events'));
});

test('stato provincia: validateProvinceStates e validateState (campo facoltativo, vecchi salvataggi validi)', () => {
  assert.deepEqual(validateProvinceStates(undefined), []);
  assert.match(validateProvinceStates([]).join('|'), /non è un oggetto/);
  assert.match(validateProvinceStates({ P_X: { damage: 3 } }).join('|'), /damage non valido/);
  assert.match(validateProvinceStates({ P_X: { zzz: 1 } }).join('|'), /campo sconosciuto/);
  assert.match(validateProvinceStates({ P_X: {} }, { motherIds: ['P_Y'] }).join('|'), /non è una provincia madre/);
  const political = [{ id: 'AAA', name: 'A', type: 'country', owner: 'AAA', controller: 'AAA', status: 'independent', playable: true }];
  const { state } = newGame({ nation: 'AAA', political, ownersWithProvinces: ['AAA'] });
  assert.deepEqual(validateState(state), [], 'senza provinces resta valido');
  assert.deepEqual(validateState(patchProvinceState(state, 'P_AAA_1', { bombing: 0.5 })), []);
  assert.match(validateState({ ...state, provinces: { P_AAA_1: { bombing: 9 } } }).join('|'), /bombing non valido/);
});

const props = { id: 'P_AAA_1', name: 'Alfa', nameLocal: 'Alpha', owner: 'AAA', kind: 'provincia', borderQuality: 'hypothesis', validFrom: '1936-01-01', validTo: '9999-12-31', source: 's', license: 'l', knownIssues: ['land_only'] };
const view = (over = {}) => buildProvinceView({ props, areaKm2: 12345, nationNames: { AAA: 'Aaa', BBB: 'Bbb' }, nationControl: { AAA: 'AAA' }, linkStats: { links: 4, rail: 2, road: 2 }, ...over });
const ids = (v) => v.cards.map((c) => c.id);

test('collegamenti: conta solo i tratti fra province madri diverse, sponde incluse nella madre', () => {
  const pieces = [{ id: 'P_A_1' }, { id: 'P_A_2_SP1', parentProvince: 'P_A_2' }, { id: 'P_A_2_SP2', parentProvince: 'P_A_2' }, { id: 'P_B_1' }];
  const links = { nodes: [{ p: 0 }, { p: 1 }, { p: 2 }, { p: 3 }], links: [{ a: 0, b: 1, t: 4 }, { a: 1, b: 2, t: 2 }, { a: 2, b: 3, t: 1 }] };
  const stats = provinceLinkStats(links, pieces);
  assert.deepEqual(stats.get('P_A_1'), { links: 1, rail: 1, road: 0 });
  assert.deepEqual(stats.get('P_A_2'), { links: 2, rail: 1, road: 1 }, 'il tratto fra due sponde della stessa madre non conta');
  assert.deepEqual(stats.get('P_B_1'), { links: 1, rail: 0, road: 1 });
});

test('logistica: isolata, sotto sforzo, ottima, normale, non caricata', () => {
  const st = provinceStateOf(null, 'x');
  assert.equal(logisticsStatus({ links: 0, rail: 0, road: 0 }, st), 'isolated');
  assert.equal(logisticsStatus({ links: 3, rail: 1, road: 2 }, { ...st, isolated: true }), 'isolated');
  assert.equal(logisticsStatus({ links: 3, rail: 1, road: 2 }, { ...st, infrastructureDamage: 0.5 }), 'strained');
  assert.equal(logisticsStatus({ links: 3, rail: 1, road: 2 }, st), 'excellent');
  assert.equal(logisticsStatus({ links: 1, rail: 0, road: 1 }, st), 'normal');
  assert.equal(logisticsStatus(null, st), 'unknown');
});

test('vista: provincia normale, ordine delle schede, nessun dato inventato', () => {
  const v = view();
  assert.equal(v.alert, null);
  assert.deepEqual(ids(v), ['overview', 'military', 'logistics', 'economy', 'infrastructure', 'population', 'occupation', 'data']);
  assert.equal(v.header.status.label, 'Stabile');
  assert.equal(v.header.controllerName, 'Aaa');
  const byId = Object.fromEntries(v.header.indicators.map((i) => [i.id, i.value]));
  assert.equal(byId.population, 'n/d');
  assert.equal(byId.energy, 'n/d');
  assert.equal(byId.industry, '14 slot');
  assert.equal(v.cards.find((c) => c.id === 'military').main.value, 'n/d');
  assert.equal(v.cards.find((c) => c.id === 'overview').open, true);
  assert.ok(v.cards.every((c) => c.metrics.length <= 4), 'al massimo 4 metriche per scheda');
});

test('vista: dati presenti compaiono; sponda e zona urbana usano gli slot giusti', () => {
  const v = view({ population: { population: 123456, workforce: 50000 }, military: { garrison: 900, hq: true, fortifications: 2 }, hydroMw: 250, agriculture: { potential: 6, wheatShare: 0.25 }, resourceLabels: ['Carbone'] });
  const byId = Object.fromEntries(v.header.indicators.map((i) => [i.id, i.value]));
  assert.match(byId.population, /123/);
  assert.match(byId.energy, /250 MW/);
  assert.equal(byId.resources, '1');
  assert.equal(v.cards.find((c) => c.id === 'military').main.value, '900');
  assert.equal(v.cards.find((c) => c.id === 'economy').metrics.find((m) => m.label === 'Potenziale agricolo').value, '6/10');
  assert.equal(view({ props: { ...props, kind: 'citta' } }).header.indicators.find((i) => i.id === 'industry').value, '10 slot');
});

test('vista: bombardata → avviso Danni e ordine Militare, Infrastrutture, Economia', () => {
  const v = view({ state: { provinces: { P_AAA_1: { damage: 0.5, bombing: 0.2 } } } });
  assert.equal(v.alert.id, 'damage');
  assert.deepEqual(ids(v).slice(0, 4), ['overview', 'military', 'infrastructure', 'economy']);
  assert.equal(v.header.status.label, 'Danneggiata');
  assert.equal(v.cards.find((c) => c.id === 'military').open, true, 'la scheda in allarme si apre da sola');
});

test('vista: isolata → avviso Logistica e ordine Logistica, Militare, Infrastrutture', () => {
  const v = view({ linkStats: { links: 0, rail: 0, road: 0 } });
  assert.equal(v.alert.id, 'isolated');
  assert.deepEqual(ids(v).slice(0, 4), ['overview', 'logistics', 'military', 'infrastructure']);
  assert.equal(v.header.status.label, 'Isolata');
});

test('vista: controllo e occupazione restano separati da proprietà', () => {
  const natl = view({ nationControl: { AAA: 'BBB' } }); // protettorato/colonia: controller della nazione ≠ owner, NON è occupazione
  assert.equal(natl.header.controllerName, 'Bbb');
  assert.equal(natl.header.status.label, 'Stabile');
  const occ = view({ state: { provinces: { P_AAA_1: { controller: 'BBB', occupation: 'occupied' } } } });
  assert.equal(occ.header.ownerName, 'Aaa');
  assert.equal(occ.header.controllerName, 'Bbb');
  assert.equal(occ.header.status.label, 'Occupata');
  assert.equal(ids(occ)[1], 'occupation');
});

test('vista: pura — non modifica gli ingressi e dà lo stesso risultato a parità di dati', () => {
  const input = { props, areaKm2: 10, state: { provinces: { P_AAA_1: { damage: 0.4 } } }, linkStats: { links: 1, rail: 0, road: 1 } };
  const copy = JSON.parse(JSON.stringify(input));
  assert.deepEqual(buildProvinceView(input), buildProvinceView(input));
  assert.deepEqual(input, copy);
});
