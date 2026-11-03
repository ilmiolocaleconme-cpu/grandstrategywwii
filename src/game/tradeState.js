// Stato del commercio dentro la partita (schema 7, 29/10/2026): contratti di fornitura via terra o via mare (30/10/2026). Funzioni PURE. Regole in src/rules/trade.js.
import { createTradeState, validateTradeState, openContract, findLandRoute, revalidateRoutes, tradeDay, cancelContract, TRANSIT_KM_PER_DAY } from '../rules/trade.js';

export { createTradeState };
export const validateTradeShape = validateTradeState;

/** Migrazione schema 6 → 7: nessun contratto. */
export function migrateV6toV7(state) {
  return { ...state, schema: 7, trade: createTradeState() };
}

/** Giorni di consegna di un percorso già calcolato (stessa regola di trade.js). */
const daysOf = (r) => (r.kind === 'sea' ? r.days : Math.max(1, Math.ceil(r.km / TRANSIT_KM_PER_DAY)));

/**
 * Sceglie il percorso secondo order.mode: 'land' (predefinito, come prima), 'sea' o 'auto' (il più rapido fra terra e mare; a parità, terra).
 * Ritorna il percorso oppure { ok: false, reason }. Senza rete 'land' dà 'no_map'; senza contesto marittimo 'sea' dà 'no_sea'.
 */
function chooseRoute(order, net, sea) {
  const mode = order.mode ?? 'land';
  if (!['land', 'sea', 'auto'].includes(mode)) return { ok: false, reason: 'invalid_mode' };
  const land = mode !== 'sea' && net ? findLandRoute(net, (m) => net.owner(m), order.seller, order.buyer) : null;
  const water = mode !== 'land' && sea ? sea.route(order.seller, order.buyer) : null;
  if (mode === 'land') return land ?? { ok: false, reason: 'no_map' };
  if (mode === 'sea') return water ?? { ok: false, reason: 'no_sea' };
  if (!land && !water) return { ok: false, reason: 'no_map' };
  if (land?.ok && water?.ok) return daysOf(water) < daysOf(land) ? water : land;
  if (land?.ok) return land;
  if (water?.ok) return water;
  return land ?? water;
}

/**
 * Apre un contratto nello stato di partita. ctx: { economy, resources, net (rete di movimento), sea? (createSeaContext), consent? ((stato, venditore, compratore) → {ok, reason}) }. Ritorna { ok, state, contract } o { ok: false, reason }.
 * Il percorso è calcolato ora (province del proprietario secondo la rete): senza rete caricata o senza percorso l'ordine è rifiutato.
 * order.mode: 'land' (predefinito), 'sea' o 'auto'.
 */
export function openTradeContract(state, order, ctx) {
  const { economy, resources, net, sea = null } = ctx;
  if (!state.nations) return { ok: false, reason: 'no_economy' };
  const consent = ctx.consent ? ctx.consent(state, order.seller, order.buyer) : { ok: true }; // diplomazia: guerra o rapporto ostile rifiutano il contratto
  if (!consent.ok) return { ok: false, reason: consent.reason === 'at_war' ? 'at_war' : 'hostile' };
  if ((order.mode ?? 'land') === 'land' && !net) return { ok: false, reason: 'no_map' };
  const route = chooseRoute(order, net, sea);
  const r = openContract(state.trade, order, { economy, resources, nations: state.nations, route, day: state.day + 1, date: state.date }); // i sistemi girano dopo l'avanzamento del giorno: il contratto parte dal prossimo
  return r.ok ? { ok: true, state: { ...state, trade: r.state }, contract: r.contract } : r;
}

export function cancelTradeContract(state, id) {
  const r = cancelContract(state.trade, id);
  return r.ok ? { ok: true, state: { ...state, trade: r.state } } : r;
}

/**
 * Sistema giornaliero (per GAME_SYSTEMS): consegne e partenze. Ogni `recheckEvery` giorni ricontrolla i percorsi, se la rete è caricata (getNet(stato) → rete o null) o il contesto marittimo (getSea(stato) → createSeaContext o null).
 * ctx: { resources, getNet?, getSea?, recheckEvery = 10 }.
 */
export function createTradeSystem({ resources, getNet = () => null, getSea = () => null, recheckEvery = 10 }) {
  return (state) => {
    if (!state.trade || !state.nations || state.trade.contracts.length === 0) return state;
    let trade = state.trade;
    const net = getNet(state);
    const sea = getSea(state);
    if ((net || sea) && state.day % recheckEvery === 0) {
      trade = revalidateRoutes(trade, { net, ownerOf: net ? (m) => net.owner(m) : undefined, seaRouteOf: sea ? (c) => sea.route(c.seller, c.buyer) : null });
    }
    const r = tradeDay(trade, state.nations, { day: state.day, resources });
    return { ...state, trade: r.trade, nations: r.nations };
  };
}
