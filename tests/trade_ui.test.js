// Interfaccia del commercio (29/10/2026): merci, anteprima del contratto (terra e mare), righe dei contratti, apertura e annullo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet } from '../src/data/moveNet.js';
import { newGame } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createGameSea } from '../src/game/seaState.js';
import { createTradeSystem, openTradeContract, cancelTradeContract } from '../src/game/tradeState.js';
import { entityOfProvinceId } from '../src/data/provinceOwner.js';
import { tradeGoods, previewTrade, tradeRows, describeTradeFailure, modeName } from '../src/ui/tradeView.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const economy = read('economy/economy.json'); const resources = read('resources.json'); const political = read('political_1936.json');
const nationIds = read('nations.json').map((n) => n.id);
const collection = await loadProvinces(); const props = collection.features.map((f) => f.properties);
const net = buildMoveNet(collection, read('adjacency.json'));
const motherById = new Map(props.map((p) => [p.id, p.parentProvince ?? p.id])); const entityIds = political.map((e) => e.id);
const entityOf = (id) => entityOfProvinceId(id, entityIds);
const sea = createGameSea({ seaFile: read('sea_zones.json'), params: read('sea_routes_params.json'), provinceIds: props.map((p) => p.id), motherOf: (id) => motherById.get(id) ?? id, entityOf, ports: { coastal: read('ports/coastal_cities.json').cities, base: read('ports/ports_1936.json') } });
const start = { nationIds, industry: read('industry/initial_industry.json'), stocks: read('industry/initial_stocks.json'), cash: read('industry/initial_cash.json'), economy, population: read('population/population.json') };
const fresh = () => newGame({ nation: 'DEU', political, ownersWithProvinces: nationIds, start }).state;
const ctx = (s) => ({ economy, resources, net, sea: sea.at(s) });

test('merci: solo quelle con prezzo, con nome, unità e prezzo; carri e artiglieria in pezzi', () => {
  const g = tradeGoods(economy, resources);
  assert.ok(g.length > 20 && g.every((x) => x.name && x.price > 0));
  assert.equal(g.find((x) => x.id === 'tanks').unit, 'pezzi'); assert.equal(g.find((x) => x.id === 'steel').unit, 't');
  assert.ok(!g.some((x) => x.id === 'electricity'));
  assert.deepEqual(g.map((x) => x.name), [...g.map((x) => x.name)].sort((a, b) => a.localeCompare(b, 'it')));
});

test('anteprima: via terra Germania→Francia, via mare Germania→Italia, la più rapida (auto); stato invariato', () => {
  const s = fresh(); const before = JSON.stringify(s);
  const land = previewTrade(s, { seller: 'DEU', buyer: 'FRA', good: 'steel', perDay: 10, days: 20, mode: 'land' }, ctx(s));
  assert.equal(land.ok, true, land.message); assert.equal(land.route.kind, 'land'); assert.ok(land.route.km > 0 && land.route.days >= 1);
  assert.equal(land.valuePerDay, Math.round(10 * economy.prices.steel * 1000) / 1000); assert.equal(land.totalValue, Math.round(land.valuePerDay * 20 * 1000) / 1000);
  const water = previewTrade(s, { seller: 'DEU', buyer: 'ITA', good: 'steel', perDay: 10, days: 20, mode: 'sea' }, ctx(s));
  assert.equal(water.ok, true, water.message); assert.equal(water.route.kind, 'sea'); assert.ok(water.route.ports.from && water.route.ports.to);
  const auto = previewTrade(s, { seller: 'DEU', buyer: 'ITA', good: 'steel', perDay: 10, days: 20, mode: 'auto' }, ctx(s));
  assert.equal(auto.ok, true); assert.ok(['land', 'sea'].includes(auto.route.kind));
  assert.equal(JSON.stringify(s), before, 'la prova a secco non cambia lo stato');
});

test('anteprima: avvisi (scorta insufficiente, cassa insufficiente) e rifiuti con frasi in italiano', () => {
  const s = fresh();
  const big = previewTrade(s, { seller: 'DEU', buyer: 'FRA', good: 'steel', perDay: 1e9, days: 5, mode: 'land' }, ctx(s));
  assert.equal(big.ok, true); assert.ok(big.warnings.some((w) => /scorta/.test(w)) && big.warnings.some((w) => /cassa/.test(w)));
  const noSea = previewTrade(s, { seller: 'DEU', buyer: 'FRA', good: 'steel', perDay: 5, days: 5, mode: 'sea' }, { ...ctx(s), sea: null });
  assert.equal(noSea.ok, false); assert.equal(noSea.message, describeTradeFailure('no_sea'));
  assert.equal(previewTrade(s, { seller: 'DEU', buyer: 'DEU', good: 'steel', perDay: 5, days: 5, mode: 'land' }, ctx(s)).message, describeTradeFailure('same_nation'));
  assert.match(previewTrade(s, { seller: 'DEU', buyer: 'FRA', good: 'electricity', perDay: 5, days: 5, mode: 'land' }, ctx(s)).message, /non si può commerciare/);
  assert.match(previewTrade(s, { seller: 'DEU', buyer: 'FRA', good: 'tanks', perDay: 1.5, days: 5, mode: 'land' }, ctx(s)).message, /pezzi/);
  assert.match(previewTrade(s, { seller: 'DEU', buyer: 'CHE', good: 'steel', perDay: 5, days: 5, mode: 'sea' }, ctx(s)).message, /porti/);
  assert.equal(modeName('sea'), 'via mare');
});

test('contratti: aperto, in elenco con ruolo e partner, la merce arriva, annullato non si può annullare di nuovo', () => {
  const goods = tradeGoods(economy, resources);
  let s = fresh();
  const r = openTradeContract(s, { seller: 'DEU', buyer: 'FRA', good: 'steel', perDay: 5, days: 10, mode: 'land' }, ctx(s));
  assert.equal(r.ok, true, JSON.stringify(r)); s = r.state;
  let rows = tradeRows(s, 'DEU', { nationName: (id) => `N-${id}`, goods });
  assert.equal(rows.length, 1); assert.equal(rows[0].role, 'vendi'); assert.equal(rows[0].partner, 'N-FRA'); assert.equal(rows[0].good, 'Acciaio'); assert.equal(rows[0].canCancel, true);
  assert.equal(tradeRows(s, 'FRA', { goods })[0].role, 'compri'); assert.equal(tradeRows(s, 'ITA', { goods }).length, 0);
  const system = createTradeSystem({ resources, getNet: () => net });
  for (let i = 0; i < 8; i += 1) s = system(advanceDay(s, []));
  rows = tradeRows(s, 'DEU', { goods });
  assert.ok(rows[0].paid > 0 && rows[0].delivered + rows[0].inTransit > 0 && rows[0].status === 'active', JSON.stringify(rows[0]));
  const c = cancelTradeContract(s, rows[0].id); assert.equal(c.ok, true);
  assert.equal(tradeRows(c.state, 'DEU', { goods })[0].canCancel, false); assert.equal(tradeRows(c.state, 'DEU', { goods })[0].statusName, 'annullato');
  assert.equal(cancelTradeContract(c.state, rows[0].id).ok, false);
});
