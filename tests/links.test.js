// Grafo dei collegamenti (data/links.json, src/data/links.js): rete, percorso minimo, catene, ponti come tratti, dati reali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIDGE_HALF_KM, LINKS_SCHEMA, buildChains, buildNetwork, crossingsAlong, cumulativeKm, kmBetween, shortestPath, sliceByDistance, validateLinks } from '../src/data/links.js';
import { CELL, buildRiverSegmentGrid, segmentIntersection } from '../src/data/transport.js';
import { distanceToRiverKm, buildRiverModel } from '../src/data/rivers.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const L = (k, level, ...pts) => ({ k, level, rank: 3, c: pts.flat() });

test('rete: archi duplicati si fondono (livello più alto), modalità separate', () => {
  const net = buildNetwork([L('road', 1, [0, 0], [0.1, 0]), L('road', 3, [0.1, 0], [0, 0]), L('rail', 3, [0, 0], [0, 0.1])], 'road');
  assert.equal(net.edges.length, 1);
  assert.equal(net.edges[0].level, 3);
  assert.equal(buildNetwork([L('rail', 3, [0, 0], [0, 0.1])], 'road').edges.length, 0);
});

test('percorso minimo: preferisce il livello alto, rispetta i nodi ammessi, null se isolato', () => {
  // A(0)-B(1)-C(2) corto ma strada secondaria; A-D-C lungo ma autostrada
  const lines = [L('road', 1, [0, 0], [0.1, 0], [0.2, 0]), L('road', 3, [0, 0], [0.1, 0.15], [0.2, 0])];
  const net = buildNetwork(lines, 'road');
  const id = (lon, lat) => net.lon.findIndex((x, i) => Math.abs(x - lon) < 1e-9 && Math.abs(net.lat[i] - lat) < 1e-9);
  const A = id(0, 0); const C = id(0.2, 0); const B = id(0.1, 0);
  const p = shortestPath(net, A, C, () => true);
  assert.ok(p.nodes.includes(id(0.1, 0.15)), 'preferisce l\'autostrada più lunga');
  const q = shortestPath(net, A, C, (u) => u !== id(0.1, 0.15));
  assert.ok(q.nodes.includes(B) && q.km > 0);
  assert.equal(shortestPath(net, A, C, (u) => u === A || u === C), null);
});

test('catene: ogni arco in una sola catena, rotture a incroci, sedi e cambi di livello', () => {
  const lines = [L('road', 2, [0, 0], [0.1, 0], [0.2, 0]), L('road', 3, [0.2, 0], [0.3, 0]), L('road', 2, [0.1, 0], [0.1, 0.1])];
  const net = buildNetwork(lines, 'road');
  const all = net.edges.map((_, i) => i);
  const { chains, edgeChain } = buildChains(net, all);
  assert.equal(edgeChain.size, net.edges.length);
  assert.equal(chains.length, 4, 'incrocio a T e cambio di livello spezzano');
  const total = chains.reduce((n, c) => n + c.nodes.length - 1, 0);
  assert.equal(total, net.edges.length, 'nessun arco ripetuto');
});

test('ponte come tratto: incrocio col fiume, distanza lungo la linea e taglio della polilinea', () => {
  const riverGeo = { features: [{ properties: { riverId: 'R_X', inLake: false }, geometry: { coordinates: [[0.1, -1], [0.1, 1]] } }] };
  const grid = buildRiverSegmentGrid(riverGeo);
  const coords = [[0, 0], [0.05, 0], [0.2, 0]];
  const cum = cumulativeKm(coords);
  const found = crossingsAlong(coords, cum, grid, segmentIntersection, CELL);
  assert.equal(found.length, 1);
  assert.ok(Math.abs(found[0].s - kmBetween(0, 0, 0.1, 0)) < 0.01);
  const h = BRIDGE_HALF_KM.medium;
  const piece = sliceByDistance(coords, cum, found[0].s - h, found[0].s + h);
  assert.ok(Math.abs(cumulativeKm(piece).at(-1) - 2 * h) < 0.01, 'lunghezza = 2 × semilunghezza');
  assert.ok(piece[0][0] < 0.1 && piece.at(-1)[0] > 0.1, 'a cavallo del fiume');
  // due incroci dello stesso fiume vicini (meandro) = un solo ponte
  const mean = [[0.09, 0], [0.11, 0], [0.11, 0.002], [0.09, 0.002]];
  assert.equal(crossingsAlong(mean, cumulativeKm(mean), grid, segmentIntersection, CELL, 4).length, 1);
});

test('dati: file valido, legato alle province, ipotesi dichiarata', async () => {
  const links = read('links.json');
  const provinces = await loadProvinces();
  const ids = provinces.features.map((f) => f.properties.id);
  assert.equal(links.schema, LINKS_SCHEMA);
  assert.equal(links.quality, 'hypothesis');
  assert.equal(links.checksum, idsChecksum(ids));
  const riverIds = new Set(read('rivers.json').map((r) => r.id));
  assert.deepEqual(validateLinks(links, { provinceIds: ids, riverIds }), []);
  assert.ok(!JSON.stringify(links).match(/P_(CZE|LIE|DANZIG)_/), 'solo indici di provincia (precache)');
  assert.deepEqual(validateLinks({ ...links, links: [{ ...links.links[0], segs: ['XX'] }] }, { provinceIds: ids, riverIds }).length > 0, true);
});

test('dati: un collegamento per coppia e modalità, solo tra province confinanti, sedi dentro la provincia', async () => {
  const links = read('links.json');
  const adj = new Set(read('adjacency.json').edges.map(([i, j]) => `${i}|${j}`));
  const seen = new Set();
  for (const l of links.links) {
    assert.ok(adj.has(`${l.a}|${l.b}`), `${l.id}: non confinanti`);
    const key = `${l.a}|${l.b}|${l.mode}`;
    assert.ok(!seen.has(key), `${l.id}: doppio`);
    seen.add(key);
  }
  assert.ok(links.links.filter((l) => l.mode === 'rail').length > 500 && links.links.filter((l) => l.mode === 'road').length > 300);
  const provinces = await loadProvinces();
  const { buildProvinceIndex } = await import('../src/data/geometry.js');
  const index = buildProvinceIndex(provinces);
  const sample = links.nodes.filter((n, i) => i % 25 === 0 && n.basis === 'populated_place');
  for (const n of sample) assert.equal(index.provincesAt(n.lon, n.lat)[0]?.properties.id, provinces.features[n.p].properties.id, `${n.name} fuori dalla sua provincia`);
});

test('dati: nessuna sovrapposizione — i tratti non si ripetono e ogni segmento di un collegamento esiste', () => {
  const links = read('links.json');
  const geom = new Set();
  for (const s of links.segments) {
    const key = `${s.k}|${s.c.slice(0, 4).join(',')}|${s.c.slice(-4).join(',')}`;
    const rev = `${s.k}|${s.c.slice(-2).join(',')},${s.c.slice(-4, -2).join(',')}|${s.c.slice(2, 4).join(',')},${s.c.slice(0, 2).join(',')}`;
    assert.ok(!geom.has(key) && !geom.has(rev), `${s.id}: tratto ripetuto`);
    geom.add(key);
  }
  const ids = new Set(links.segments.map((s) => s.id));
  assert.ok(links.links.every((l) => l.segs.length > 0 && l.segs.every((x) => ids.has(x))));
  const bridgeSegs = links.segments.filter((s) => s.br);
  assert.equal(bridgeSegs.length, links.bridges.length, 'un ponte per ogni segmento-ponte');
});

test('dati: i ponti stanno sul fiume (≤ 1,5 km), appartengono al loro segmento e ne seguono la geometria', () => {
  const links = read('links.json');
  const model = buildRiverModel(read('rivers.json'), read('rivers_geo.json'));
  const segs = new Map(links.segments.map((s) => [s.id, s]));
  assert.ok(links.bridges.length > 500);
  for (const b of links.bridges.filter((_, i) => i % 7 === 0)) {
    const s = segs.get(b.seg);
    assert.equal(s.br.r, b.riverId);
    assert.equal(s.k, b.mode);
    assert.ok(distanceToRiverKm(model, b.riverId, b.lon, b.lat) < 1.5, `${b.id} lontano dal fiume`);
    const mid = [s.c[0] + (s.c.at(-2) - s.c[0]) / 2, s.c[1] + (s.c.at(-1) - s.c[1]) / 2];
    assert.ok(kmBetween(mid[0], mid[1], b.lon, b.lat) < 6, `${b.id}: ponte lontano dal suo segmento`);
    assert.ok(b.level === s.level && b.km > 0.1 && b.km < 6.5);
  }
});
