// Rinforzi automatici (03/11/2026): sistema giornaliero, interruttore per divisione, arrivi, eccedenza, percorso dal deposito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReinforcementSystem, setDivisionReinforcement, depotRoute } from '../src/game/reinforcementSystem.js';
import { validateReinforcementFields } from '../src/rules/reinforcements.js';

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
