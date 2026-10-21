import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAdjacency, validateAdjacency, idsChecksum, ADJACENCY_SCHEMA } from '../src/data/adjacency.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildAdjacencyFile } from '../scripts/build-adjacency.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const file = read('adjacency.json');
const overrides = read('adjacency_overrides.json');
const crossings = read('crossings.json');
const collection = await loadProvinces();
const ids = collection.features.map((f) => f.properties.id);
const graph = buildAdjacency(collection, file);

/** Pezzi di una provincia: la provincia stessa o le sue sponde («<id>_SP<n>», dopo la divisione lungo i fiumi). */
const pezzi = (id) => ids.filter((x) => x === id || x.startsWith(`${id}_SP`));
/** Due province (anche divise in sponde) sono adiacenti se lo è almeno una coppia di pezzi. */
const adiacenti = (a, b) => pezzi(a).some((x) => pezzi(b).some((y) => graph.areAdjacent(x, y)));

/** Province raggiungibili via terra da `start`. */
function reach(start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) for (const n of graph.neighbors(queue.shift())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  return seen;
}

test('adiacenza: il file corrisponde alle province attuali e rispetta lo schema', () => {
  assert.equal(file.schema, ADJACENCY_SCHEMA);
  assert.deepEqual(validateAdjacency(file, ids), []);
  assert.equal(graph.edgeCount, file.edges.length);
});

test('adiacenza: rigenerando dai poligoni si ottiene esattamente il file nel repository', async () => {
  assert.deepEqual(await buildAdjacencyFile(), file);
});

test('adiacenza: simmetrica, senza auto-collegamenti, grado ragionevole', () => {
  for (const id of ids) {
    const ns = graph.neighbors(id);
    assert.ok(!ns.includes(id), `${id} adiacente a sé stessa`);
    assert.equal(new Set(ns).size, ns.length, `${id}: vicini duplicati`);
    // le sponde lungo i fiumi toccano più pezzi: il tetto è più alto della singola provincia
    assert.ok(ns.length <= 30, `${id}: ${ns.length} vicini`);
    for (const n of ns) {
      assert.ok(graph.neighbors(n).includes(id), `${id} -> ${n} non è simmetrico`);
      assert.equal(graph.borderKm(id, n), graph.borderKm(n, id));
      assert.ok(graph.borderKm(id, n) >= 1);
    }
  }
});

test('adiacenza: coppie terrestri note', () => {
  const pairs = [
    ['P_ITA_EMILIA', 'P_ITA_LOMBARDY'],
    ['P_ITA_EMILIA', 'P_ITA_TUSCANY'],
    ['P_DEU_BADEN', 'P_CHE_AARGAU'], // Reno a Waldshut
    ['P_FRA_SEINE', 'P_FRA_SEINE_ET_OISE'],
    ['P_FRA_PYRENEES_ORIENTALES', 'P_ESP_LERIDA'],
    ['P_ESP_CADIZ', 'P_GIB_GIBRALTAR'],
    ['P_BEL_ANTWERP', 'P_NLD_ZEELAND'], // Fiandre zelandesi
    ['P_FIN_KYMENLAAKSO', 'P_USSR_LENINGRAD'],
  ];
  for (const [a, b] of pairs) assert.ok(adiacenti(a, b), `${a} / ${b} dovrebbero essere adiacenti`);
});

test('adiacenza: coppie separate dal mare non sono adiacenti', () => {
  assert.equal(graph.areAdjacent('P_ITA_SICILY', 'P_ITA_CALABRIA'), false);
  for (const island of ['P_ITA_SICILY', 'P_ITA_SARDINIA', 'P_FRA_CORSE', 'P_MLT_MALTA', 'P_GRC_KRITI', 'P_ESP_BALEARES', 'P_SWE_GOTLAND']) {
    assert.deepEqual(graph.neighbors(island), [], `${island} dovrebbe essere un'isola senza collegamenti terrestri`);
  }
  for (const { a, b, reason } of overrides.remove) {
    assert.equal(adiacenti(a, b), false, `${a} / ${b} (${reason})`);
    assert.ok(typeof reason === 'string' && reason.length > 0);
  }
  // nessun collegamento diretto tra Gran Bretagna e continente o tra Danimarca e Svezia
  const owner = (id) => id.split('_')[1];
  for (const id of ids) {
    if (owner(id) !== 'GBR') continue;
    for (const n of graph.neighbors(id)) assert.ok(owner(n) === 'GBR' || (owner(n) === 'IRL' && /ANTRIM|ARMAGH|DOWN|FERMANAGH|LONDONDERRY|TYRONE/.test(id)), `${id} -> ${n}`);
  }
  for (const id of ids.filter((i) => owner(i) === 'SWE')) {
    assert.ok(!graph.neighbors(id).some((n) => owner(n) === 'DNK'), `${id}: Svezia-Danimarca per terra`);
  }
});

test('adiacenza: raggiungibilità via terra', () => {
  const eurasia = reach(pezzi('P_DEU_BERLIN')[0]);
  const raggiunta = (id) => pezzi(id).some((x) => eurasia.has(x));
  for (const id of ['P_ITA_EMILIA', 'P_FRA_SEINE', 'P_ESP_CADIZ', 'P_USSR_MOSKOVSKAYA', 'P_TUR_ISTANBUL', 'P_NOR_OSLO', 'P_EGY_AL_QAHIRAH']) {
    assert.ok(raggiunta(id), `${id} non raggiungibile da Berlino via terra`);
  }
  for (const id of ['P_GBR_LONDRA', 'P_ITA_SICILY', 'P_ITA_SARDINIA', 'P_MLT_MALTA']) {
    assert.ok(!raggiunta(id), `${id} non dovrebbe essere raggiungibile via terra`);
  }
  // 25 isole senza collegamenti terrestri (con l'Islanda): il numero cambia solo se cambiano province o regole, e va rivisto a mano
  const isolated = ids.filter((id) => graph.neighbors(id).length === 0);
  assert.equal(isolated.length, 25, `isolate: ${isolated.join(', ')}`);
});

test('adiacenza: ogni ponte tra due province diverse collega province adiacenti', () => {
  const checked = crossings.filter((c) => c.sideA !== c.sideB);
  assert.ok(checked.length >= 3);
  for (const c of checked) assert.ok(adiacenti(c.sideA, c.sideB), `${c.id}: ${c.sideA} / ${c.sideB} non adiacenti`);
});

test('adiacenza: validazione, casi negativi', () => {
  const base = { schema: ADJACENCY_SCHEMA, count: 3, checksum: idsChecksum(['a', 'b', 'c']), edges: [[0, 1, 5], [1, 2, 7]] };
  const three = ['a', 'b', 'c'];
  assert.deepEqual(validateAdjacency(base, three), []);
  const bad = (patch, text) => assert.ok(validateAdjacency({ ...base, ...patch }, three).some((e) => e.includes(text)), text);
  bad({ schema: 'x' }, 'schema');
  bad({ count: 4 }, 'count');
  bad({ checksum: '00000000' }, 'somma di controllo');
  bad({ edges: [[1, 0, 5]] }, 'non ordinato');
  bad({ edges: [[0, 3, 5]] }, 'fuori intervallo');
  bad({ edges: [[0, 1, 5], [0, 1, 6]] }, 'duplicato');
  bad({ edges: [[0, 1, 0]] }, 'km < 1');
  bad({ edges: [[0, 1]] }, 'interi');
  assert.notEqual(idsChecksum(['ab', 'c']), idsChecksum(['a', 'bc']));
  assert.throws(() => buildAdjacency({ features: [{ properties: { id: 'a' } }, { properties: { id: 'b' } }, { properties: { id: 'z' } }] }, base), /somma di controllo/);
});
