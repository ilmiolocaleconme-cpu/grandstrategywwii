// Popolazione e riserva di lavoratori (28/10/2026): dati, schema 3 con migrazione 2→3, regola dei lavoratori.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { validatePopulation, populationOf, workersPoolTotal } from '../src/data/nationPopulation.js';
import { workersState } from '../src/rules/workers.js';
import { buildNations, migrateV2toV3, validateNations } from '../src/game/economyState.js';
import { newGame, validateState, initEconomy } from '../src/game/state.js';
import { parseSave, SAVE_FORMAT } from '../src/game/save.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy: json('economy/economy.json'), population };
const nations = buildNations({ political, ...start });
const share = population.workersShare.value;

test('dati: una voce per ogni nazione dello stato, anno e fonte, copia del file dell\'utente non modificata', () => {
  assert.deepEqual(validatePopulation(population, { ownerIds: new Set(Object.keys(nations)) }), []);
  const sha = createHash('sha256').update(readFileSync(new URL('../data/population/population_1936_utente.csv', import.meta.url))).digest('hex');
  assert.equal(sha, 'a734ff18778e9c2768ff8a08702feefc685259a002191c8133243e8ece2df9bb');
  assert.equal(population.nations.ITA.population, 42993602); assert.equal(population.nations.ITA.year, 1936);
  assert.equal(population.nations.IRN.year, 1939);
  assert.equal(populationOf(population, 'MENG'), 0, 'MISSING_DATA = 0');
  assert.equal(population.colonies.entries.India.population, 388000000);
  const bad = structuredClone(population); bad.nations.USA.year = 1950; delete bad.nations.DEU;
  assert.match(validatePopulation(bad, { ownerIds: new Set(Object.keys(nations)) }).join('|'), /anno 1950.*|manca DEU/s);
});

test('riserva di lavoratori allo 0,5% (scelta dell\'utente): USA, Germania, Italia; gli occupati dagli impianti iniziali stanno nella riserva', () => {
  assert.equal(share, 0.005);
  const w = (id) => workersState(nations[id], { factoriesById: cat.byId, share });
  assert.equal(w('USA').total, Math.floor(128100000 * 0.005));
  for (const id of ['USA', 'DEU', 'ITA', 'GBR', 'FRA', 'JPN', 'USSR']) {
    const s = w(id);
    assert.ok(s.employed > 0 && !s.overdrawn && s.free > 0, `${id}: ${JSON.stringify(s)}`);
  }
  assert.equal(w('DEU').employed, nations.DEU.facilities.reduce((t, f) => t + cat.byId.get(f.type).workers, 0));
  assert.equal(workersPoolTotal(1000, 0.005), 5);
  const busy = { ...nations.ITA, construction: [{ workers: 1000 }, { workers: 500 }] };
  assert.equal(workersState(busy, { factoriesById: cat.byId, share }).building, 1500);
  assert.equal(workersState(busy, { factoriesById: cat.byId, share }).free, w('ITA').free - 1500);
});

test('schema 3: nuova partita con popolazione e coda vuota; stato valido', () => {
  const g = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start });
  assert.equal(g.state.schema, 6); assert.deepEqual(validateState(g.state), []);
  assert.equal(g.state.nations.ITA.population, 42993602);
  assert.deepEqual(g.state.nations.ITA.construction, []);
});

test('migrazione 2→3: un salvataggio dello schema 2 si apre, la popolazione si riempie dai dati, il resto dello stato è identico', () => {
  const g = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
  // salvataggio schema 2 ricostruito: senza population/construction
  const v2nations = Object.fromEntries(Object.entries(g.nations).map(([id, n]) => { const { population: _p, construction: _c, ...rest } = n; return [id, { ...rest, balance: n.balance + 1 }]; }));
  const v2 = { ...g, schema: 2, nations: v2nations };
  const r = parseSave(JSON.stringify({ format: SAVE_FORMAT, schema: 2, savedAt: null, label: 'v2', state: v2 }));
  assert.equal(r.ok, true); assert.equal(r.migratedFrom, 2); assert.equal(r.state.schema, 6);
  assert.equal(r.state.nations.ITA.population, null, 'prima dell\'inizializzazione');
  assert.deepEqual(validateNations(r.state.nations), []);
  const filled = initEconomy(r.state, { political, start });
  assert.equal(filled.nations.ITA.population, 42993602);
  assert.equal(filled.nations.ITA.balance, g.nations.ITA.balance + 1, 'la cassa del salvataggio non viene toccata');
  assert.deepEqual(validateState(filled), []);
  assert.equal(initEconomy(filled, { political, start }), filled, 'già inizializzato: invariato');
  assert.equal(migrateV2toV3({ ...v2, nations: null }).nations, null);
});

test('salvataggio di una versione futura (schema 7) rifiutato senza perdere nulla', () => {
  const g = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
  assert.equal(parseSave(JSON.stringify({ format: SAVE_FORMAT, schema: 7, savedAt: null, label: '', state: g })).reason, 'newer_version');
});
