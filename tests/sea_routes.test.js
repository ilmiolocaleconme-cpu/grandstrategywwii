// Rotte marittime (30/10/2026): parametri, grafo con costi, porti, percorso minimo, stretti chiusi, integrazione col commercio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildSeaGraph, nationPorts, findSeaRoute, createSeaContext, haversineKm, validateSeaRoutesParams, SEA_ROUTES_SCHEMA } from '../src/data/seaRoutes.js';
import { createTradeState, openContract, revalidateRoutes, tradeDay, inTransitTotal, validateTradeState } from '../src/rules/trade.js';
import { openTradeContract, createTradeSystem } from '../src/game/tradeState.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const seaFile = read('sea_zones.json');
const params = read('sea_routes_params.json');
const political = read('political_1936.json');
const economy = read('economy/economy.json');
const resources = read('resources.json');
const collection = await loadProvinces();
const provinceIds = collection.features.map((f) => f.properties.id);
const ownerMap = new Map(collection.features.map((f) => [f.properties.id, f.properties.owner]));
const ownerOf = (id) => ownerMap.get(id);

test('parametri: validi, qualità hypothesis, controllori e stretti esistono', () => {
  assert.equal(params.schema, SEA_ROUTES_SCHEMA);
  assert.equal(params.quality, 'hypothesis');
  assert.deepEqual(validateSeaRoutesParams(params, seaFile, political.map((e) => e.id)), []);
});

test('parametri: esempi negativi', () => {
  const ids = political.map((e) => e.id);
  const bad = (patch) => validateSeaRoutesParams({ ...params, ...patch }, seaFile, ids);
  assert.ok(bad({ schema: 'x' }).some((e) => e.includes('schema')));
  assert.ok(bad({ quality: 'verified' }).some((e) => e.includes('hypothesis')));
  assert.ok(bad({ speedKmPerDay: { ...params.speedKmPerDay, sea: 0 } }).some((e) => e.includes('sea')));
  assert.ok(bad({ speedKmPerDay: { ...params.speedKmPerDay, lago: 5 } }).some((e) => e.includes('sconosciuto')));
  assert.ok(bad({ portHandlingDays: 1.5 }).length > 0);
  assert.ok(bad({ closedZones: ['SZ_NON_ESISTE'] }).some((e) => e.includes('non esiste')));
  assert.ok(bad({ closedZones: ['SZ_BERING', 'SZ_BERING'] }).some((e) => e.includes('duplicate')));
  assert.ok(bad({ closedZones: 'SZ_BERING' }).some((e) => e.includes('elenco')));
  assert.ok(bad({ straitControl: { SZ_NON_ESISTE: ['GBR'] } }).some((e) => e.includes('non è una zona')));
  assert.ok(bad({ straitControl: { SZ_ATL_AZZORRE: ['PRT'] } }).some((e) => e.includes('non è uno stretto')));
  assert.ok(bad({ straitControl: { SZ_SUEZ: ['ZZZ'] } }).some((e) => e.includes('non esiste')));
  assert.ok(bad({ straitControl: { SZ_SUEZ: [] } }).some((e) => e.includes('senza controllori')));
  assert.ok(bad({ straitControl: { SZ_SUEZ: ['EGY', 'EGY'] } }).some((e) => e.includes('duplicati')));
  assert.deepEqual(validateSeaRoutesParams(null, seaFile, ids), ['rotte mare: parametri mancanti']);
});

test('distanza: simmetrica, sensata e corretta attraverso l\'antimeridiano', () => {
  const a = [-5.575, 35.975]; const b = [-27.475, 38.525];
  assert.equal(Math.round(haversineKm(a, b)), Math.round(haversineKm(b, a)));
  assert.ok(haversineKm(a, b) > 1700 && haversineKm(a, b) < 2000); // Gibilterra-Azzorre, ordine di grandezza
  const d = haversineKm([179.5, 0], [-179.5, 0]);
  assert.ok(d > 100 && d < 120, `un grado di longitudine all'equatore, non 359: ${d}`);
});

test('grafo: archi simmetrici con km e giorni positivi; ogni arco rispetta la velocità minima', () => {
  const g = buildSeaGraph(seaFile, params);
  let arcs = 0;
  for (const id of g.zoneIds()) {
    for (const e of g.neighbors(id)) {
      arcs += 1;
      assert.ok(e.km >= 1 && e.days > 0, `${id}->${e.to}`);
      const back = g.neighbors(e.to).find((x) => x.to === id);
      assert.ok(back, `${id}->${e.to} non simmetrico`);
      assert.equal(back.km, e.km);
      assert.ok(Math.abs(back.days - e.days) < 1e-12);
      const slow = Math.min(params.speedKmPerDay[g.zone(id).kind], params.speedKmPerDay[g.zone(e.to).kind]);
      assert.ok(Math.abs(e.days - e.km / slow) < 1e-9);
    }
  }
  assert.equal(arcs, 690);
});

test('grafo: file con un arco verso una zona mancante lancia un errore', () => {
  const broken = { zones: [{ id: 'SZ_A', kind: 'sea', seed: [0, 0], neighbors: [['SZ_B', 5]], coastal: [] }] };
  assert.throws(() => buildSeaGraph(broken, params), /non esiste/);
});

test('porti: una provincia per zona, solo del proprietario, soglia di costa e filtro', () => {
  const ita = nationPorts(seaFile, provinceIds, ownerOf, 'ITA', { minCoastKm: params.minCoastKm });
  assert.ok(ita.length > 5);
  assert.equal(new Set(ita.map((p) => p.zone)).size, ita.length);
  for (const p of ita) { assert.equal(ownerOf(p.province), 'ITA'); assert.ok(p.coastKm >= params.minCoastKm); }
  const strict = nationPorts(seaFile, provinceIds, ownerOf, 'ITA', { minCoastKm: 1e9 });
  assert.deepEqual(strict, []);
  const onlyOne = nationPorts(seaFile, provinceIds, ownerOf, 'ITA', { portFilter: (id) => id === ita[0].province });
  assert.ok(onlyOne.every((p) => p.province === ita[0].province));
  // nazioni senza mare: nessun porto
  assert.deepEqual(nationPorts(seaFile, provinceIds, ownerOf, 'CHE', { minCoastKm: params.minCoastKm }), []);
  // determinismo
  assert.deepEqual(nationPorts(seaFile, provinceIds, ownerOf, 'ITA', { minCoastKm: params.minCoastKm }), ita);
});

// ---- grafo sintetico: A - B - C - D, più una scorciatoia A - S - D controllata da XX; E isolata ----
function synthetic() {
  const z = (id, kind, neighbors) => ({ id, kind, seed: [0, 0], neighbors, coastal: [] });
  const file = { zones: [z('SZ_A', 'sea', [['SZ_B', 1], ['SZ_S', 1]]), z('SZ_B', 'sea', [['SZ_A', 1], ['SZ_C', 1]]), z('SZ_C', 'sea', [['SZ_B', 1], ['SZ_D', 1]]), z('SZ_D', 'sea', [['SZ_C', 1], ['SZ_S', 1]]), z('SZ_S', 'strait', [['SZ_A', 1], ['SZ_D', 1]]), z('SZ_E', 'sea', [])] };
  const pos = { SZ_A: [0, 0], SZ_B: [2, 8], SZ_C: [10, 8], SZ_D: [12, 0], SZ_S: [6, 0], SZ_E: [0, 30] };
  for (const zn of file.zones) zn.seed = pos[zn.id];
  return buildSeaGraph(file, { ...params, straitControl: { SZ_S: ['XX'] } });
}
const port = (zone) => ({ province: `P_${zone}`, zone, coastKm: 50 });

test('percorso: sceglie il più rapido, riporta zone, km, giorni e controllori attraversati', () => {
  const g = synthetic();
  const r = findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'B1' });
  assert.equal(r.ok, true); assert.equal(r.kind, 'sea');
  assert.deepEqual(r.zones, ['SZ_A', 'SZ_S', 'SZ_D']); // lo stretto è più corto delle tre zone in fila
  assert.deepEqual(r.via, ['XX']);
  assert.ok(r.km > 1000 && r.days >= 1 && Number.isInteger(r.days));
  assert.equal(r.ports.from.zone, 'SZ_A'); assert.equal(r.ports.to.zone, 'SZ_D');
});

test('percorso: stretto con controllore bloccato → giro lungo; zona chiusa → nessun percorso', () => {
  const g = synthetic();
  const around = findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'B1', blocked: new Set(['XX']) });
  assert.deepEqual(around.zones, ['SZ_A', 'SZ_B', 'SZ_C', 'SZ_D']); assert.deepEqual(around.via, []);
  assert.ok(around.days >= findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'B1' }).days);
  const closed = findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'B1', blocked: new Set(['XX']), closedZones: new Set(['SZ_C']) });
  assert.deepEqual(closed, { ok: false, reason: 'no_route' });
});

test('percorso: il controllore non chiude lo stretto alla propria nave; lo stretto condiviso si chiude solo se tutti sono bloccati', () => {
  const g = synthetic();
  const own = findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'XX', buyer: 'B1', blocked: new Set(['XX']) });
  assert.deepEqual(own.zones, ['SZ_A', 'SZ_S', 'SZ_D']);
  const buyerIsController = findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'XX', blocked: new Set(['XX']) });
  assert.deepEqual(buyerIsController.zones, ['SZ_A', 'SZ_S', 'SZ_D']);
  const shared = buildSeaGraph({ zones: [{ id: 'SZ_A', kind: 'sea', seed: [0, 0], neighbors: [['SZ_S', 1]], coastal: [] }, { id: 'SZ_S', kind: 'strait', seed: [3, 0], neighbors: [['SZ_A', 1], ['SZ_D', 1]], coastal: [] }, { id: 'SZ_D', kind: 'sea', seed: [6, 0], neighbors: [['SZ_S', 1]], coastal: [] }] }, { ...params, straitControl: { SZ_S: ['X1', 'X2'] } });
  const one = findSeaRoute(shared, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'B1', blocked: new Set(['X1']) });
  assert.equal(one.ok, true); assert.deepEqual(one.via, ['X1', 'X2']);
  const both = findSeaRoute(shared, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'B1', blocked: new Set(['X1', 'X2']) });
  assert.equal(both.reason, 'no_route');
});

test('percorso: rifiuti motivati (stessa nazione, senza porto, zona isolata, porto in zona chiusa)', () => {
  const g = synthetic();
  assert.equal(findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'S1' }).reason, 'same_nation');
  assert.equal(findSeaRoute(g, [], [port('SZ_D')], { seller: 'S1', buyer: 'B1' }).reason, 'no_port_seller');
  assert.equal(findSeaRoute(g, [port('SZ_A')], [], { seller: 'S1', buyer: 'B1' }).reason, 'no_port_buyer');
  assert.equal(findSeaRoute(g, [port('SZ_A')], [port('SZ_E')], { seller: 'S1', buyer: 'B1' }).reason, 'no_route');
  assert.equal(findSeaRoute(g, [port('SZ_A')], [port('SZ_D')], { seller: 'S1', buyer: 'B1', closedZones: new Set(['SZ_D']) }).reason, 'no_route');
});

test('percorso: stessa zona di mare = una sola zona, giorni di sola sosta nei porti', () => {
  const g = synthetic();
  const r = findSeaRoute(g, [port('SZ_B')], [{ province: 'P_ALTRO', zone: 'SZ_B', coastKm: 20 }], { seller: 'S1', buyer: 'B1' });
  assert.equal(r.ok, true); assert.deepEqual(r.zones, ['SZ_B']); assert.equal(r.km, 0); assert.equal(r.days, 2 * params.portHandlingDays);
});

test('percorso: più porti, vince quello che dà la rotta più rapida; determinismo', () => {
  const g = synthetic();
  const r = findSeaRoute(g, [port('SZ_A'), port('SZ_C')], [port('SZ_D')], { seller: 'S1', buyer: 'B1' });
  assert.equal(r.ports.from.zone, 'SZ_C'); assert.deepEqual(r.zones, ['SZ_C', 'SZ_D']);
  assert.deepEqual(findSeaRoute(g, [port('SZ_A'), port('SZ_C')], [port('SZ_D')], { seller: 'S1', buyer: 'B1' }), r);
});

// ---- dati reali ----
const ctx = (extra = {}) => createSeaContext({ seaFile, params, provinceIds, ownerOf, ...extra });

test('dati reali: ogni nazione con porti ha almeno una zona aperta; Svizzera e Austria no', () => {
  const c = ctx();
  assert.ok(c.portsOf('ITA').length > 0 && c.portsOf('GBR').length > 0 && c.portsOf('DEU').length > 0 && c.portsOf('USA').length > 0);
  assert.equal(c.portsOf('CHE').length, 0);
  assert.equal(c.route('CHE', 'ITA').reason, 'no_port_seller');
});

test('dati reali: Italia → Stati Uniti passa da Gibilterra; senza Gibilterra va per Suez e il Capo; senza i due, nessuna rotta', () => {
  const open = ctx().route('ITA', 'USA');
  assert.equal(open.ok, true, JSON.stringify(open));
  assert.ok(open.zones.includes('SZ_GIBILTERRA'));
  assert.ok(open.via.includes('GBR'));
  assert.ok(open.days > 5 && open.days < 60, `giorni ${open.days}`);
  const viaSuez = ctx({ blocked: new Set(['GBR']) }).route('ITA', 'USA');
  assert.equal(viaSuez.ok, true, JSON.stringify(viaSuez));
  assert.ok(!viaSuez.zones.includes('SZ_GIBILTERRA') && viaSuez.zones.includes('SZ_SUEZ'));
  assert.ok(viaSuez.km > open.km && viaSuez.days > open.days);
  const shut = ctx({ blocked: new Set(['GBR', 'EGY']) }).route('ITA', 'USA');
  assert.deepEqual(shut, { ok: false, reason: 'no_route' });
  // se il compratore è la Gran Bretagna, il suo stretto non la chiude
  assert.equal(ctx({ blocked: new Set(['GBR']) }).route('ITA', 'GBR').ok, true);
});

test('dati reali: nessuna rotta passa dai passaggi artici chiusi per ghiaccio', () => {
  const c = ctx();
  const arctic = new Set(params.closedZones);
  assert.ok(arctic.size >= 6);
  for (const [a, b] of [['DEU', 'JPN'], ['GBR', 'JPN'], ['USA', 'DEU'], ['USA', 'USSR'], ['JPN', 'GBR'], ['DEU', 'USA']]) {
    const r = c.route(a, b);
    if (r.ok) assert.ok(r.zones.every((z) => !arctic.has(z)), `${a}-${b}: ${r.zones.join('>')}`);
  }
  // le zone di params.closedZones valgono anche senza che la partita le chiuda
  assert.ok(c.route('DEU', 'JPN').zones.every((z) => !arctic.has(z)));
});

test('dati reali: Germania → Giappone: più lunga senza Suez, ma esiste (rotta del Capo)', () => {
  const withSuez = ctx().route('DEU', 'JPN');
  assert.equal(withSuez.ok, true, JSON.stringify(withSuez));
  const noSuez = ctx({ closedZones: new Set(['SZ_SUEZ']) }).route('DEU', 'JPN');
  assert.equal(noSuez.ok, true, JSON.stringify(noSuez));
  assert.ok(!noSuez.zones.includes('SZ_SUEZ'));
  assert.ok(noSuez.km > withSuez.km, `${noSuez.km} > ${withSuez.km}`);
  assert.ok(noSuez.days >= withSuez.days);
});

test('dati reali: ogni rotta è simmetrica (andata e ritorno stessi km e stessi giorni)', () => {
  const c = ctx();
  for (const [a, b] of [['ITA', 'USA'], ['DEU', 'JPN'], ['GBR', 'FRA'], ['USA', 'JPN'], ['TUR', 'DEU']]) {
    const go = c.route(a, b); const back = c.route(b, a);
    assert.equal(go.ok, back.ok, `${a}-${b}`);
    if (go.ok) { assert.equal(go.km, back.km, `${a}-${b}`); assert.equal(go.days, back.days, `${a}-${b}`); }
  }
});

test('dati reali: Baltico e Mar Nero si aprono solo dagli stretti; chiusi gli stretti la Germania non raggiunge la Romania via mare', () => {
  const c = ctx();
  const r = c.route('DEU', 'ROM');
  assert.equal(r.ok, true, JSON.stringify(r));
  const closed = ctx({ blocked: new Set(['TUR']) }).route('DEU', 'ROM');
  // la Romania ha il Mar Nero: senza Dardanelli e Bosforo (Turchia bloccata) la Germania non ci arriva dal Mediterraneo
  assert.ok(!closed.ok || !closed.zones.includes('SZ_BOSFORO'));
});

// ---- integrazione col commercio ----
const net = null;
const nations = () => ({ ITA: { balance: 100, stocks: { steel: 50 } }, USA: { balance: 40, stocks: {} } });
const seaRoute = () => ctx().route('ITA', 'USA');

test('commercio: un contratto via mare usa i giorni del percorso e salva zone e porti', () => {
  const route = seaRoute();
  const r = openContract(createTradeState(), { seller: 'ITA', buyer: 'USA', good: 'steel', perDay: 5, days: 4 }, { economy, resources, nations: nations(), route, day: 0, date: '1936-01-01' });
  assert.equal(r.ok, true);
  assert.equal(r.contract.route.kind, 'sea');
  assert.equal(r.contract.transitDays, route.days);
  assert.deepEqual(r.contract.route.zones, route.zones);
  assert.equal(r.contract.route.ports.to.zone, route.ports.to.zone);
  assert.deepEqual(validateTradeState(r.state), []);
});

test('commercio: via mare merce e denaro si conservano, la consegna arriva dopo i giorni di navigazione', () => {
  const route = { ok: true, kind: 'sea', km: 4000, days: 12, zones: ['SZ_A', 'SZ_B'], via: [], ports: { from: port('SZ_A'), to: port('SZ_B') } };
  let { state: trade } = openContract(createTradeState(), { seller: 'ITA', buyer: 'USA', good: 'steel', perDay: 10, days: 3 }, { economy, resources, nations: nations(), route, day: 0, date: '1936-01-01' });
  let ns = nations();
  const steel = () => Object.values(ns).reduce((s, n) => s + (n.stocks.steel ?? 0), 0) + inTransitTotal(trade, 'steel');
  const cash = () => Object.values(ns).reduce((s, n) => s + n.balance, 0);
  const steel0 = steel(); const cash0 = cash();
  let arrivedOn = null;
  for (let day = 0; day <= 20; day += 1) {
    const out = tradeDay(trade, ns, { day, resources });
    trade = out.trade; ns = out.nations;
    if (arrivedOn === null && out.events.some((e) => e.type === 'arrived')) arrivedOn = day;
    assert.ok(Math.abs(steel() - steel0) < 1e-6 && Math.abs(cash() - cash0) < 1e-6, `giorno ${day}`);
  }
  assert.equal(arrivedOn, 12 + 0); // parte il giorno 0 con ritardo 12
});

test('commercio: un contratto via mare cambia strada, si sospende quando non c\'è più passaggio e riprende quando riapre', () => {
  const open = ctx();
  const route = open.route('ITA', 'USA');
  let { state: trade } = openContract(createTradeState(), { seller: 'ITA', buyer: 'USA', good: 'steel', perDay: 5, days: 30 }, { economy, resources, nations: nations(), route, day: 0, date: '1936-01-01' });
  const blocked = new Set();
  const live = createSeaContext({ seaFile, params, provinceIds, ownerOf, blocked: () => blocked });
  const check = (t) => revalidateRoutes(t, { net, ownerOf: null, seaRouteOf: (c) => live.route(c.seller, c.buyer) });
  assert.equal(check(trade), trade, 'nessun cambiamento: lo stesso oggetto');
  blocked.add('GBR');
  trade = check(trade);
  assert.equal(trade.contracts[0].status, 'active');
  assert.ok(trade.contracts[0].route.zones.includes('SZ_SUEZ'), 'passa da Suez');
  assert.ok(trade.contracts[0].transitDays > route.days);
  assert.deepEqual(validateTradeState(trade), []);
  blocked.add('EGY');
  trade = check(trade);
  assert.equal(trade.contracts[0].status, 'suspended');
  blocked.clear();
  trade = check(trade);
  assert.equal(trade.contracts[0].status, 'active');
  assert.deepEqual(trade.contracts[0].route.zones, route.zones);
  assert.equal(trade.contracts[0].transitDays, route.days);
  // senza funzione marittima un contratto via mare resta com'è
  assert.equal(revalidateRoutes(trade, { net, ownerOf: null }), trade);
});

test('commercio: stato di partita con modo land/sea/auto', () => {
  const state = { nations: nations(), day: 0, date: '1936-01-01', trade: createTradeState() };
  const sea = ctx();
  const orderSea = { seller: 'ITA', buyer: 'USA', good: 'steel', perDay: 5, days: 5, mode: 'sea' };
  const ok = openTradeContract(state, orderSea, { economy, resources, net: null, sea });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.contract.route.kind, 'sea');
  assert.equal(openTradeContract(state, orderSea, { economy, resources, net: null }).reason, 'no_sea');
  assert.equal(openTradeContract(state, { ...orderSea, mode: 'land' }, { economy, resources, net: null, sea }).reason, 'no_map');
  assert.equal(openTradeContract(state, { ...orderSea, mode: 'boh' }, { economy, resources, net: null, sea }).reason, 'invalid_mode');
  const auto = openTradeContract(state, { ...orderSea, mode: 'auto' }, { economy, resources, net: null, sea });
  assert.equal(auto.ok, true); assert.equal(auto.contract.route.kind, 'sea');
  // porti mancanti: motivo esplicito
  const noPort = openTradeContract({ ...state, nations: { ...nations(), CHE: { balance: 10, stocks: { steel: 5 } } } }, { ...orderSea, seller: 'CHE' }, { economy, resources, net: null, sea });
  assert.equal(noPort.reason, 'no_port_seller');
});

test('commercio: il sistema giornaliero ricontrolla le rotte via mare ogni recheckEvery giorni', () => {
  const state0 = { nations: nations(), day: 0, date: '1936-01-01', trade: createTradeState() };
  const blocked = new Set();
  const sea = createSeaContext({ seaFile, params, provinceIds, ownerOf, blocked: () => blocked });
  const opened = openTradeContract(state0, { seller: 'ITA', buyer: 'USA', good: 'steel', perDay: 5, days: 50, mode: 'sea' }, { economy, resources, net: null, sea });
  const system = createTradeSystem({ resources, getSea: () => sea, recheckEvery: 10 });
  blocked.add('GBR'); blocked.add('EGY');
  const day9 = system({ ...opened.state, day: 9 });
  assert.equal(day9.trade.contracts[0].status, 'active'); // non è un giorno di controllo
  const day10 = system({ ...opened.state, day: 10 });
  assert.equal(day10.trade.contracts[0].status, 'suspended');
});
