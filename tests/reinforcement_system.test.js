// Rinforzi automatici (03/11/2026): sistema giornaliero, interruttore per divisione, arrivi, eccedenza, percorso dal deposito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReinforcementSystem, setDivisionReinforcement, depotRoute } from '../src/game/reinforcementSystem.js';
import { validateReinforcementFields } from '../src/rules/reinforcements.js';
import { transitDaysFromRoute } from '../src/rules/reinforcementTransit.js';
import { buildSeaGraph } from '../src/data/seaRoutes.js';

const KEY = 'equipment.ART-FRA-HOW155C';
const units = [{ id: 'FRA-1', nation: 'FRA' }, { id: 'FRA-2', nation: 'FRA' }, { id: 'GBR-1', nation: 'GBR' }];
const forces = () => ({ initialized: true, divisions: {
  'FRA-1': { items: { [KEY]: { planned: 24, effective: 4 }, 'manpower.war': { planned: 100, effective: 90 } } },
  'FRA-2': { items: { [KEY]: { planned: 24, effective: 0 } } },
  'GBR-1': { items: { [KEY]: { planned: 10, effective: 0 } } },
}, transfers: [] });
const game = (stock = 30, date = '1939-09-10') => ({ date, forces: forces(), nations: { FRA: { stocks: { [KEY]: stock, steel: 9 } }, GBR: { stocks: {} } } });
const routes = { 'FRA-1': { landKm: 250 }, 'FRA-2': { landKm: 80 } };
const sys = (over = {}) => createReinforcementSystem({ units, poolOf: () => 40, routeOf: (s, n, id) => routes[id] ?? null, ...over });
const total = (s) => s.nations.FRA.stocks[KEY] + s.forces.transfers.filter((t) => t.item === KEY).reduce((a, t) => a + t.qty, 0) + Object.values(s.forces.divisions).reduce((a, d) => a + (d.items[KEY]?.effective ?? 0), 0);

test('invia in automatico: la merce lascia la scorta, parte per le divisioni più scoperte, arriva dopo i giorni di viaggio', () => {
  const s0 = game();
  const s1 = sys()(s0);
  const byDiv = Object.fromEntries(s1.forces.transfers.filter((t) => t.item === KEY).map((t) => [t.divisionId, t]));
  assert.deepEqual([byDiv['FRA-2'].qty, byDiv['FRA-1'].qty], [24, 6], 'FRA-2 (0%) prima; 30 pezzi in scorta');
  assert.deepEqual([byDiv['FRA-1'].arrivesOn, byDiv['FRA-2'].arrivesOn], ['1939-09-13', '1939-09-11']);
  assert.equal(s1.nations.FRA.stocks[KEY], 0, 'la merce in viaggio non è più in scorta');
  assert.equal(s1.nations.FRA.stocks.steel, 9, 'le altre scorte non si toccano');
  assert.equal(total(s1), total(s0), 'nessun pezzo creato o perso');
  const mp = s1.forces.transfers.find((t) => t.item === 'manpower.war');
  assert.deepEqual([mp.qty, mp.from], [10, 'pool']);
  assert.equal(s0.forces.transfers.length, 0, 'lo stato di ingresso non è modificato');
  assert.deepEqual(validateReinforcementFields(s1.forces), []);
});

test('un giorno dopo l\'altro: arrivano, nessun invio doppio, tutto si conserva', () => {
  let s = game();
  const run = sys();
  const t0 = total(s);
  for (let i = 0; i < 6; i += 1) { s = run(s); s = { ...s, date: new Date(Date.parse(s.date) + 86400000).toISOString().slice(0, 10) }; assert.equal(total(s), t0); }
  assert.equal(s.forces.divisions['FRA-2'].items[KEY].effective, 24);
  assert.equal(s.forces.divisions['FRA-1'].items[KEY].effective, 10, '4 + 6 arrivati');
  assert.equal(s.forces.transfers.length, 0);
});

test('interruttore per divisione: spenta non riceve nuovi invii; quelli già in viaggio arrivano comunque; riaccesa riprende', () => {
  let s = setDivisionReinforcement(game(), 'FRA-2', false);
  assert.equal(s.forces.divisions['FRA-2'].reinforce, false);
  s = sys()(s);
  assert.ok(!s.forces.transfers.some((t) => t.divisionId === 'FRA-2'), 'FRA-2 spenta');
  assert.equal(s.forces.transfers.find((t) => t.divisionId === 'FRA-1' && t.item === KEY).qty, 20, 'tutto il necessario a FRA-1');
  assert.equal(s.nations.FRA.stocks[KEY], 10, 'il resto resta in scorta');
  s = setDivisionReinforcement(s, 'FRA-2', true);
  s = sys()({ ...s, date: '1939-09-11' });
  assert.equal(s.forces.transfers.find((t) => t.divisionId === 'FRA-2' && t.item === KEY).qty, 10);
  assert.throws(() => setDivisionReinforcement(game(), 'XXX', false), /senza istanza/);
});

test('niente percorso o niente merce: nessun invio inventato; le altre nazioni non si toccano', () => {
  const noRoute = sys({ routeOf: () => null })(game());
  assert.equal(noRoute.forces.transfers.length, 0);
  assert.equal(noRoute.nations.FRA.stocks[KEY], 30);
  const empty = sys()(game(0));
  assert.ok(!empty.forces.transfers.some((t) => t.item === KEY));
  assert.ok(empty.forces.transfers.some((t) => t.item === 'manpower.war'), 'gli uomini dal pool partono lo stesso');
  assert.deepEqual(sys()({ ...game(), forces: { ...forces(), initialized: false } }).forces.transfers, []);
});

test('un quadro (cadre) non riceve; l\'eccedenza oltre il previsto torna nella scorta all\'arrivo', () => {
  const s0 = game(); s0.forces.divisions['FRA-2'].cadre = true;
  const s1 = sys()(s0);
  assert.ok(!s1.forces.transfers.some((t) => t.divisionId === 'FRA-2'));
  const s2 = game(0); s2.forces.transfers = [{ id: 'x', divisionId: 'FRA-1', item: KEY, qty: 30, from: 'stock', sentOn: '1939-09-01', arrivesOn: '1939-09-10' }];
  const s3 = sys()(s2);
  assert.equal(s3.forces.divisions['FRA-1'].items[KEY].effective, 24);
  assert.equal(total(s3), total(s2), 'conservazione: i 10 pezzi in eccedenza tornano in scorta e ripartono subito per FRA-2');
  assert.equal(s3.forces.transfers.find((t) => t.divisionId === 'FRA-2' && t.item === KEY).qty, 10);
});

test('percorso dal deposito: km sulla rete, solo province percorribili; senza deposito o senza percorso = null', () => {
  const adj = { A: ['B'], B: ['A', 'C'], C: ['B'], Z: [] };
  const net = { has: (m) => m in adj, neighbors: (m) => adj[m], km: () => 120 };
  const ctx = { net, depots: { nations: { FRA: { province: 'A' } } }, positionOf: (u) => ({ d1: 'C', d2: 'Z', d3: 'A' })[u] ?? null, canEnter: () => () => true };
  assert.deepEqual(depotRoute(ctx, 'FRA', 'd1'), { landKm: 240 });
  assert.deepEqual(depotRoute(ctx, 'FRA', 'd3'), { landKm: 0 });
  assert.equal(depotRoute(ctx, 'FRA', 'd2'), null, 'isolata (mare: non ancora calcolato)');
  assert.equal(depotRoute(ctx, 'GBR', 'd1'), null, 'nessun deposito');
  assert.equal(depotRoute({ ...ctx, canEnter: () => (m) => m !== 'B' }, 'FRA', 'd1'), null, 'percorso bloccato');
});

test('i depositi reali: id province esistenti nel catalogo, una capitale per nazione, nessun duplicato', () => {
  const depots = JSON.parse(readFileSync(new URL('../data/units/depots.json', import.meta.url), 'utf8'));
  const ids = new Set(JSON.parse(readFileSync(new URL('../data/citta_grandi.json', import.meta.url), 'utf8')).features.map((f) => f.properties.parentProvince));
  assert.equal(depots.schema, 'depots-v1');
  for (const [n, d] of Object.entries(depots.nations)) { assert.ok(ids.has(d.province), `${n} ${d.province}`); assert.ok(d.province.startsWith(`P_${n}_`), n); assert.equal(d.basis, 'capital'); }
});

// ---- traversata via mare (03/11/2026): isole A-B e C-D, zone di mare Z1 (porto B) e Z2 (porto C) ----
const seaFile = { zones: [
  { id: 'Z1', kind: 'sea', seed: [0, 0], neighbors: [['Z2', 444]], coastal: [] },
  { id: 'Z2', kind: 'sea', seed: [4, 0], neighbors: [['Z1', 444]], coastal: [] },
] };
const seaParams = { speedKmPerDay: { ocean: 400, sea: 400, gulf: 300, strait: 250, approach: 200 }, portHandlingDays: 1 };
const graph = buildSeaGraph(seaFile, seaParams);
const mk = (ports) => ({ context: { graph, portsOf: () => ports }, motherOf: (p) => p.replace('-child', '') });
const islands = { A: ['B'], B: ['A'], C: ['D'], D: ['C'], E: [] };
const isl = (sea, at = 'D') => ({ net: { has: (m) => m in islands, neighbors: (m) => islands[m], km: () => 120 }, depots: { nations: { FRA: { province: 'A' } } }, positionOf: () => at, canEnter: () => () => true, sea });

test('via mare: tratto di terra al porto + traversata + tratto di terra; i giorni di mare si aggiungono solo qui', () => {
  const ports = [{ province: 'B-child', zone: 'Z1', coastKm: 50 }, { province: 'C', zone: 'Z2', coastKm: 50 }];
  const r = depotRoute(isl(mk(ports)), 'FRA', 'd');
  assert.deepEqual(r, { landKm: 240, seaDays: 4 }, 'A→B 120 km + C→D 120 km; mare 444 km a 400 km/g + 2 giorni di porto = 4');
  assert.equal(transitDaysFromRoute(r), 7, '3 giorni di terra + 4 di mare');
  assert.equal(depotRoute({ ...isl(mk(ports)), positionOf: () => 'B' }, 'FRA', 'd').seaDays, undefined, 'stessa isola: nessun mare');
});

test('via mare: senza porto proprio su una delle due coste, o zone di mare chiuse, o senza contesto di mare: null', () => {
  const only = (p) => depotRoute(isl(mk([p])), 'FRA', 'd');
  assert.equal(only({ province: 'B', zone: 'Z1', coastKm: 50 }), null, 'nessun porto sull\'isola di arrivo');
  assert.equal(only({ province: 'C', zone: 'Z2', coastKm: 50 }), null, 'nessun porto sull\'isola di partenza');
  assert.equal(depotRoute(isl(null), 'FRA', 'd'), null);
  const closed = { ...graph, params: { ...seaParams, closedZones: ['Z2'] } };
  const ports = [{ province: 'B', zone: 'Z1', coastKm: 1 }, { province: 'C', zone: 'Z2', coastKm: 1 }];
  assert.equal(depotRoute(isl({ context: { graph: closed, portsOf: () => ports }, motherOf: (p) => p }), 'FRA', 'd'), null, 'zona chiusa (ghiaccio)');
  assert.equal(depotRoute(isl(mk(ports), 'E'), 'FRA', 'd'), null, 'provincia isolata e senza costa');
});

test('sistema: una divisione oltremare riceve i rinforzi con 3 + 4 giorni di viaggio', () => {
  const ports = [{ province: 'B', zone: 'Z1', coastKm: 1 }, { province: 'C', zone: 'Z2', coastKm: 1 }];
  const s = createReinforcementSystem({ units, poolOf: () => 0, routeOf: (st, n, id) => (id === 'FRA-1' ? depotRoute(isl(mk(ports)), n, id) : null) })(game());
  assert.equal(s.forces.transfers.find((t) => t.divisionId === 'FRA-1' && t.item === KEY).arrivesOn, '1939-09-17');
});

test('priorità: la divisione con priorità è servita per prima dalle scorte, anche se meno scoperta; nulla si crea né si perde', () => {
  const s0 = { ...game(10), forces: { ...forces(), divisions: { ...forces().divisions, 'FRA-1': { ...forces().divisions['FRA-1'], priority: true } } } };
  const s1 = sys()(s0);
  const art = Object.fromEntries(s1.forces.transfers.filter((t) => t.item === KEY).map((t) => [t.divisionId, t.qty]));
  assert.deepEqual(art, { 'FRA-1': 10 }, 'FRA-1 ha 4/24 ma, con priorità, prende tutti i 10 pezzi; FRA-2 (0/24) niente');
  assert.equal(total(s1), total(s0));
  const senza = sys()({ ...game(10) });
  const art2 = Object.fromEntries(senza.forces.transfers.filter((t) => t.item === KEY).map((t) => [t.divisionId, t.qty]));
  assert.deepEqual(art2, { 'FRA-2': 10 }, 'senza priorità vince la più scoperta (FRA-2)');
});

test('setDivisionPriority: acceso e spento, stato di ingresso intatto, errore senza istanza', async () => {
  const { setDivisionPriority } = await import('../src/game/reinforcementSystem.js');
  const { priorityRequests } = await import('../src/rules/reinforcements.js');
  const s0 = game();
  const s1 = setDivisionPriority(s0, 'FRA-2', true);
  assert.deepEqual(priorityRequests(s1.forces), { 'FRA-2': true });
  assert.deepEqual(priorityRequests(s0.forces), {}, 'lo stato di ingresso non cambia');
  assert.deepEqual(priorityRequests(setDivisionPriority(s1, 'FRA-2', false).forces), {});
  assert.throws(() => setDivisionPriority(s0, 'XXX', true), /senza istanza/);
});

test('via mare: con più porti sulla stessa zona di mare si sceglie quello più vicino per via di terra (non quello con più costa)', () => {
  const ctx = { context: { graph, portsOf: () => [], allPortsOf: () => [{ province: 'B', zone: 'Z1', coastKm: 50 }, { province: 'C', zone: 'Z2', coastKm: 300 }, { province: 'D', zone: 'Z2', coastKm: 20 }] }, motherOf: (p) => p };
  const r = depotRoute(isl(ctx, 'D'), 'FRA', 'd');
  assert.deepEqual(r, { landKm: 120, seaDays: 4 }, 'A→B 120 km + 0 km (la divisione è nel porto D, non in C che ha più costa)');
});

test('velocità: il percorso si calcola solo per le divisioni a cui il piano spedisce davvero qualcosa', () => {
  const calls = [];
  const spy = (s, n, id) => { calls.push(id); return routes[id] ?? null; };
  // nessuna risorsa (scorta 0, pool 0): nulla da spedire, nessun percorso calcolato
  createReinforcementSystem({ units, poolOf: () => 0, routeOf: spy })(game(0));
  assert.deepEqual(calls, [], 'senza risorse non si cerca nessun percorso');
  // divisione già al completo: nemmeno per lei
  const full = game();
  full.forces.divisions['FRA-1'].items[KEY].effective = 24; full.forces.divisions['FRA-1'].items['manpower.war'].effective = 100;
  full.forces.divisions['FRA-2'].items[KEY].effective = 24;
  createReinforcementSystem({ units, poolOf: () => 40, routeOf: spy })(full);
  assert.deepEqual(calls, [], 'divisioni complete: nessun percorso');
  // con risorse: un solo calcolo per divisione anche se ha più voci in carenza
  calls.length = 0;
  const s1 = createReinforcementSystem({ units, poolOf: () => 40, routeOf: spy })(game());
  assert.equal(calls.length, new Set(calls).size, 'un percorso per divisione, non uno per voce');
  assert.ok(s1.forces.transfers.length > 0);
});

test('divisione senza percorso dal deposito: resta senza rinforzi e senza errori (nessun tempo inventato)', () => {
  const s = createReinforcementSystem({ units, poolOf: () => 40, routeOf: (st, n, id) => (id === 'FRA-2' ? null : routes[id]) })(game());
  assert.ok(s.forces.transfers.every((t) => t.divisionId !== 'FRA-2'));
  assert.ok(s.forces.transfers.some((t) => t.divisionId === 'FRA-1'));
});
