// Grafo dei collegamenti (data/links.json, src/data/links.js): rete, percorso minimo, catene, ponti come tratti, dati reali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIDGE_HALF_KM, LADDER, LINKS_SCHEMA, buildNetwork, crossingsAlong, cumulativeKm, kmBetween, ladderStep, markerLevelOfStep, pathStep, shortestPath, sliceByDistance, validateLinks } from '../src/data/links.js';
import { CELL, buildRiverSegmentGrid, segmentIntersection } from '../src/data/transport.js';
import { distanceToRiverKm, buildRiverModel } from '../src/data/rivers.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';

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

test('scala: 4 gradini (sterrata, strada, principale, ferrovia); autostrade = principali, ogni ferrovia = 4; il percorso prende il gradino di metà della lunghezza', () => {
  assert.deepEqual([ladderStep('road', 0), ladderStep('road', 1), ladderStep('road', 2), ladderStep('road', 3), ladderStep('rail', 2), ladderStep('rail', 3)], [1, 2, 3, 3, 4, 4]);
  assert.deepEqual(LADDER.map((l) => l.id), ['dirt', 'road', 'main-road', 'rail']);
  assert.ok(LADDER.every((l) => l.level <= 2), 'mai due corsie né doppio binario');
  assert.deepEqual([1, 2, 3, 4].map(markerLevelOfStep), [1, 1, 2, 2]);
  // 90 km di strada principale con un tratto secondario di 10 km: resta principale; metà e metà: vince il gradino più alto raggiunto dal 50%
  const net = buildNetwork([L('road', 3, [0, 0], [0.9, 0]), L('road', 1, [0.9, 0], [1, 0])], 'road');
  assert.equal(pathStep(net, net.edges.map((_, i) => i)), 3);
  const half = buildNetwork([L('road', 3, [0, 0], [0.5, 0]), L('road', 1, [0.5, 0], [1, 0])], 'road');
  assert.equal(pathStep(half, half.edges.map((_, i) => i)), 3);
  const mostlyLow = buildNetwork([L('road', 3, [0, 0], [0.3, 0]), L('road', 1, [0.3, 0], [1, 0])], 'road');
  assert.equal(pathStep(mostlyLow, mostlyLow.edges.map((_, i) => i)), 2);
  const rail = buildNetwork([L('rail', 3, [0, 0], [0.6, 0]), L('rail', 2, [0.6, 0], [1, 0])], 'rail');
  assert.equal(pathStep(rail, rail.edges.map((_, i) => i)), 4, 'doppio e unico binario sono entrambi ferrovia');
  assert.equal(pathStep(net, []), 1);
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

test('dati: un collegamento per coppia di province confinanti (tranne le tratte marittime lunghe scartate), un solo tipo, dalla sede alla sede', () => {
  const links = read('links.json');
  const adj = read('adjacency.json').edges;
  assert.equal(links.links.length + (links.routes.droppedSea ?? 0), adj.length, 'uno per ogni coppia, salvo le tratte marittime scartate');
  const pairs = new Set(adj.map(([i, j]) => `${i}|${j}`));
  assert.ok(links.links.every((l) => pairs.has(`${l.a}|${l.b}`)), 'solo coppie confinanti');
  assert.equal(new Set(links.links.map((l) => l.id)).size, links.links.length);
  const seat = new Map(links.nodes.map((n) => [n.p, n]));
  const byLink = new Map();
  for (const s of links.segments) (byLink.get(s.link) ?? byLink.set(s.link, []).get(s.link)).push(s);
  for (const l of links.links.filter((_, i) => i % 11 === 0)) {
    const segs = byLink.get(l.id);
    assert.ok(segs.length >= 1 && new Set(segs.map((s) => s.t)).size === 1 && segs[0].t === l.t, `${l.id}: un solo tipo`);
    const first = segs[0].c; const last = segs.at(-1).c;
    assert.ok(Math.abs(first[0] - seat.get(l.a).lon) < 1e-3 && Math.abs(first[1] - seat.get(l.a).lat) < 1e-3, `${l.id}: parte dalla sede`);
    assert.ok(Math.abs(last.at(-2) - seat.get(l.b).lon) < 1e-3 && Math.abs(last.at(-1) - seat.get(l.b).lat) < 1e-3, `${l.id}: arriva alla sede`);
  }
  assert.ok(links.links.some((l) => l.t === 4) && links.links.some((l) => l.t === 1) && links.links.some((l) => l.t === 2) && links.links.some((l) => l.t === 3));
  assert.ok(links.links.every((l) => l.t >= 1 && l.t <= 4), 'scala a 4 gradini');
  assert.ok(links.segments.every((s) => !s.sea ? (s.k === 'road' && s.level <= 2) || (s.k === 'rail' && s.level === 2) : true), 'né autostrade né doppio binario');
  assert.ok((links.ladder ?? []).length === 4);
});

test('dati: gli angoli dei tracciati non dritti sono arrotondati (molti punti per curva, non spigoli)', () => {
  const links = read('links.json');
  const bendIds = new Set(links.links.filter((l) => l.how === 'bend').map((l) => l.id));
  const pts = links.segments.filter((s) => bendIds.has(s.link) && !s.br).map((s) => s.c.length / 2);
  assert.ok(pts.length > 500);
  const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
  assert.ok(avg > 3, `${avg.toFixed(1)} punti per tratto in media: con un solo spigolo sarebbero 3`);
});

test('dati: i tracciati restano dentro le due province (mai sul mare), le tratte marittime sono poche, brevi e senza ponti', async () => {
  const links = read('links.json');
  const provinces = await loadProvinces();
  const index = buildProvinceIndex(provinces);
  const idxOf = new Map(provinces.features.map((f, i) => [f.properties.id, i]));
  const provAt = (lon, lat) => { const h = index.provincesAt(lon, lat); return h.length === 0 ? -1 : idxOf.get(h[0].properties.id); };
  const byLink = new Map();
  for (const s of links.segments) (byLink.get(s.link) ?? byLink.set(s.link, []).get(s.link)).push(s);
  let n = 0; let ok = 0;
  for (const l of links.links.filter((x, i) => i % 9 === 0 && !x.sea && x.how !== 'third')) {
    for (const s of byLink.get(l.id)) for (let i = 0; i + 3 < s.c.length; i += 2) {
      for (const f of [0.25, 0.5, 0.75]) {
        const p = provAt(s.c[i] + (s.c[i + 2] - s.c[i]) * f, s.c[i + 1] + (s.c[i + 3] - s.c[i + 1]) * f);
        n += 1; if (p === l.a || p === l.b) ok += 1;
      }
    }
  }
  assert.ok(n > 1000 && ok / n > 0.97, `${ok}/${n} punti nelle due province`);
  const sea = links.links.filter((l) => l.sea);
  assert.ok(sea.length < links.links.length * 0.03, `${sea.length} tratte marittime`);
  assert.ok(sea.every((l) => l.km <= links.params.seaMaxKm && l.t === 1 && l.how === 'sea'));
  const seaSegs = links.segments.filter((s) => s.sea);
  assert.ok(seaSegs.length === sea.length && seaSegs.every((s) => s.k === 'sea' && !s.br), 'niente ponti sul mare');
  assert.ok(links.routes.straight > 1000 && links.routes.bend > 100 && links.routes.grid > 50, JSON.stringify(links.routes));
});

test('dati: strozzatura — nessun collegamento supera il gradino delle sue due province; ferrovia sopra strada', () => {
  const links = read('links.json');
  const nodeT = new Map(links.nodes.map((n) => [n.p, n.t]));
  for (const l of links.links) assert.ok(l.t <= Math.min(nodeT.get(l.a), nodeT.get(l.b)), l.id);
  for (const n of links.nodes) assert.equal(n.t, Math.max(...links.links.filter((l) => l.a === n.p || l.b === n.p).map((l) => l.t)), `sede ${n.p}`);
});

test('dati: ponti sul fiume (≤ 1,5 km), uno per fiume e collegamento, sul loro segmento', () => {
  const links = read('links.json');
  const model = buildRiverModel(read('rivers.json'), read('rivers_geo.json'));
  const segs = new Map(links.segments.map((s) => [s.id, s]));
  assert.ok(links.bridges.length > 300);
  assert.equal(links.segments.filter((s) => s.br).length, links.bridges.length, 'un ponte per ogni segmento-ponte');
  assert.equal(new Set(links.bridges.map((b) => `${b.link}|${b.riverId}`)).size, links.bridges.length, 'un ponte per fiume e collegamento');
  for (const b of links.bridges.filter((_, i) => i % 5 === 0)) {
    const s = segs.get(b.seg);
    assert.equal(s.br.r, b.riverId);
    assert.equal(s.link, b.link);
    assert.ok(distanceToRiverKm(model, b.riverId, b.lon, b.lat) < 1.5, `${b.id} lontano dal fiume`);
    assert.ok(b.t === s.t && b.km >= 0.05 && b.km < 6.5);
  }
});
