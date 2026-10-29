// Commercio v1 (29/10/2026): contratti di fornitura fra due nazioni, solo via TERRA. Funzioni PURE e deterministiche (nessun Date.now, nessun Math.random).
// Cosa fa: un contratto vende `perDay` unità di una merce al giorno dal venditore al compratore, al prezzo di economy.json, per un numero di giorni;
// la merce parte dalla scorta del venditore, il compratore paga alla partenza, la merce arriva dopo `transitDays` (ritardo di trasporto).
// Percorso: dalle province del venditore a quelle del compratore sulla rete delle province madri (moveNet), attraversando solo province di venditore,
// compratore o terzi non bloccati. Se il percorso sparisce (province cambiano mano, nazione bloccata) il contratto si SOSPENDE; riprende se torna.
// NON implementato (limiti dichiarati): rotte marittime, porti, ferrovie/fiumi come capacità, blocchi e rischi, accordi diplomatici e relazioni,
// spread fra prezzo di acquisto e di vendita, capacità massima della rotta, limite dei magazzini. Il ritardo usa una velocità di progetto (ipotesi).
export const TRADE_SCHEMA = 'trade-v1';
/** Velocità di trasporto via terra per il ritardo di consegna: IPOTESI di progetto (km al giorno), non un dato storico. */
export const TRANSIT_KM_PER_DAY = 100;
export const STATUSES = Object.freeze(['active', 'suspended', 'ended', 'cancelled']);

const r3 = (v) => Math.round(v * 1000) / 1000;

export function createTradeState() {
  return { schema: TRADE_SCHEMA, nextId: 1, contracts: [] };
}

/** Merci commerciabili: hanno un prezzo > 0 in economy.json (elettricità, uomini e cavalli no). */
export function tradableGoods(economy) {
  return Object.entries(economy?.prices ?? {}).filter(([id, p]) => p > 0 && id !== 'electricity').map(([id]) => id).sort();
}

const isPieces = (resources, good) => resources?.find?.((r) => r.id === good)?.unit === 'pezzi';

/**
 * Percorso via terra più corto (km) fra due nazioni. net: { has, neighbors, km, owner } (src/data/moveNet.js); blocked: Set di nazioni da non attraversare.
 * ownerOf(provincia madre) → proprietario (di norma net.owner). Ritorna { ok, km, provinces, via } oppure { ok: false, reason }.
 */
export function findLandRoute(net, ownerOf, seller, buyer, { blocked = new Set(), provinces = null } = {}) {
  if (seller === buyer) return { ok: false, reason: 'same_nation' };
  const all = provinces ?? net.provinces?.() ?? [];
  const starts = all.filter((m) => ownerOf(m) === seller);
  if (starts.length === 0) return { ok: false, reason: 'no_provinces' };
  const allowed = (m) => { const o = ownerOf(m); return o === seller || o === buyer || (o != null && !blocked.has(o)); };
  const dist = new Map(); const prev = new Map(); const done = new Set();
  for (const s of starts) dist.set(s, 0);
  for (;;) {
    let cur = null; let best = Infinity;
    for (const [m, d] of dist) if (!done.has(m) && (d < best || (d === best && m < cur))) { cur = m; best = d; }
    if (cur === null) return { ok: false, reason: 'no_route' };
    if (ownerOf(cur) === buyer) {
      const path = [cur];
      while (prev.has(path[0])) path.unshift(prev.get(path[0]));
      const via = [...new Set(path.map(ownerOf))].filter((o) => o !== seller && o !== buyer);
      return { ok: true, km: Math.round(best), provinces: path, via };
    }
    done.add(cur);
    for (const n of net.neighbors(cur)) {
      if (done.has(n) || !allowed(n)) continue;
      const nd = best + net.km(cur, n);
      if (!dist.has(n) || nd < dist.get(n) - 1e-9) { dist.set(n, nd); prev.set(n, cur); }
    }
  }
}

/**
 * Apre un contratto. Ritorna { ok, state (stato del commercio), contract } oppure { ok: false, reason }.
 * order: { seller, buyer, good, perDay, days }; ctx: { economy, resources, nations (stato economico, per controllare che le nazioni esistano), route (da findLandRoute), day, date }
 */
export function openContract(trade, order, { economy, resources, nations, route, day, date }) {
  const { seller, buyer, good, perDay, days } = order;
  if (!nations?.[seller]) return { ok: false, reason: 'unknown_seller' };
  if (!nations?.[buyer]) return { ok: false, reason: 'unknown_buyer' };
  if (seller === buyer) return { ok: false, reason: 'same_nation' };
  if (!tradableGoods(economy).includes(good)) return { ok: false, reason: 'not_tradable' };
  if (!(perDay > 0) || (isPieces(resources, good) && !Number.isInteger(perDay))) return { ok: false, reason: 'invalid_quantity' };
  if (!Number.isInteger(days) || days < 1) return { ok: false, reason: 'invalid_duration' };
  if (!route?.ok) return { ok: false, reason: route?.reason ?? 'no_route' };
  const id = `TR-${String(trade.nextId).padStart(4, '0')}`;
  const contract = {
    id, seller, buyer, good, perDay, unitPrice: economy.prices[good], startDay: day, endDay: day + days - 1, startDate: date,
    status: 'active', route: { kind: 'land', km: route.km, via: route.via }, transitDays: Math.max(1, Math.ceil(route.km / TRANSIT_KM_PER_DAY)),
    delivered: 0, paid: 0, shortfallDays: 0, inTransit: [],
  };
  return { ok: true, state: { ...trade, nextId: trade.nextId + 1, contracts: [...trade.contracts, contract] }, contract };
}

export function cancelContract(trade, id) {
  const c = trade.contracts.find((x) => x.id === id);
  if (!c) return { ok: false, reason: 'unknown_contract' };
  if (c.status === 'ended' || c.status === 'cancelled') return { ok: false, reason: 'already_closed' };
  return { ok: true, state: { ...trade, contracts: trade.contracts.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)) } };
}

/** Sospende i contratti il cui percorso non esiste più e riattiva quelli sospesi che lo ritrovano. net/ownerOf/provinces come in findLandRoute. */
export function revalidateRoutes(trade, { net, ownerOf, provinces, blocked = new Set() }) {
  let changed = false;
  const contracts = trade.contracts.map((c) => {
    if (c.status !== 'active' && c.status !== 'suspended') return c;
    const r = findLandRoute(net, ownerOf, c.seller, c.buyer, { blocked, provinces });
    const status = r.ok ? 'active' : 'suspended';
    if (status === c.status && (!r.ok || r.km === c.route.km)) return c;
    changed = true;
    return r.ok ? { ...c, status, route: { kind: 'land', km: r.km, via: r.via }, transitDays: Math.max(1, Math.ceil(r.km / TRANSIT_KM_PER_DAY)) } : { ...c, status };
  });
  return changed ? { ...trade, contracts } : trade;
}

/**
 * Un giorno di commercio: arrivi, poi le partenze dei contratti attivi (in ordine di id). nations: stato economico per nazione { balance, stocks }.
 * Ritorna { trade, nations, events }. Conservazione: la merce e il denaro non si creano né si perdono (merce in viaggio inclusa).
 */
export function tradeDay(trade, nations, { day, resources }) {
  if (!nations || trade.contracts.length === 0) return { trade, nations, events: [] };
  const next = Object.fromEntries(Object.entries(nations).map(([k, v]) => [k, { ...v, stocks: { ...v.stocks } }]));
  const events = [];
  const contracts = [...trade.contracts].sort((a, b) => (a.id < b.id ? -1 : 1)).map((c) => {
    let { delivered, paid, shortfallDays, status } = c;
    const rest = [];
    for (const s of c.inTransit) {
      if (s.arrive <= day) { next[c.buyer].stocks[c.good] = r3((next[c.buyer].stocks[c.good] ?? 0) + s.qty); delivered = r3(delivered + s.qty); events.push({ type: 'arrived', id: c.id, good: c.good, qty: s.qty }); } else rest.push(s);
    }
    let inTransit = rest;
    if (status === 'active' && day > c.endDay) { status = 'ended'; events.push({ type: 'ended', id: c.id }); }
    if (status === 'active' && day >= c.startDay) {
      const seller = next[c.seller]; const buyer = next[c.buyer];
      let qty = Math.min(c.perDay, seller.stocks[c.good] ?? 0, buyer.balance / c.unitPrice);
      qty = isPieces(resources, c.good) ? Math.floor(qty + 1e-9) : r3(Math.floor(qty * 1000 + 1e-9) / 1000);
      if (qty < c.perDay) { shortfallDays += 1; events.push({ type: 'shortfall', id: c.id, wanted: c.perDay, sent: qty }); }
      if (qty > 0) {
        const cost = r3(qty * c.unitPrice);
        seller.stocks[c.good] = r3(seller.stocks[c.good] - qty);
        seller.balance = r3(seller.balance + cost);
        buyer.balance = r3(buyer.balance - cost);
        paid = r3(paid + cost);
        inTransit = [...inTransit, { arrive: day + c.transitDays, qty }];
        events.push({ type: 'sent', id: c.id, good: c.good, qty, cost });
      }
    }
    return { ...c, delivered, paid, shortfallDays, status, inTransit };
  });
  return { trade: { ...trade, contracts }, nations: next, events };
}

/** Totale di una merce in viaggio (per i test di conservazione e per la UI). */
export function inTransitTotal(trade, good) {
  return r3(trade.contracts.filter((c) => c.good === good).reduce((s, c) => s + c.inTransit.reduce((t, x) => t + x.qty, 0), 0));
}

/** Errori di forma (lista vuota = valido). */
export function validateTradeState(trade) {
  const errors = [];
  if (!trade || trade.schema !== TRADE_SCHEMA) return [`commercio: schema ${JSON.stringify(trade?.schema)}, atteso ${TRADE_SCHEMA}`];
  if (!Number.isInteger(trade.nextId) || trade.nextId < 1) errors.push('commercio: nextId non valido');
  if (!Array.isArray(trade.contracts)) return [...errors, 'commercio: contratti mancanti'];
  const ids = new Set();
  for (const c of trade.contracts) {
    const p = `commercio: ${c.id ?? '?'}`;
    if (!/^TR-\d{4,}$/.test(c.id ?? '')) errors.push(`${p}: id non valido`);
    if (ids.has(c.id)) errors.push(`${p}: id duplicato`);
    ids.add(c.id);
    if (Number.isInteger(trade.nextId) && /^TR-(\d+)$/.test(c.id ?? '') && Number(c.id.slice(3)) >= trade.nextId) errors.push(`${p}: id non inferiore a nextId`);
    if (!c.seller || !c.buyer || c.seller === c.buyer) errors.push(`${p}: venditore e compratore non validi`);
    if (!c.good) errors.push(`${p}: merce mancante`);
    if (!(c.perDay > 0) || !(c.unitPrice > 0)) errors.push(`${p}: quantità o prezzo non validi`);
    if (!Number.isInteger(c.startDay) || !Number.isInteger(c.endDay) || c.endDay < c.startDay) errors.push(`${p}: durata non valida`);
    if (!STATUSES.includes(c.status)) errors.push(`${p}: stato ${JSON.stringify(c.status)}`);
    if (!Number.isInteger(c.transitDays) || c.transitDays < 1) errors.push(`${p}: ritardo di trasporto non valido`);
    for (const k of ['delivered', 'paid', 'shortfallDays']) if (!(c[k] >= 0)) errors.push(`${p}: ${k} non valido`);
    if (!Array.isArray(c.inTransit) || c.inTransit.some((s) => !Number.isInteger(s.arrive) || !(s.qty > 0))) errors.push(`${p}: merce in viaggio non valida`);
  }
  return errors;
}
