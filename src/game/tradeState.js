// Stato del commercio dentro la partita (schema 7, 29/10/2026): contratti di fornitura via terra. Funzioni PURE. Regole in src/rules/trade.js.
import { createTradeState, validateTradeState, openContract, findLandRoute, revalidateRoutes, tradeDay, cancelContract } from '../rules/trade.js';

export { createTradeState };
export const validateTradeShape = validateTradeState;

/** Migrazione schema 6 → 7: nessun contratto. */
export function migrateV6toV7(state) {
  return { ...state, schema: 7, trade: createTradeState() };
}

/**
 * Apre un contratto nello stato di partita. ctx: { economy, resources, net (rete di movimento) }. Ritorna { ok, state, contract } o { ok: false, reason }.
 * Il percorso è calcolato ora (province del proprietario secondo la rete): senza rete caricata o senza percorso via terra l'ordine è rifiutato.
 */
export function openTradeContract(state, order, { economy, resources, net }) {
  if (!state.nations) return { ok: false, reason: 'no_economy' };
  if (!net) return { ok: false, reason: 'no_map' };
  const route = findLandRoute(net, (m) => net.owner(m), order.seller, order.buyer);
  const r = openContract(state.trade, order, { economy, resources, nations: state.nations, route, day: state.day + 1, date: state.date }); // i sistemi girano dopo l'avanzamento del giorno: il contratto parte dal prossimo
  return r.ok ? { ok: true, state: { ...state, trade: r.state }, contract: r.contract } : r;
}

export function cancelTradeContract(state, id) {
  const r = cancelContract(state.trade, id);
  return r.ok ? { ok: true, state: { ...state, trade: r.state } } : r;
}

/**
 * Sistema giornaliero (per GAME_SYSTEMS): consegne e partenze. Ogni `recheckEvery` giorni ricontrolla i percorsi, se la rete è caricata (getNet(stato) → rete o null).
 * ctx: { resources, getNet?, recheckEvery = 10 }.
 */
export function createTradeSystem({ resources, getNet = () => null, recheckEvery = 10 }) {
  return (state) => {
    if (!state.trade || !state.nations || state.trade.contracts.length === 0) return state;
    let trade = state.trade;
    const net = getNet(state);
    if (net && state.day % recheckEvery === 0) trade = revalidateRoutes(trade, { net, ownerOf: (m) => net.owner(m) });
    const r = tradeDay(trade, state.nations, { day: state.day, resources });
    return { ...state, trade: r.trade, nations: r.nations };
  };
}
