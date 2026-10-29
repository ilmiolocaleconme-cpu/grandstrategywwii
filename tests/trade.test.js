// Commercio v1 (29/10/2026): contratti via terra fra due nazioni — percorso, consegne con ritardo, conservazione, sospensione, schema 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet } from '../src/data/moveNet.js';
import { createTradeState, tradableGoods, findLandRoute, openContract, cancelContract, revalidateRoutes, tradeDay, inTransitTotal, validateTradeState, TRANSIT_KM_PER_DAY } from '../src/rules/trade.js';
import { openTradeContract, cancelTradeContract, createTradeSystem, migrateV6toV7 } from '../src/game/tradeState.js';
import { newGame, validateState, STATE_SCHEMA } from '../src/game/state.js';
import { parseSave, serializeSave } from '../src/game/save.js';
import { advanceDay } from '../src/game/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const economy = read('economy/economy.json');
const resources = read('resources.json');

// ---- rete sintetica: A1 - B1 - C1 - D1 in fila (A del venditore S, B di un terzo T, C del compratore K, D di K); X isolata di Z ----
const owner = { A1: 'S', B1: 'T', C1: 'K', D1: 'K', X1: 'Z' };
const adj = { A1: ['B1'], B1: ['A1', 'C1'], C1: ['B1', 'D1'], D1: ['C1'], X1: [] };
const net = { has: (m) => m in owner, provinces: () => Object.keys(owner), neighbors: (m) => adj[m], km: () => 250, owner: (m) => owner[m] };
const nations = () => ({ S: { balance: 100, stocks: { steel: 50, tanks: 7 } }, K: { balance: 20, stocks: {} }, T: { balance: 0, stocks: {} }, Z: { balance: 0, stocks: {} } });

test('merci commerciabili: quelle con prezzo (acciaio, carri, artiglieria sì; elettricità, uomini no)', () => {
  const g = tradableGoods(economy);
  assert.ok(g.includes('steel') && g.includes('tanks') && g.includes('artillery'));
  assert.ok(!g.includes('electricity') && !g.includes('manpower'));
});

test('percorso via terra: attraversa un terzo; nessun percorso se bloccato o isolato', () => {
  const r = findLandRoute(net, net.owner, 'S', 'K');
  assert.equal(r.ok, true); assert.deepEqual(r.provinces, ['A1', 'B1', 'C1']); assert.equal(r.km, 500); assert.deepEqual(r.via, ['T']);
  assert.equal(findLandRoute(net, net.owner, 'S', 'K', { blocked: new Set(['T']) }).reason, 'no_route');
  assert.equal(findLandRoute(net, net.owner, 'S', 'Z').reason, 'no_route');
  assert.equal(findLandRoute(net, net.owner, 'S', 'S').reason, 'same_nation');
});

const open = (order, route = findLandRoute(net, net.owner, 'S', 'K')) => openContract(createTradeState(), order, { economy, resources, nations: nations(), route, day: 0, date: '1936-01-01' });

test('apertura: prezzo di economy.json, ritardo = km / velocità; rifiuti motivati', () => {
  const r = open({ seller: 'S', buyer: 'K', good: 'steel', perDay: 10, days: 5 });
  assert.equal(r.ok, true);
  assert.equal(r.contract.unitPrice, economy.prices.steel);
  assert.equal(r.contract.transitDays, Math.ceil(500 / TRANSIT_KM_PER_DAY));
  assert.deepEqual(validateTradeState(r.state), []);
  const no = (o, reason, route) => assert.equal(open(o, route).reason, reason);
  no({ seller: 'S', buyer: 'K', good: 'electricity', perDay: 1, days: 1 }, 'not_tradable');
  no({ seller: 'S', buyer: 'K', good: 'steel', perDay: 0, days: 1 }, 'invalid_quantity');
  no({ seller: 'S', buyer: 'K', good: 'tanks', perDay: 1.5, days: 1 }, 'invalid_quantity');
  no({ seller: 'S', buyer: 'K', good: 'steel', perDay: 1, days: 0 }, 'invalid_duration');
  no({ seller: 'S', buyer: 'S', good: 'steel', perDay: 1, days: 1 }, 'same_nation');
  no({ seller: 'S', buyer: 'QQ', good: 'steel', perDay: 1, days: 1 }, 'unknown_buyer');
  no({ seller: 'S', buyer: 'Z', good: 'steel', perDay: 1, days: 1 }, 'no_route', findLandRoute(net, net.owner, 'S', 'Z'));
});

test('consegne: partenza e pagamento subito, arrivo dopo il ritardo; merce e denaro si conservano', () => {
  let { state: trade } = open({ seller: 'S', buyer: 'K', good: 'steel', perDay: 10, days: 3 });
  let ns = nations();
  const total = () => Object.values(ns).reduce((s, n) => s + (n.stocks.steel ?? 0), 0) + inTransitTotal(trade, 'steel');
  const cash = () => Object.values(ns).reduce((s, n) => s + n.balance, 0);
  const steel0 = total(); const cash0 = cash();
  const price = economy.prices.steel;
  for (let day = 0; day < 4; day += 1) { const r = tradeDay(trade, ns, { day, resources }); trade = r.trade; ns = r.nations; assert.ok(Math.abs(total() - steel0) < 1e-6 && Math.abs(cash() - cash0) < 1e-6, `giorno ${day}: conservazione`); }
  assert.equal(ns.S.stocks.steel, 20, 'tre spedizioni da 10 t partite');
  assert.equal(ns.K.stocks.steel ?? 0, 0, 'ancora nulla arrivato: il ritardo è di 5 giorni');
  assert.ok(Math.abs(ns.K.balance - (20 - 30 * price)) < 1e-6 && Math.abs(ns.S.balance - (100 + 30 * price)) < 1e-6);
  for (let day = 4; day < 9; day += 1) { const r = tradeDay(trade, ns, { day, resources }); trade = r.trade; ns = r.nations; }
  assert.equal(ns.K.stocks.steel, 30, 'tutto arrivato');
  const c = trade.contracts[0];
  assert.equal(c.status, 'ended'); assert.equal(c.delivered, 30); assert.equal(c.shortfallDays, 0); assert.deepEqual(c.inTransit, []);
});

test('scorta o cassa insufficienti: spedisce quanto può e segna i giorni mancati; i carri solo interi', () => {
  let { state: trade } = open({ seller: 'S', buyer: 'K', good: 'tanks', perDay: 3, days: 4 });
  let ns = nations(); ns.K.balance = 1.0; // 1,0 ECV / 0,6 = 1 carro al giorno al massimo
  const r0 = tradeDay(trade, ns, { day: 0, resources });
  assert.equal(r0.nations.S.stocks.tanks, 6, 'un solo carro: limitato dalla cassa');
  assert.ok(r0.events.some((e) => e.type === 'shortfall' && e.sent === 1 && e.wanted === 3));
  assert.equal(r0.trade.contracts[0].shortfallDays, 1);
  ns = { ...nations(), K: { balance: 1e6, stocks: {} } }; ns.S.stocks.tanks = 4;
  const r1 = tradeDay(trade, ns, { day: 0, resources });
  assert.equal(r1.nations.S.stocks.tanks, 1, 'consegna 3 pezzi interi');
  const r2 = tradeDay(r1.trade, r1.nations, { day: 1, resources });
  assert.equal(r2.nations.S.stocks.tanks, 0, 'ne restava 1: spedito 1, mancano 2');
  assert.equal(r2.trade.contracts[0].shortfallDays, 1);
});

test('sospensione se il percorso sparisce, ripresa quando torna; annullamento: la merce già partita arriva', () => {
  const { state: t0 } = open({ seller: 'S', buyer: 'K', good: 'steel', perDay: 5, days: 30 });
  const cut = { ...net, owner: (m) => (m === 'B1' ? 'W' : owner[m]) };
  const blocked = revalidateRoutes(t0, { net: cut, ownerOf: cut.owner, blocked: new Set(['W']) });
  assert.equal(blocked.contracts[0].status, 'suspended');
  let ns = nations();
  const idle = tradeDay(blocked, ns, { day: 0, resources });
  assert.equal(idle.nations.S.stocks.steel, 50, 'sospeso: non parte nulla');
  const back = revalidateRoutes(blocked, { net, ownerOf: net.owner });
  assert.equal(back.contracts[0].status, 'active');
  let tr = back;
  const sent = tradeDay(tr, ns, { day: 0, resources }); tr = sent.trade; ns = sent.nations;
  const cancelled = cancelContract(tr, tr.contracts[0].id); assert.equal(cancelled.ok, true);
  assert.equal(cancelContract(cancelled.state, tr.contracts[0].id).reason, 'already_closed');
  assert.equal(cancelContract(tr, 'TR-9999').reason, 'unknown_contract');
  let ct = cancelled.state;
  for (let day = 1; day < 8; day += 1) { const r = tradeDay(ct, ns, { day, resources }); ns = r.nations; ct = r.trade; }
  assert.equal(ns.K.stocks.steel, 5, 'la spedizione partita prima dell\'annullamento è arrivata, nessun\'altra è partita');
});

test('validazione: id duplicato, stato sconosciuto, durata non valida', () => {
  const { state } = open({ seller: 'S', buyer: 'K', good: 'steel', perDay: 1, days: 2 });
  const bad = (mut, re) => { const d = structuredClone(state); mut(d); assert.ok(validateTradeState(d).some((e) => re.test(e)), String(re)); };
  bad((d) => { d.contracts.push({ ...d.contracts[0] }); }, /duplicato/);
  bad((d) => { d.contracts[0].status = 'boh'; }, /stato/);
  bad((d) => { d.contracts[0].endDay = -1; }, /durata/);
  bad((d) => { d.contracts[0].seller = d.contracts[0].buyer; }, /venditore/);
  bad((d) => { d.nextId = 1; }, /nextId/);
  assert.match(validateTradeState({ schema: 'x' })[0], /schema/);
});

// ---- schema 7 e rete reale ------------------------------------------------------------------------------------------
const political = read('political_1936.json');
const nationIds = read('nations.json').map((n) => n.id);
const start = { nationIds, industry: read('industry/initial_industry.json'), stocks: read('industry/initial_stocks.json') };
const game = (nation = 'ITA') => newGame({ nation, political, ownersWithProvinces: nationIds, start }).state;

test('schema 7: partita nuova con commercio vuoto; migrazione 6→7; salvataggio e ricarica', () => {
  assert.equal(STATE_SCHEMA, 7);
  const g = game();
  assert.deepEqual(g.trade, { schema: 'trade-v1', nextId: 1, contracts: [] });
  assert.deepEqual(validateState(g), []);
  const { trade, ...old } = g;
  const m = migrateV6toV7({ ...old, schema: 6 });
  assert.equal(m.schema, 7); assert.deepEqual(m.trade, createTradeState());
  const r = parseSave(JSON.stringify({ format: 'grandstrategywwii-save', schema: 6, savedAt: null, label: '', state: { ...old, schema: 6 } }));
  if (r.ok) { assert.equal(r.migratedFrom, 6); assert.equal(r.state.schema, 7); assert.deepEqual(r.state.trade, createTradeState()); }
  const back = parseSave(serializeSave(g));
  assert.equal(back.ok, true); assert.deepEqual(back.state.trade, g.trade);
});

const collection = await loadProvinces();
const realNet = buildMoveNet(collection, read('adjacency.json'));

test('rete reale: Germania → Cecoslovacchia via terra sì; Regno Unito → Germania via terra no (serve il mare, non ancora implementato)', () => {
  const ok = findLandRoute(realNet, (m) => realNet.owner(m), 'DEU', 'CZE');
  assert.equal(ok.ok, true); assert.ok(ok.km > 0 && ok.km < 1500, `km ${ok.km}`);
  const sea = findLandRoute(realNet, (m) => realNet.owner(m), 'GBR', 'DEU');
  assert.equal(sea.ok, false); assert.equal(sea.reason, 'no_route');
});

test('partita: contratto DEU→CZE, giorni di gioco con il sistema giornaliero; senza rete l\'ordine è rifiutato', () => {
  let g = game('DEU');
  g = { ...g, nations: { ...g.nations, CZE: { ...g.nations.CZE, balance: 500 } } };
  const order = { seller: 'DEU', buyer: 'CZE', good: 'steel', perDay: 40, days: 10 }; // la Germania ha 500 t di acciaio in scorta all'inizio e qui il sistema economico non gira
  assert.equal(openTradeContract(g, order, { economy, resources, net: null }).reason, 'no_map');
  const r = openTradeContract(g, order, { economy, resources, net: realNet });
  assert.equal(r.ok, true); g = r.state;
  assert.deepEqual(validateState(g), []);
  const sys = createTradeSystem({ resources, getNet: () => realNet });
  const steel0 = g.nations.DEU.stocks.steel + g.nations.CZE.stocks.steel;
  for (let i = 0; i < 25; i += 1) g = advanceDay(g, [sys]);
  const c = g.trade.contracts[0];
  assert.equal(c.status, 'ended'); assert.equal(c.delivered, 400); assert.deepEqual(c.inTransit, []);
  assert.equal(g.nations.DEU.stocks.steel + g.nations.CZE.stocks.steel, steel0, 'acciaio conservato');
  assert.ok(Math.abs(c.paid - 400 * economy.prices.steel) < 1e-6);
  assert.equal(cancelTradeContract(g, c.id).reason, 'already_closed');
});
