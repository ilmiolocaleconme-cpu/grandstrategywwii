import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSea, validateSea, SEA_SCHEMA, SEA_KINDS } from '../src/data/sea.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildSeaFile } from '../scripts/build-sea.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const file = read('sea_zones.json');
const design = read('sea_zones_design.json');
const collection = await loadProvinces();
const ids = collection.features.map((f) => f.properties.id);
const sea = buildSea(collection, file);

/** Zone raggiungibili da `start` passando solo da zone per cui `ok(id)` è vero. */
function reach(start, ok = () => true) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) for (const n of sea.neighbors(queue.shift())) if (ok(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  return seen;
}

test('mare: il file è valido, corrisponde alle province e dichiara la qualità "hypothesis"', () => {
  assert.equal(file.schema, SEA_SCHEMA);
  assert.equal(file.quality, 'hypothesis');
  assert.deepEqual(validateSea(file, ids), []);
  assert.equal(file.zones.length, design.seeds.length);
});

test('mare: rigenerando dal disegno si ottiene esattamente il file nel repository', async () => {
  const { file: rebuilt } = await buildSeaFile();
  assert.deepEqual(rebuilt, file);
});

test('mare: ogni zona del disegno esiste, con tipo valido e regione', () => {
  for (const s of design.seeds) {
    const z = sea.zone(s.id);
    assert.ok(z, `${s.id} mancante`);
    assert.ok(SEA_KINDS.includes(z.kind));
    assert.ok(z.region);
  }
});

test('mare: il grafo è connesso e simmetrico', () => {
  assert.equal(reach(file.zones[0].id).size, file.zones.length);
  for (const z of file.zones) for (const n of sea.neighbors(z.id)) assert.ok(sea.areAdjacent(n, z.id));
});

test('mare: gli stretti strategici collegano davvero i mari che separano', () => {
  const link = (a, b) => assert.ok(sea.areAdjacent(a, b), `${a} non confina con ${b}`);
  // Gibilterra: Atlantico -> Mediterraneo
  link('SZ_GOLFO_CADICE', 'SZ_GIBILTERRA'); link('SZ_GIBILTERRA', 'SZ_ALBORAN');
  // Manica
  link('SZ_NORD_SUD', 'SZ_DOVER'); link('SZ_DOVER', 'SZ_MANICA');
  // Danimarca: Øresund e Belt verso il Baltico
  link('SZ_SKAGERRAK', 'SZ_KATTEGAT'); link('SZ_KATTEGAT', 'SZ_ORESUND'); link('SZ_KATTEGAT', 'SZ_GRANDE_BELT');
  link('SZ_ORESUND', 'SZ_BALTICO_OVEST'); link('SZ_GRANDE_BELT', 'SZ_BALTICO_OVEST');
  // Turchia: Egeo -> Dardanelli -> Marmara -> Bosforo -> Mar Nero
  link('SZ_EGEO_NORD', 'SZ_DARDANELLI'); link('SZ_DARDANELLI', 'SZ_MARMARA');
  link('SZ_MARMARA', 'SZ_BOSFORO'); link('SZ_BOSFORO', 'SZ_NERO_OVEST');
  // Italia
  link('SZ_TIRRENO_SUD', 'SZ_MESSINA'); link('SZ_MESSINA', 'SZ_IONIO_OVEST');
  link('SZ_ADRIATICO_SUD', 'SZ_OTRANTO'); link('SZ_OTRANTO', 'SZ_IONIO_EST');
});

test('mare: senza gli stretti il Baltico, il Mar Nero e il Mediterraneo sono chiusi', () => {
  const straits = new Set(file.zones.filter((z) => z.kind === 'strait').map((z) => z.id));
  const open = reach('SZ_ATL_AZZORRE', (id) => !straits.has(id));
  assert.ok(open.has('SZ_BISCAGLIA'));
  for (const closed of ['SZ_BALTICO_SUD', 'SZ_NERO_CENTRO', 'SZ_EGEO_CENTRO', 'SZ_ALGERINO']) {
    assert.ok(!open.has(closed), `${closed} raggiungibile senza passare da uno stretto`);
  }
  // ma attraverso gli stretti sì
  const all = reach('SZ_ATL_AZZORRE');
  for (const id of ['SZ_BALTICO_SUD', 'SZ_NERO_CENTRO', 'SZ_EGEO_CENTRO']) assert.ok(all.has(id));
});

test('mare: coste coerenti con le province (porti sul mare giusto, interno senza costa)', () => {
  const zonesOf = (p) => sea.coastalZones(p).map((c) => c.zone);
  assert.ok(zonesOf('P_ITA_LIGURIA').includes('SZ_LIGURE'));
  assert.ok(zonesOf('P_GBR_KENT').some((z) => ['SZ_DOVER', 'SZ_NORD_SUD', 'SZ_MANICA'].includes(z)));
  assert.ok(zonesOf('P_USSR_ODESSA').some((z) => z.startsWith('SZ_NERO')));
  assert.ok(zonesOf('P_USSR_MURMANSK').length > 0);
  assert.ok(zonesOf('P_TUR_ISTANBUL').some((z) => ['SZ_MARMARA', 'SZ_BOSFORO', 'SZ_NERO_OVEST'].includes(z)));
  assert.ok(sea.isCoastal('P_ESP_CADIZ'));
  for (const inland of ['P_POL_WARSAW_VOIVODESHIP', 'P_POL_WILNO_VOIVODESHIP', 'P_USSR_TASHKENT']) assert.ok(!sea.isCoastal(inland), `${inland} non dovrebbe avere costa`);
});

test('mare: validazione, esempi negativi', () => {
  const clone = () => structuredClone(file);
  assert.ok(validateSea(null, ids).length > 0);
  let f = clone(); f.checksum = '00000000';
  assert.ok(validateSea(f, ids).some((e) => e.includes('somma di controllo')));
  f = clone(); f.zones[1].id = f.zones[0].id;
  assert.ok(validateSea(f, ids).some((e) => e.includes('duplicato')));
  f = clone(); f.zones[0].neighbors = f.zones[0].neighbors.slice(1);
  assert.ok(validateSea(f, ids).some((e) => e.includes('simmetrico')));
  f = clone(); f.zones[0].coastal.push([ids.length, 5]);
  assert.ok(validateSea(f, ids).some((e) => e.includes('fuori intervallo')));
  f = clone(); f.zones[0].kind = 'lago';
  assert.ok(validateSea(f, ids).some((e) => e.includes('sconosciuto')));
  assert.throws(() => buildSea(collection, { ...file, checksum: idsChecksum(['x']) }));
});

test('mare: Africa e Mar Rosso, con Suez, Bab el-Mandeb e rotta del Capo', () => {
  const link = (a, b) => assert.ok(sea.areAdjacent(a, b), `${a} non confina con ${b}`);
  // Mediterraneo -> Suez -> Mar Rosso -> Bab el-Mandeb -> Golfo di Aden -> Oceano Indiano
  link('SZ_PORT_SAID', 'SZ_SUEZ'); link('SZ_SUEZ', 'SZ_GOLFO_SUEZ'); link('SZ_GOLFO_SUEZ', 'SZ_MAR_ROSSO_NORD');
  link('SZ_MAR_ROSSO_SUD', 'SZ_BAB_EL_MANDEB'); link('SZ_BAB_EL_MANDEB', 'SZ_GOLFO_ADEN'); link('SZ_GOLFO_ADEN', 'SZ_CORNO_AFRICA');
  link('SZ_SOMALIA_ITALIANA', 'SZ_KENYA');
  // rotta del Capo: Atlantico -> Capo -> Indiano
  link('SZ_ATL_CAPO', 'SZ_CAPO'); link('SZ_CAPO', 'SZ_IND_SUD');
  // costa atlantica africana in catena, dal Marocco al Capo
  const chain = ['SZ_ATL_MAROCCO', 'SZ_ATL_SAHARA', 'SZ_CAPO_VERDE', 'SZ_GUINEA_OVEST', 'SZ_ATL_EQUATORIALE', 'SZ_GOLFO_GUINEA', 'SZ_GABON_CONGO', 'SZ_ANGOLA', 'SZ_BENGUELA', 'SZ_ATL_CAPO'];
  const r = reach('SZ_ATL_MAROCCO', (id) => id !== 'SZ_ATL_MADERA_CANARIE');
  for (const id of chain) assert.ok(r.has(id), `${id} non raggiungibile`);
  assert.ok(sea.zone('SZ_SOMALIA_ITALIANA').strategic);
});

test('mare: senza Suez e Gibilterra l\'Indiano si raggiunge solo dal Capo', () => {
  const noCanals = (id) => id !== 'SZ_SUEZ' && id !== 'SZ_GIBILTERRA';
  assert.ok(reach('SZ_ATL_AZZORRE', noCanals).has('SZ_SOMALIA_ITALIANA'), 'la rotta del Capo deve esistere');
  assert.ok(!reach('SZ_ATL_AZZORRE', (id) => noCanals(id) && id !== 'SZ_CAPO').has('SZ_SOMALIA_ITALIANA'), 'senza il Capo l\'Indiano non deve essere raggiungibile');
});

test('mare: Irlanda è terra (non mare) e ha acque attorno', () => {
  assert.ok(sea.zone('SZ_ATL_IRLANDA_OVEST'));
  assert.ok(sea.areAdjacent('SZ_ATL_IRLANDA_OVEST', 'SZ_ATL_OVEST'));
});
