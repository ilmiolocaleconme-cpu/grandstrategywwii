// Stato economico per nazione, schema 2 (28/10/2026): costruzione dai dati iniziali, validazione, migrazione 1→2, integrazione con produceDay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { buildNations, validateNations, migrateV1toV2, migrateV2toV3 } from '../src/game/economyState.js';
import { newGame, validateState, initEconomy, STATE_SCHEMA } from '../src/game/state.js';
import { parseSave, serializeSave, SAVE_FORMAT } from '../src/game/save.js';
import { produceDay } from '../src/rules/production.js';
import { factoryBuildCost, mineCost } from '../src/data/economy.js';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const industry = json('industry/initial_industry.json');
const stocks = json('industry/initial_stocks.json');
const start = { nationIds, industry, stocks };
const nations = buildNations({ political, ...start });
const game = (extra = {}) => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start, ...extra });

test('schema 2: ogni nazione ha cassa, scorte, impianti, miniere, rete e forze (vuote)', () => {
  assert.equal(STATE_SCHEMA, 7);
  assert.deepEqual(Object.keys(nations).sort(), [...nationIds, 'IRN'].sort(), 'le 72 nazioni più l\'Iran, non giocabile ma con industria');
  for (const n of Object.values(nations)) {
    assert.deepEqual(Object.keys(n).sort(), ['balance', 'baseGridMw', 'construction', 'facilities', 'forces', 'mines', 'population', 'stocks']);
    assert.deepEqual(n.forces, { land: [], naval: [], air: [] }, 'forze: MISSING_DATA, nessun catalogo');
    assert.equal(n.balance, 0, 'senza il file della cassa nello start la cassa è 0 (con i dati: vedi initial_cash.test.js)');
    assert.deepEqual(n.mines, []);
  }
  assert.deepEqual(validateNations(nations), []);
});

test('impianti e scorte seguono i dati: USA 30 acciaierie, colonie al proprietario con il territorio, fascia C con rete di base', () => {
  const steel = (id) => nations[id].facilities.filter((f) => f.type === 'FCT-STEEL').length;
  assert.equal(steel('USA'), 30);
  assert.equal(steel('DEU'), 12);
  const malRubber = nations.GBR.facilities.filter((f) => f.territory === 'MAL' && f.type === 'FCT-RUBBER');
  assert.equal(malRubber.length, 6);
  assert.ok(nations.GBR.facilities.some((f) => f.territory === 'GBR'));
  assert.equal(nations.DEU.stocks.iron_ore, 227010);
  assert.equal(nations.GBR.stocks.coal, stocks.stocks.CEY.coal + stocks.stocks.MAL.coal, 'le scorte delle colonie vanno al proprietario');
  for (const id of industry.tierC) { assert.equal(nations[id].baseGridMw, 40); assert.equal(nations[id].facilities.length, 1, 'solo la fabbrica minima di artiglieria'); assert.deepEqual(nations[id].stocks, { steel: stocks.floor.steel + 760, components: 65 }, 'riserva minima di acciaio + scorta iniziale dell\'artiglieria'); }
  assert.equal(nations.USA.baseGridMw, 0);
  const ids = Object.values(nations).flatMap((n) => n.facilities.map((f) => f.id));
  assert.equal(new Set(ids).size, ids.length, 'id impianto unici');
  assert.deepEqual(buildNations({ political, ...start }), nations, 'deterministico');
});

test('newGame: con i dati iniziali nations è popolato, senza è null; difficoltà valida; stato valido', () => {
  const a = game(); assert.equal(a.ok, true);
  assert.deepEqual(validateState(a.state), []);
  assert.equal(a.state.difficulty, 'media');
  assert.deepEqual(a.state.nations, nations);
  const b = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds }); assert.equal(b.state.nations, null);
  assert.deepEqual(validateState(b.state), []);
  assert.equal(game({ difficulty: 'impossibile' }).reason, 'invalid_difficulty');
  assert.equal(game({ difficulty: 'reale' }).state.difficulty, 'reale');
});

test('migrazione 1→2: un salvataggio dello schema 1 si apre, nations è null e initEconomy dà lo stesso stato di una partita nuova', () => {
  const v1 = { schema: 1, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'ITA', control: Object.fromEntries(political.map((e) => [e.id, e.controller ?? e.id])) };
  const doc = JSON.stringify({ format: SAVE_FORMAT, schema: 1, savedAt: null, label: 'vecchio', state: v1 });
  const r = parseSave(doc);
  assert.equal(r.ok, true); assert.equal(r.migratedFrom, 1, 'catena 1→2→3→4→5→6');
  assert.equal(r.state.schema, 7); assert.equal(r.state.nations, null); assert.equal(r.state.difficulty, 'media');
  assert.deepEqual(r.state.control, v1.control);
  assert.deepEqual(initEconomy(r.state, { political, start }), game().state);
  const done = game().state;
  assert.equal(initEconomy(done, { political, start }), done, 'già inizializzato: stesso oggetto, invariato');
  assert.deepEqual(migrateV1toV2(v1), { ...v1, schema: 2, difficulty: 'media', nations: null });
});

test('salvataggio schema 7: andata e ritorno identica; schema più recente rifiutato senza perdere nulla', () => {
  const s = game().state;
  const r = parseSave(serializeSave(s));
  assert.equal(r.ok, true); assert.deepEqual(r.state, s); assert.equal(r.migratedFrom, undefined);
  const future = JSON.stringify({ format: SAVE_FORMAT, schema: 8, savedAt: null, label: '', state: s });
  assert.equal(parseSave(future).reason, 'newer_version');
});

test('validazione: id duplicato, scorta negativa, danno fuori scala, player assente, forze mancanti', () => {
  const bad = structuredClone(nations);
  bad.USA.facilities.push({ ...bad.USA.facilities[0] });
  bad.DEU.stocks.iron_ore = -1;
  bad.GBR.facilities[0].damage = 2;
  delete bad.FRA.forces.air;
  const e = validateNations(bad, { player: 'XXX' }).join('|');
  assert.match(e, /duplicato/); assert.match(e, /scorta di iron_ore/); assert.match(e, /danno fuori/); assert.match(e, /forze armate/); assert.match(e, /player assente/);
});

test('integrazione: produceDay legge gli impianti e le scorte iniziali della Germania senza errori e rispetta il bilancio', () => {
  const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
  const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId };
  const d = nations.DEU;
  // le scorte iniziali coprono solo il DEFICIT: ciò che la nazione estrae in casa arriva ogni giorno dalle miniere (passo di estrazione, non ancora in SYSTEMS)
  const ctx = { production: json('resources/production_1936.json'), factors: json('resources/extraction_factors.json'), scaleFile: json('resources/extraction_scale.json'), pointsByProvince: json('resources/resource_points.json').byProvince, extra: json('resources/resource_locations_extra.json') };
  const stock = { ...d.stocks };
  for (const r of ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur']) stock[r] = (stock[r] ?? 0) + totalByPrefix(resourceExtraction(r, ctx), 'DEU');
  const without = produceDay({ facilities: d.facilities, stock: d.stocks, hydroMw: 0 }, catalog);
  assert.ok((without.stock.steel ?? 0) <= stocks.floor.steel, 'senza il passo di estrazione il giorno 1 non produce acciaio: resta al più la riserva minima');
  const out = produceDay({ facilities: d.facilities, stock, hydroMw: 0 }, catalog);
  assert.ok(out.facilities.length === d.facilities.length);
  assert.ok(Object.values(out.stock).every((v) => v >= 0), 'nessuna scorta negativa');
  assert.ok(out.stock.steel > 0, 'le acciaierie tedesche hanno prodotto acciaio dalle scorte iniziali');
});

test('riserva minima di acciaio (29/10/2026): ogni nazione parte con almeno 500 t, chi ha già di più non cambia', () => {
  assert.deepEqual(stocks.floor, { steel: 500 });
  for (const [id, n] of Object.entries(nations)) assert.ok((n.stocks.steel ?? 0) >= 500, `${id}: acciaio ${n.stocks.steel ?? 0}`);
  assert.equal(nations.ITA.stocks.steel, 21000, 'Italia: lo stock calcolato resta');
  assert.equal(nations.BEL.stocks.steel, 6000);
  assert.equal(nations.FRA.stocks.steel, 500, 'Francia: nessun deficit di acciaio, riceve solo la riserva');
  assert.equal(nations.BRA.stocks.steel, 500 + 760, 'Brasile (fascia C): riserva 500 t + scorta dell\'artiglieria minima 760 t');
});

test('riserva minima: scala con la difficoltà e basta all\'ordine più economico in ognuna', () => {
  const economy = json('economy/economy.json');
  const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
  const expected = { facile: 1890, media: 1260, reale: 882 }; // (500 riserva + 760 scorta artiglieria della fascia C) × moltiplicatore di difficoltà
  for (const d of ['facile', 'media', 'reale']) {
    const n = buildNations({ political, ...start, economy, difficulty: d });
    assert.equal(n.BRA.stocks.steel, expected[d], `${d}: riserva scalata`);
    const cheapestFactory = Math.min(...[...cat.byId.values()].map((f) => factoryBuildCost(economy, f, d)?.steel).filter(Boolean));
    assert.ok(n.BRA.stocks.steel >= Math.min(cheapestFactory, mineCost(economy, 1, d).steel), `${d}: la riserva non basta nemmeno all'ordine più economico`);
  }
});
