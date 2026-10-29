// Vista del commercio per l'interfaccia (nessun React): merci, anteprima del contratto, righe dei contratti. Funzioni PURE.
import { tradableGoods } from '../rules/trade.js';
import { openTradeContract } from '../game/tradeState.js';

const MODE_NAMES = { land: 'via terra', sea: 'via mare', auto: 'la via più rapida' };
export const modeName = (mode) => MODE_NAMES[mode] ?? mode;
export const STATUS_NAMES = { active: 'attivo', suspended: 'sospeso (percorso interrotto)', ended: 'concluso', cancelled: 'annullato' };

/** Merci commerciabili con nome, unità e prezzo: [{ id, name, unit, price }] in ordine alfabetico del nome. */
export function tradeGoods(economy, resources) {
  const byId = new Map((resources ?? []).map((r) => [r.id, r]));
  return tradableGoods(economy).map((id) => ({ id, name: byId.get(id)?.name ?? id, unit: byId.get(id)?.unit ?? 't', price: economy.prices[id] })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

/** Frase in italiano per un ordine di commercio rifiutato. */
export function describeTradeFailure(reason) {
  switch (reason) {
    case 'no_map': return 'La mappa delle strade non è ancora caricata, oppure non esiste un percorso via terra';
    case 'no_route': return 'Non esiste un percorso via terra tra le due nazioni';
    case 'no_provinces': return 'Una delle nazioni non ha province';
    case 'no_sea': return 'Le rotte marittime non sono ancora caricate';
    case 'no_port_seller': return 'Il venditore non ha porti';
    case 'no_port_buyer': return 'Il compratore non ha porti';
    case 'same_nation': return 'Venditore e compratore coincidono';
    case 'not_tradable': return 'Questa merce non si può commerciare';
    case 'invalid_quantity': return 'Quantità non valida (i pezzi vanno in numeri interi)';
    case 'invalid_duration': return 'Durata non valida';
    case 'invalid_mode': return 'Modo di trasporto non valido';
    case 'no_economy': return 'Economia non inizializzata';
    case 'unknown_seller': case 'unknown_buyer': return 'Nazione sconosciuta';
    default: return `Ordine rifiutato (${reason})`;
  }
}

const f1 = (v) => Math.round(v * 10) / 10;

/**
 * Anteprima di un contratto senza modificare lo stato. order: { seller, buyer, good, perDay, days, mode }; ctx: { economy, resources, net, sea, nationId (il giocatore) }.
 * Ritorna { ok, route: { kind, km, days, via, ports }, valuePerDay, warnings, message }.
 */
export function previewTrade(state, order, ctx) {
  const r = openTradeContract(state, order, ctx);
  if (!r.ok) return { ok: false, message: describeTradeFailure(r.reason), warnings: [] };
  const c = r.contract; const warnings = [];
  const value = f1(c.perDay * c.unitPrice * 1000) / 1000;
  const seller = state.nations[c.seller]; const buyer = state.nations[c.buyer];
  if ((seller.stocks[c.good] ?? 0) < c.perDay) warnings.push(`Il venditore ha ${f1(seller.stocks[c.good] ?? 0)} in scorta: la consegna giornaliera sarà parziale`);
  if (buyer.balance < c.perDay * c.unitPrice) warnings.push('Il compratore non ha cassa per una consegna giornaliera intera');
  if (c.route.via?.length) warnings.push(`Passa da territori di terzi: ${c.route.via.join(', ')}`);
  return { ok: true, route: { kind: c.route.kind, km: c.route.km, days: c.transitDays, via: c.route.via ?? [], ports: c.route.ports ?? null }, valuePerDay: value, totalValue: Math.round(value * (c.endDay - c.startDay + 1) * 1000) / 1000, warnings, message: '' };
}

/** Contratti che riguardano `nationId`: [{ id, role, partner, good, perDay, unit, status, statusName, kind, km, transitDays, delivered, paid, inTransit, shortfallDays, daysLeft, canCancel }]. */
export function tradeRows(state, nationId, { nationName = (id) => id, goods = [] } = {}) {
  const byGood = new Map(goods.map((g) => [g.id, g]));
  return (state.trade?.contracts ?? []).filter((c) => c.seller === nationId || c.buyer === nationId).map((c) => {
    const g = byGood.get(c.good);
    return {
      id: c.id, role: c.seller === nationId ? 'vendi' : 'compri', partner: nationName(c.seller === nationId ? c.buyer : c.seller), good: g?.name ?? c.good, perDay: c.perDay, unit: g?.unit ?? 't',
      status: c.status, statusName: STATUS_NAMES[c.status] ?? c.status, kind: c.route?.kind ?? 'land', km: c.route?.km ?? 0, transitDays: c.transitDays,
      delivered: c.delivered, paid: Math.round(c.paid * 1000) / 1000, inTransit: Math.round(c.inTransit.reduce((s, x) => s + x.qty, 0) * 1000) / 1000, shortfallDays: c.shortfallDays,
      daysLeft: Math.max(0, c.endDay - state.day + 1), canCancel: c.status === 'active' || c.status === 'suspended',
    };
  }).sort((a, b) => (a.id < b.id ? 1 : -1));
}
