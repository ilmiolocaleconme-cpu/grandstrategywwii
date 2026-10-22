// Nodi di movimento delle zone urbane (src/data/cityLinks.js, data/city_links.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { buildRiverSegmentGrid } from '../src/data/transport.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { CITY_LINKS_SCHEMA, buildCityGraph, crossingOf, representativePoint, validateCityLinks } from '../src/data/cityLinks.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const zone = (id, city, geometry, mother = 'P_X_Y') => ({ type: 'Feature', properties: { id, cittaId: city, name: id, kind: 'citta', parentProvince: mother }, geometry });
const tile = (id, geometry) => ({ type: 'Feature', properties: { id, owner: 'X' }, geometry });
// un fiume verticale a lon 1.0, tra due parti di città
const riverGeo = (lon) => ({ features: [{ properties: { riverId: 'R_T', inLake: false }, geometry: { type: 'LineString', coordinates: [[lon, 39], [lon, 42]] } }] });

test('punto rappresentativo: dentro la zona, anche se concava', () => {
  const L = { type: 'Polygon', coordinates: [[[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]]] };
  const [x, y] = representativePoint(L);
  assert.ok((x > 0 && x < 3 && y > 0 && y < 1) || (x > 0 && x < 1 && y > 0 && y < 3), `${x},${y}`);
});

test('due parti di città divise da un fiume largo: collegamento con ponte intatto; fiume piccolo: guado; senza fiume: nessun attraversamento', () => {
  const widthOf = new Map([['R_T', 'large']]);
  assert.deepEqual(['bridge', 'intact'], [crossingOf([0.5, 40.5], [1.5, 40.5], buildRiverSegmentGrid(riverGeo(1)), widthOf).kind, crossingOf([0.5, 40.5], [1.5, 40.5], buildRiverSegmentGrid(riverGeo(1)), widthOf).state]);
  assert.equal(crossingOf([0.5, 40.5], [1.5, 40.5], buildRiverSegmentGrid(riverGeo(1)), new Map([['R_T', 'small']])).kind, 'ford');
  assert.equal(crossingOf([0.5, 40.5], [0.9, 40.5], buildRiverSegmentGrid(riverGeo(1)), widthOf), null);
});

test('grafo sintetico: ogni zona ha accesso alla provincia, le parti di una città sono collegate, il ponte c\'è dove passa il fiume', () => {
  const t = tile('P_X_Y', sq(-1, 39, 3, 42));
  const zones = [zone('Z1', 'C', sq(0.4, 40, 0.9, 40.5)), zone('Z2', 'C', sq(1.1, 40, 1.6, 40.5)), zone('Z3', 'D', sq(2, 41, 2.2, 41.2))];
  const g = buildCityGraph({ zones, tiles: [t], index: buildProvinceIndex({ features: [t] }), grid: buildRiverSegmentGrid(riverGeo(1)), widthOf: new Map([['R_T', 'large']]) });
  assert.equal(g.nodes.length, 3);
  assert.equal(g.links.filter((l) => l.type === 'access').length, 3);
  const part = g.links.filter((l) => l.type === 'part');
  assert.equal(part.length, 1);
  assert.equal(part[0].crossing.kind, 'bridge');
  const file = { schema: CITY_LINKS_SCHEMA, nodes: g.nodes, links: g.links };
  assert.deepEqual(validateCityLinks(file, { zoneIds: new Set(['Z1', 'Z2', 'Z3']), tileIds: new Set(['P_X_Y']), riverIds: new Set(['R_T']) }), []);
  // una parte scollegata dalla sua città è un errore
  assert.ok(validateCityLinks({ ...file, links: file.links.filter((l) => l.type !== 'part') }).some((e) => e.includes('non sono tutte collegate')));
});

test('dati reali: una zona urbana = un nodo, tutte con accesso, parti di una stessa città sempre connesse, somma di controllo valida', async () => {
  const file = read('city_links.json');
  const zones = read('citta_grandi.json').features;
  const provinces = await loadProvinces();
  assert.deepEqual(validateCityLinks(file, { zoneIds: new Set(zones.map((z) => z.properties.id)), tileIds: new Set(provinces.features.map((f) => f.properties.id)), riverIds: new Set(read('rivers.json').map((r) => r.id)) }), []);
  assert.equal(file.checksum, idsChecksum(zones.map((z) => z.properties.id)));
  assert.equal(file.nodes.length, zones.length);
});

test('dati reali: Budapest divisa dal Danubio: le parti si collegano solo da ponti sul fiume', () => {
  const file = read('city_links.json');
  const bud = file.links.filter((l) => l.type === 'part' && l.a.includes('BUDAPEST'));
  assert.ok(bud.length >= 2);
  assert.ok(bud.some((l) => l.crossing?.riverId === 'R_DANUBE' && l.crossing.kind === 'bridge'));
  assert.ok(bud.every((l) => l.crossing?.state === 'intact'));
});
