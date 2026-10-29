// Rinforzi delle divisioni (decisione dell'utente, 29/10/2026): passano dal pool, se ci sono abbastanza risorse; viaggiano verso le divisioni
// che ne hanno bisogno o ne fanno richiesta (regola di spostamento: arrivano dopo un tempo di trasferimento); il giocatore può decidere di non
// rinforzare più una divisione. Funzioni PURE: non modificano lo stato ricevuto.
// Stato usato (tutto OPZIONALE, nessuna migrazione): forces.divisions[id].reinforce (boolean, assente = true) e forces.transfers
// = [{ id, divisionId, item, qty, from: 'pool'|'stock', sentOn, arrivesOn }].
// NON definito (da stabilire con l'utente): giorni di trasferimento (si passa transitDays, da logistica/movimento), costi, addestramento delle reclute.
// Assunzioni da confermare: (1) i rinforzi già in viaggio arrivano anche se nel frattempo il giocatore sospende i rinforzi; (2) l'eccedenza oltre il previsto
// torna al pool/scorte; (3) "fanno richiesta" = priorità esplicita nell'ordine di assegnazione (non crea risorse).
import { addDays } from '../game/calendar.js';

export const MANPOWER_ITEM = 'manpower.war';

const isEnabled = (d) => d.reinforce !== false;
const transfersOf = (forces) => forces.transfers ?? [];

/** Imposta (o toglie) il rinforzo di una divisione. Lancia un Error se la divisione non ha un'istanza. */
export function setReinforcement(forces, divisionId, enabled) {
  const d = forces.divisions[divisionId];
  if (!d) throw new Error(`divisione senza istanza: ${divisionId}`);
  if (typeof enabled !== 'boolean') throw new TypeError('enabled deve essere booleano');
  return { ...forces, divisions: { ...forces.divisions, [divisionId]: { ...d, reinforce: enabled } } };
}

/** Quantità già in viaggio per una divisione e una voce (riservata: non si assegna due volte). */
export function inTransit(forces, divisionId, item) {
  return transfersOf(forces).filter((t) => t.divisionId === divisionId && t.item === item).reduce((s, t) => s + t.qty, 0);
}

/** Carenza netta di una voce: previsto − effettivo − già in viaggio (mai negativa). */
export function netDeficit(forces, divisionId, item) {
  const it = forces.divisions[divisionId]?.items?.[item];
  if (!it) return 0;
  return Math.max(0, it.planned - it.effective - inTransit(forces, divisionId, item));
}

/**
 * Assegna i rinforzi di una nazione. ctx: { units, nation, date, poolAvailable, stocks = {}, requests = {}, transitDays(divisionId) }.
 * poolAvailable = uomini disponibili nel pool (nationManpowerPool.available); i rinforzi già in viaggio sono sottratti. stocks = { voce: quantità }.
 * Ordine: prima le divisioni con richiesta, poi la più scoperta (effettivo/previsto più basso), poi per id. Non si assegna più della carenza né delle risorse.
 * Ritorna { transfers (nuovi), remaining: { pool, stocks }, skipped: [{ divisionId, item, reason }] }; reason: 'disabled' | 'no_resources'.
 */
export function planReinforcements(forces, { units, nation, date, poolAvailable, stocks = {}, requests = {}, transitDays }) {
  if (typeof transitDays !== 'function') throw new TypeError('transitDays è obbligatorio: il tempo di trasferimento non è inventato qui');
  const owned = new Set(units.filter((u) => u.nation === nation).map((u) => u.id));
  const ids = Object.keys(forces.divisions).filter((id) => owned.has(id));
  const reservedPool = ids.reduce((s, id) => s + inTransit(forces, id, MANPOWER_ITEM), 0);
  let pool = Math.max(0, poolAvailable - reservedPool);
  const left = {};
  for (const [k, v] of Object.entries(stocks)) left[k] = Math.max(0, v - ids.reduce((s, id) => s + inTransit(forces, id, k), 0));
  const transfers = [];
  const skipped = [];
  const itemsOf = (id) => Object.keys(forces.divisions[id].items);
  const fill = (id, item) => { const it = forces.divisions[id].items[item]; return it.planned === 0 ? 1 : it.effective / it.planned; };
  const order = [...ids].sort((a, b) => (Boolean(requests[b]) - Boolean(requests[a])) || (a < b ? -1 : 1));
  const queue = [];
  for (const id of order) for (const item of itemsOf(id)) if (netDeficit(forces, id, item) > 0) queue.push([id, item]);
  queue.sort((x, y) => (Boolean(requests[y[0]]) - Boolean(requests[x[0]])) || (fill(x[0], x[1]) - fill(y[0], y[1])) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : 1));
  for (const [id, item] of queue) {
    if (!isEnabled(forces.divisions[id])) { skipped.push({ divisionId: id, item, reason: 'disabled' }); continue; }
    const need = netDeficit(forces, id, item);
    const available = item === MANPOWER_ITEM ? pool : (left[item] ?? 0);
    const qty = Math.min(need, available);
    if (qty <= 0) { skipped.push({ divisionId: id, item, reason: 'no_resources' }); continue; }
    if (item === MANPOWER_ITEM) pool -= qty; else left[item] -= qty;
    const days = transitDays(id);
    if (!Number.isInteger(days) || days < 0) throw new RangeError(`giorni di trasferimento non validi per ${id}: ${days}`);
    transfers.push({ id: `${id}|${item}|${date}`, divisionId: id, item, qty, from: item === MANPOWER_ITEM ? 'pool' : 'stock', sentOn: date, arrivesOn: addDays(date, days) });
  }
  return { transfers, remaining: { pool, stocks: left }, skipped };
}

/** Registra i trasferimenti nello stato (non duplica: un id già presente è un errore). */
export function dispatch(forces, transfers) {
  const have = new Set(transfersOf(forces).map((t) => t.id));
  for (const t of transfers) if (have.has(t.id)) throw new Error(`trasferimento duplicato: ${t.id}`);
  return { ...forces, transfers: [...transfersOf(forces), ...transfers] };
}

/** Integra i trasferimenti arrivati alla data. L'effettivo non supera il previsto: l'eccedenza torna indietro (returned). Ritorna { forces, arrived, returned }. */
export function applyArrivals(forces, date) {
  const due = transfersOf(forces).filter((t) => t.arrivesOn <= date);
  const divisions = { ...forces.divisions };
  const arrived = [];
  const returned = [];
  for (const t of due) {
    const d = divisions[t.divisionId];
    const it = d?.items?.[t.item];
    if (!it) { returned.push({ ...t, returnedQty: t.qty }); continue; }
    const room = it.planned - it.effective;
    const taken = Math.min(t.qty, room);
    divisions[t.divisionId] = { ...d, items: { ...d.items, [t.item]: { ...it, effective: it.effective + taken } } };
    arrived.push({ ...t, taken });
    if (taken < t.qty) returned.push({ ...t, returnedQty: t.qty - taken });
  }
  return { forces: { ...forces, divisions, transfers: transfersOf(forces).filter((t) => t.arrivesOn > date) }, arrived, returned };
}

/** Errori di forma dei campi opzionali (reinforce e transfers). */
export function validateReinforcementFields(forces) {
  const errors = [];
  for (const [id, d] of Object.entries(forces.divisions ?? {})) if (d && typeof d === 'object' && 'reinforce' in d && typeof d.reinforce !== 'boolean') errors.push(`forze: ${id} reinforce non booleano`);
  if (forces.transfers !== undefined) {
    if (!Array.isArray(forces.transfers)) return [...errors, 'forze: transfers non è un array'];
    const seen = new Set();
    for (const t of forces.transfers) {
      if (seen.has(t?.id)) errors.push(`forze: trasferimento duplicato ${t?.id}`);
      seen.add(t?.id);
      if (!forces.divisions?.[t?.divisionId]) errors.push(`forze: trasferimento ${t?.id} verso divisione senza istanza`);
      if (!Number.isInteger(t?.qty) || t.qty <= 0) errors.push(`forze: trasferimento ${t?.id} con quantità non valida`);
      if (!['pool', 'stock'].includes(t?.from)) errors.push(`forze: trasferimento ${t?.id} con origine ${JSON.stringify(t?.from)}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t?.sentOn ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(t?.arrivesOn ?? '') || t.arrivesOn < t.sentOn) errors.push(`forze: trasferimento ${t?.id} con date non valide`);
    }
  }
  return errors;
}
