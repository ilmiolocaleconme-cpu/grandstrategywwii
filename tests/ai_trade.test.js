// IA del commercio (13/11/2026): compra ciò che sta per finire, dal venditore con più scorta. Valori DESIGN_DEFAULT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAiTrade, AI_TRADE_DEFAULTS } from '../src/game/aiTrade.js';
import { createTradeState, validateTradeState } from '../src/rules/trade.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const economy = json('economy/economy.json');
const resources = json('resources.json');
// tre nazioni in fila: ITA – DEU – FRA, una provincia ciascuna
const OWNERS = { I: 'ITA', D: 'DEU', F: 'FRA' };
const ADJ = { I: ['D'], D: ['I', 'F'], F: ['D'] };
const net = { provinces: () => Object.keys(OWNERS), has: (m) => m in OWNERS, neighbors: (m) => ADJ[m] ?? [], km: () => 200, owner: (m) => OWNERS[m], name: (m) => m };
const ctxOf = () => ({ economy, resources, net, sea: null });
const nation = (steel, balance = 10000) => ({ balance, stocks: { steel } });
const base = (over = {}) => ({ day: 10, date: '1936-01-11', player: 'FRA', trade: createTradeState(), nations: { ITA: nation(1000), DEU: nation(50000), FRA: nation(90000) }, ...over });

test('primo controllo: solo la fotografia delle scorte, nessun contratto', () => {
  const ai = createAiTrade({ ctxOf });
  const s = ai.aiTradeDay(base());
  assert.equal(s.trade.contracts.length, 0);
  assert.equal(s.aiTrade.snap.day, 10);
  assert.equal(s.aiTrade.snap.stocks.ITA.steel, 1000);
  const off = { ...base(), day: 11 };
  assert.equal(ai.aiTradeDay(off), off, 'fuori periodo: niente');
});

test('acciaio italiano in calo con meno di 60 giorni di scorta: contratto di 90 giorni col 20% in più, dalla Germania (il giocatore non vende)', () => {
  const ai = createAiTrade({ ctxOf });
  let s = ai.aiTradeDay(base());
  s = { ...s, day: 20, date: '1936-01-21', nations: { ...s.nations, ITA: nation(500), DEU: nation(50100) } }; // −50 t/giorno: 10 giorni di scorta
  s = ai.aiTradeDay(s);
  assert.equal(s.trade.contracts.length, 1);
  const c = s.trade.contracts[0];
  assert.deepEqual([c.seller, c.buyer, c.good, c.perDay, c.endDay - c.startDay + 1], ['DEU', 'ITA', 'steel', 60, AI_TRADE_DEFAULTS.contractDays]);
  assert.deepEqual(validateTradeState(s.trade), []);
  // al controllo successivo, con il contratto già attivo, non se ne apre un altro
  const again = ai.aiTradeDay({ ...s, day: 30, date: '1936-01-31', nations: { ...s.nations, ITA: nation(0) } });
  assert.equal(again.trade.contracts.length, 1);
});

test('nessun contratto se la scorta basta, se nessuno ha abbastanza da vendere o se la merce non cala', () => {
  const ai = createAiTrade({ ctxOf });
  const first = ai.aiTradeDay(base({ nations: { ITA: nation(100000), DEU: nation(50000), FRA: nation(90000) } }));
  const slow = ai.aiTradeDay({ ...first, day: 20, nations: { ...first.nations, ITA: nation(99000) } }); // 100 t/giorno, 990 giorni di scorta
  assert.equal(slow.trade.contracts.length, 0);
  const f2 = ai.aiTradeDay(base({ nations: { ITA: nation(1000), DEU: nation(3000), FRA: nation(90000) } }));
  const poor = ai.aiTradeDay({ ...f2, day: 20, nations: { ...f2.nations, ITA: nation(500), DEU: nation(3000) } }); // la Germania non copre 60 × 90 × 1,5
  assert.equal(poor.trade.contracts.length, 0, 'unico venditore possibile = il giocatore (Francia): escluso');
});

test('il giocatore non compra mai in automatico', () => {
  const ai = createAiTrade({ ctxOf });
  const first = ai.aiTradeDay(base({ player: 'ITA' }));
  const s = ai.aiTradeDay({ ...first, day: 20, nations: { ...first.nations, ITA: nation(500) } });
  assert.equal(s.trade.contracts.length, 0);
});
