// Cassa iniziale (28/10/2026): 30 giorni di entrata + 200 ECV; difficoltà con stockMul su scorte e cassa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateInitialCash, cashFor } from '../src/data/initialCash.js';
import { buildNations } from '../src/game/economyState.js';
import { newGame, validateState, initEconomy } from '../src/game/state.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const industry = json('industry/initial_industry.json');
const stocks = json('industry/initial_stocks.json');
const cash = json('industry/initial_cash.json');
const economy = json('economy/economy.json');
const start = { nationIds, industry, stocks, cash, economy };
const build = (difficulty) => buildNations({ political, ...start, difficulty });

test('valido: una voce per ogni proprietario, cassa = 30 × entrata + 200', () => {
  const owners = new Set(Object.keys(build('media')));
  assert.deepEqual(validateInitialCash(cash, { ownerIds: owners }), []);
  assert.equal(cash.days, 30); assert.equal(cash.floor, 200);
  for (const id of industry.tierC) assert.ok(cash.nations[id].cash >= 200, `${id}: almeno il minimo`);
});

test('ordine di grandezza: USA la più ricca (circa 7.400 ECV), Germania circa 2.100, mediana fascia C sopra il minimo ma sotto 500', () => {
  assert.ok(cash.nations.USA.cash > 7000 && cash.nations.USA.cash < 8000);
  assert.ok(cash.nations.DEU.cash > 1800 && cash.nations.DEU.cash < 2400);
  const c = industry.tierC.map((id) => cash.nations[id].cash).sort((a, b) => a - b);
  assert.ok(c[25] > 200 && c[25] < 500, `mediana ${c[25]}`);
  assert.ok(cash.nations.USA.incomePerDay > cash.nations.GBR.incomePerDay);
});

test('la cassa entra nello stato: media = dati, facile ×1,5, reale ×0,7, con scorte scalate come la cassa', () => {
  const m = build('media'); const f = build('facile'); const r = build('reale');
  assert.equal(m.USA.balance, cash.nations.USA.cash);
  assert.equal(f.USA.balance, cashFor(cash.nations.USA.cash, 1.5));
  assert.equal(r.USA.balance, cashFor(cash.nations.USA.cash, 0.7));
  assert.equal(m.DEU.stocks.iron_ore, 227010);
  assert.equal(f.DEU.stocks.iron_ore, Math.ceil(227010 * 1.5));
  assert.equal(r.DEU.stocks.iron_ore, Math.ceil(227010 * 0.7));
  assert.equal(m.ALB.stocks.coal, undefined);
});

test('newGame e initEconomy usano la difficoltà dello stato; stato valido', () => {
  const g = newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start, difficulty: 'reale' });
  assert.equal(g.ok, true); assert.deepEqual(validateState(g.state), []);
  assert.equal(g.state.nations.ITA.balance, cashFor(cash.nations.ITA.cash, 0.7));
  const migrated = { ...g.state, nations: null };
  assert.deepEqual(initEconomy(migrated, { political, start }), g.state);
});

test('errori segnalati: cassa che non torna con la regola, proprietario mancante', () => {
  const owners = new Set(Object.keys(build('media')));
  const bad = structuredClone(cash); bad.nations.USA.cash += 5; delete bad.nations.DEU;
  const e = validateInitialCash(bad, { ownerIds: owners }).join('|');
  assert.match(e, /USA con cassa/); assert.match(e, /manca DEU/);
});
