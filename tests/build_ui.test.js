// Helper puri dell'interfaccia delle costruzioni (28/10/2026): opzioni per provincia, riepilogo economico, messaggi di rifiuto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame } from '../src/game/state.js';
import { createConstruction } from '../src/game/construction.js';
import { provinceBuildOptions, economySummary, describeBuildFailure } from '../src/ui/buildOptions.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json'); const economy = json('economy/economy.json'); const sites = json('resources/mine_sites.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const share = population.workersShare.value;
const build = createConstruction({ catalog, economy, sites, hydro: json('resources/hydro_plants.json'), political, workersShare: share });
const state = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const ctx = { build, catalog, sites, economy, resourceLabel: (id) => id };
const [coalProv] = Object.entries(sites.byProvince).filter(([p, r]) => p.startsWith('P_ITA_') && r.coal && r.coal.extraPerDay[0] > 0).map(([p]) => p);

test('opzioni in una provincia italiana con carbone: miniera L1 con guadagno e costo, fabbriche con ricetta, prova a secco senza toccare lo stato', () => {
  const before = JSON.stringify(state);
  const o = provinceBuildOptions(state, 'ITA', coalProv, ctx);
  assert.equal(JSON.stringify(state), before);
  const mine = o.mines.find((m) => m.order.resource === 'coal');
  assert.ok(mine && /livello 1/.test(mine.label) && /t\/giorno/.test(mine.detail));
  assert.deepEqual(mine.cost, { ecv: 60, days: 30, steel: 150, workers: 200 });
  assert.ok(o.factories.length >= 10, 'una voce per ogni ricetta (acciaio, alluminio, carburante, ...)');
  const steel = o.factories.find((f) => f.order.factoryId === 'FCT-STEEL');
  assert.deepEqual(steel.cost, { ecv: 120, days: 45, steel: 300, workers: 500 });
  assert.equal(typeof steel.ok, 'boolean');
});

test('opzioni vuote se la provincia non è tua; nessuna miniera inutile; i rifiuti hanno una frase in italiano', () => {
  const foreign = Object.keys(sites.byProvince).find((p) => p.startsWith('P_FRA_'));
  assert.deepEqual(provinceBuildOptions(state, 'ITA', foreign, ctx), { mines: [], factories: [] });
  const flat = Object.entries(sites.byProvince).find(([p, r]) => p.startsWith('P_USA_') && r.coal && r.coal.extraPerDay[0] === 0)[0];
  assert.ok(!provinceBuildOptions(state, 'USA', flat, ctx).mines.some((m) => m.order.resource === 'coal'));
  const r = build.start({ ...state, nations: { ...state.nations, ITA: { ...state.nations.ITA, balance: 1 } } }, 'ITA', { kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId: coalProv });
  assert.equal(r.ok, false);
  assert.match(describeBuildFailure(r), /^Mancano: denaro \(servono 120, hai 1\)/);
  assert.equal(describeBuildFailure({ ok: false, reason: 'no_slot', used: 14, capacity: 14 }), 'Slot esauriti in questa provincia (14 su 14)');
  assert.equal(describeBuildFailure({ ok: true }), '');
});

test('riepilogo economico: cassa, lavoratori, energia, scorte ordinate, impianti raggruppati, coda con giorni', () => {
  let s = state;
  const order = build.start(s, 'ITA', { kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId: coalProv });
  assert.equal(order.ok, true, JSON.stringify(order)); s = order.state;
  const e = economySummary(s, 'ITA', { build, catalog, workersShare: share });
  assert.equal(e.balance, s.nations.ITA.balance);
  assert.equal(e.workers.total, Math.floor(42993602 * 0.005)); assert.equal(e.workers.building, 500);
  assert.ok(e.power.surplus > 0);
  assert.ok(e.stocks.length > 0 && e.stocks[0].tons >= e.stocks[e.stocks.length - 1].tons);
  assert.equal(e.plants.find((p) => p.type === 'FCT-STEEL').count, 1);
  assert.deepEqual(e.queue.map((q) => [q.label, q.daysLeft, q.totalDays]), [['Acciaieria', 45, 45]]);
  assert.equal(economySummary(s, 'XXX', { build, catalog, workersShare: share }), null);
});

test('la coda mostra il nome della provincia, non l\'id tecnico', () => {
  const o = build.start(state, 'ITA', { kind: 'factory', factoryId: 'FCT-STEEL', recipeId: 'REC-STEEL-001', provinceId: coalProv });
  const e = economySummary(o.state, 'ITA', { build, catalog, workersShare: share, provinceName: (id) => (id === coalProv ? 'Sulcis' : id) });
  assert.equal(e.queue[0].where, 'Sulcis');
});
