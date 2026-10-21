import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAdjacency, validateAdjacency, idsChecksum, ADJACENCY_SCHEMA } from '../src/data/adjacency.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildAdjacencyFile } from '../scripts/build-adjacency.js';
import { grafoFamiglie, madreId, vistaProvince } from './famiglie.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const file = read('adjacency.json');
const overrides = read('adjacency_overrides.json');
const crossings = read('crossings.json');
const collection = await loadProvinces();
const ids = collection.features.map((f) => f.properties.id);
const graph = buildAdjacency(collection, file);
const fam = grafoFamiglie(graph, collection); // adiacenza fra madri (una provincia divisa in sponde conta come una sola)
const madri = [...new Set(ids.map(madreId))];

/** Province raggiungibili via terra da `start`. */
function reach(start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) for (const n of fam.neighbors(queue.shift())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
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
  for (const m of madri) assert.ok(fam.neighbors(m).length <= 25, `${m}: ${fam.neighbors(m).length} vicini`);
  for (const id of ids) {
    const ns = graph.neighbors(id);
    assert.ok(!ns.includes(id), `${id} adiacente a sé stessa`);
    assert.equal(new Set(ns).size, ns.length, `${id}: vicini duplicati`);
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
  for (const [a, b] of pairs) assert.ok(fam.areAdjacent(a, b), `${a} / ${b} dovrebbero essere adiacenti`);
});

test('adiacenza: coppie separate dal mare non sono adiacenti', () => {
  const sicilia = ['P_ITA_TRAPANI', 'P_ITA_PALERMO', 'P_ITA_MESSINA', 'P_ITA_AGRIGENTO', 'P_ITA_CALTANISSETTA', 'P_ITA_ENNA', 'P_ITA_CATANIA', 'P_ITA_RAGUSA', 'P_ITA_SIRACUSA'];
  for (const p of sicilia) assert.equal(graph.areAdjacent(p, 'P_ITA_CALABRIA'), false, `${p} / Calabria: lo Stretto non è terra`);
  for (const p of sicilia) assert.ok(fam.neighbors(p).every((n) => sicilia.includes(n)), `${p}: vicini solo siciliani`);
  assert.ok(fam.areAdjacent('P_ITA_MESSINA', 'P_ITA_CATANIA') && fam.areAdjacent('P_ITA_RAGUSA', 'P_ITA_SIRACUSA') && fam.areAdjacent('P_ITA_ENNA', 'P_ITA_CALTANISSETTA'));
  for (const island of ['P_ITA_SARDINIA', 'P_FRA_CORSE', 'P_MLT_MALTA', 'P_GRC_KRITI', 'P_ESP_BALEARES', 'P_SWE_GOTLAND']) {
    assert.deepEqual(fam.neighbors(island), [], `${island} dovrebbe essere un'isola senza collegamenti terrestri`);
  }
  for (const { a, b, reason } of overrides.remove) {
    assert.equal(fam.areAdjacent(a, b), false, `${a} / ${b} (${reason})`);
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
  const eurasia = reach('P_DEU_BERLIN');
  for (const id of ['P_ITA_EMILIA', 'P_FRA_SEINE', 'P_ESP_CADIZ', 'P_USSR_MOSKOVSKAYA', 'P_TUR_ISTANBUL', 'P_NOR_OSLO', 'P_EGY_AL_QAHIRAH']) {
    assert.ok(eurasia.has(id), `${id} non raggiungibile da Berlino via terra`);
  }
  for (const id of ['P_GBR_LONDRA', 'P_ITA_PALERMO', 'P_ITA_CATANIA', 'P_ITA_SARDINIA', 'P_MLT_MALTA']) {
    assert.ok(!eurasia.has(id), `${id} non dovrebbe essere raggiungibile via terra`);
  }
  // 24 isole senza collegamenti terrestri (con l'Islanda; la Sicilia ora ha 9 province vicine tra loro): il numero cambia solo se cambiano province o regole, e va rivisto a mano
  const isolated = madri.filter((m) => fam.neighbors(m).length === 0);
  assert.equal(isolated.length, 24, `isolate: ${isolated.join(', ')}`);
});

test('adiacenza: ogni ponte tra due province diverse collega province adiacenti', () => {
  const checked = crossings.filter((c) => c.sideA !== c.sideB);
  assert.ok(checked.length >= 3);
  for (const c of checked) assert.ok(graph.areAdjacent(c.sideA, c.sideB), `${c.id}: ${c.sideA} / ${c.sideB} non adiacenti`);
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
