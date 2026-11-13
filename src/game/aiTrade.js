// IA del commercio (13/11/2026): le nazioni guidate dall'IA comprano ciò che sta per finire. Funzione PURA e deterministica.
// Prima mancava del tutto: nella simulazione di 3 anni l'Italia restava senz'acciaio dal giorno ~150 e tutte le sue fabbriche si fermavano.
// Regola (valori DESIGN_DEFAULT):
//  - ogni `period` giorni si confrontano le scorte con quelle del controllo precedente (state.aiTrade.snap): calo medio al giorno = consumo netto;
//  - se una merce scambiabile cala e basta per meno di `coverDays` giorni, e la nazione non ha già un contratto attivo da compratore per quella merce,
//    apre un contratto di `contractDays` giorni per il calo × `margin` (arrotondato all'intero per le merci a pezzi);
//  - venditore: la nazione che ha più scorta di quella merce, purché la sua scorta non stia calando e copra tutto il contratto con margine;
//    si prova in ordine di scorta finché un contratto si apre (percorso, diplomazia e guerra come per il giocatore, via openTradeContract);
//  - il giocatore non è mai venditore né compratore (non si spende o vende la sua merce senza un suo ordine).
// NON MODELLATO: vendite decise dall'IA per guadagnare, prezzi variabili, preferenza per gli alleati.
import { openTradeContract } from './tradeState.js';
import { tradableGoods } from '../rules/trade.js';

export const AI_TRADE_DEFAULTS = Object.freeze({ period: 10, coverDays: 60, contractDays: 90, margin: 1.2, sellerCover: 1.5 });

export function createAiTrade({ ctxOf, options = {} }) {
  const o = { ...AI_TRADE_DEFAULTS, ...options };

  function aiTradeDay(state) {
    if (!state.nations || !state.trade || state.day % o.period !== 0) return state;
    const ctx = ctxOf(state);
    const goods = tradableGoods(ctx.economy);
    const snapNow = Object.fromEntries(Object.entries(state.nations).map(([id, n]) => [id, Object.fromEntries(goods.filter((g) => (n.stocks?.[g] ?? 0) > 0).map((g) => [g, n.stocks[g]]))]));
    const prev = state.aiTrade?.snap;
    let s = { ...state, aiTrade: { schema: 'ai-trade-v1', snap: { day: state.day, stocks: snapNow } } };
    if (!prev || !(state.day > prev.day)) return s;
    const days = state.day - prev.day;
    const trend = (id, g) => ((state.nations[id].stocks?.[g] ?? 0) - (prev.stocks[id]?.[g] ?? 0)) / days;
    const pieces = new Set((ctx.resources ?? []).filter((r) => r.unit === 'pezzi').map((r) => r.id));
    const buying = (id, g) => s.trade.contracts.some((c) => c.buyer === id && c.good === g && (c.status === 'active' || c.status === 'suspended'));
    for (const buyer of Object.keys(state.nations).sort()) {
      if (buyer === state.player) continue;
      for (const g of goods) {
        const t = trend(buyer, g);
        if (!(t < 0)) continue;
        const stock = s.nations[buyer].stocks?.[g] ?? 0;
        if (stock / -t >= o.coverDays || buying(buyer, g)) continue;
        let perDay = -t * o.margin;
        perDay = pieces.has(g) || g.startsWith('equipment.') ? Math.ceil(perDay) : Math.ceil(perDay * 1000) / 1000;
        const need = perDay * o.contractDays * o.sellerCover;
        const sellers = Object.keys(s.nations).filter((id) => id !== buyer && id !== state.player && (s.nations[id].stocks?.[g] ?? 0) >= need && trend(id, g) >= 0)
          .sort((a, b) => (s.nations[b].stocks[g] - s.nations[a].stocks[g]) || (a < b ? -1 : 1));
        for (const seller of sellers) {
          const r = openTradeContract(s, { seller, buyer, good: g, perDay, days: o.contractDays, mode: 'auto' }, ctx);
          if (r.ok) { s = r.state; break; }
        }
      }
    }
    return s;
  }
  return { aiTradeDay };
}
