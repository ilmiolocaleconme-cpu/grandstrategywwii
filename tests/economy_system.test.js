// Ciclo economico giornaliero (28/10/2026): estrazione → produzione → entrata, simulato sulle nazioni reali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame } from '../src/game/state.js';
import { advanceDay, advanceDays } from '../src/game/engine.js';
import { createEconomySystem, hydroMwByOwner } from '../src/game/economySystem.js';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy: json('economy/economy.json') };
const baseline = json('resources/extraction_baseline.json');
const hydro = json('resources/hydro_plants.json');
const system = createEconomySystem({ catalog, economy: start.economy, baseline, hydro, political, cash: start.cash });
const fresh = (difficulty = 'media') => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start, difficulty }).state;
const sim = (days, s = fresh()) => advanceDays(s, days, [system]);

test('estrazione di base: coincide con il ricalcolo da produzione, fattori e punti', () => {
  const ctx = { production: json('resources/production_1936.json'), factors: json('resources/extraction_factors.json'), scaleFile: json('resources/extraction_scale.json'), pointsByProvince: json('resources/resource_points.json').byProvince, extra: json('resources/resource_locations_extra.json') };
  for (const r of ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur']) {
    const ex = resourceExtraction(r, ctx);
    for (const [tr, row] of Object.entries(baseline.byTerritory)) assert.ok(Math.abs((row[r] ?? 0) - totalByPrefix(ex, tr)) < 0.001, `${tr} ${r}`);
  }
});

test('idroelettrico per proprietario: Italia 527 MW prima del 1936, la diga di Hoover entra a settembre 1936', () => {
  const ownerOf = new Map(political.map((e) => [e.id, e.owner ?? e.id]));
  assert.equal(hydroMwByOwner(hydro, '1936-01-01', ownerOf).ITA, 527);
  const jan = hydroMwByOwner(hydro, '1936-01-01', ownerOf).USA; const oct = hydroMwByOwner(hydro, '1936-10-01', ownerOf).USA;
  assert.ok(oct - jan >= 1345, 'Hoover (1.345 MW) + Norris dal 1/3/1936');
});

test('un giorno: la Germania produce acciaio e consuma minerale, la cassa sale; stato nuovo, vecchio intatto', () => {
  const s0 = fresh(); const s1 = advanceDay(s0, [system]);
  assert.ok(s1.nations.DEU.stocks.steel > 0 && s1.nations.DEU.stocks.iron_ore < s0.nations.DEU.stocks.iron_ore + 1);
  assert.ok(s1.nations.DEU.balance > s0.nations.DEU.balance);
  assert.equal(s0.nations.DEU.stocks.steel, 500, 'lo stato precedente non viene modificato (resta la riserva minima)');
  assert.equal(advanceDay({ ...s0, nations: null }, [system]).nations, null, 'senza economia inizializzata non fa nulla');
});

test('fascia C: nessuna industria, la cassa cresce solo con la quota dei territori, nessuna scorta oltre la riserva minima', () => {
  const s = sim(60);
  // dal 29/10/2026 la fascia C ha una fabbrica di artiglieria al 5%: in 60 giorni ~70 pezzi, ~252 t di acciaio dalla scorta iniziale (in aggiunta alla riserva delle costruzioni)
  assert.ok(Math.abs(s.nations.ALB.stocks.artillery - 70.02) < 0.5, 'circa 1,17 pezzi al giorno');
  assert.ok(Math.abs(s.nations.ALB.stocks.steel - (1260 - 252)) < 2, 'consuma la scorta dell\'artiglieria, non la riserva delle costruzioni (500 t)');
  assert.ok(Math.abs(s.nations.ALB.stocks.components - (65 - 21)) < 1);
  assert.ok(s.nations.ALB.balance > fresh().nations.ALB.balance);
});

test('5 mesi senza commercio: l\'acciaio tedesco resta a pieno regime per 150 giorni, poi il minerale finisce e cala', () => {
  const day = (n) => sim(n);
  const steel = (s) => s.nations.DEU.stocks.steel;
  const d100 = day(100); const d101 = advanceDay(d100, [system]);
  // variazione netta dello stock: 12 acciaierie × 100 t = 1.200 t prodotte, meno 384 t usate da macchinari, componenti, motori e munizioni
  assert.equal(Math.round(steel(d101) - steel(d100)), 816, 'acciaierie a pieno regime');
  const d160 = day(160); const d161 = advanceDay(d160, [system]);
  assert.ok(steel(d161) - steel(d160) < 816, 'dopo il giorno 150 il minerale importato è finito: la produzione cala');
  assert.ok(d160.nations.DEU.stocks.iron_ore < 1, 'minerale esaurito');
  assert.ok(steel(d161) > steel(d160) - 500 && steel(d160) > 100000, 'non crolla: la Germania estrae minerale in casa (circa 400 t/giorno) e ha acciaio in magazzino');
  for (const id of ['JPN', 'ITA', 'USA']) assert.ok(day(140).nations[id].stocks.iron_ore > 0, `${id}: scorte ancora presenti al giorno 140`);
});

test('invarianti su 300 giorni per sei nazioni: nessuna scorta negativa o non finita, cassa mai in calo, deterministico', () => {
  const a = sim(300); const b = sim(300);
  assert.deepEqual(a, b);
  for (const id of ['DEU', 'JPN', 'ITA', 'USSR', 'USA', 'GBR']) {
    for (const [r, v] of Object.entries(a.nations[id].stocks)) assert.ok(Number.isFinite(v) && v >= 0, `${id} ${r} = ${v}`);
    assert.ok(a.nations[id].balance >= fresh().nations[id].balance, `${id} cassa`);
  }
  assert.equal(a.day, 300);
});

test('la difficoltà conta: «reale» guadagna meno e parte con meno scorte di «facile»', () => {
  const f = sim(30, fresh('facile')); const r = sim(30, fresh('reale'));
  const gainF = f.nations.USA.balance - fresh('facile').nations.USA.balance;
  const gainR = r.nations.USA.balance - fresh('reale').nations.USA.balance;
  assert.ok(gainF > gainR);
  assert.ok(fresh('facile').nations.DEU.stocks.iron_ore > fresh('reale').nations.DEU.stocks.iron_ore);
});
