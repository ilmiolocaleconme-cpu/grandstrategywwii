// Sistema degli eventi storici (18/11/2026), versione minima: eventi con data ed effetti, eseguiti UNA volta, registrati nella partita.
// Dati: data/events/events.json. Stato: `state.events` = { schema, done: [id], log: [{ id, date }] } (assente = nessun evento eseguito).
// Effetti: reorganize { unit, category } (cambio di categoria: il gioco porta la divisione al template della nuova categoria),
//          grant_stock { nation, item, qty } (materiale consegnato alla scorta nazionale: i rinforzi automatici lo portano ai reparti).
// Prossimi: nascita di Mengjiang (12/5/1936), guerra civile spagnola (luglio 1936), leve tedesche: da aggiungere con i loro effetti.
import { applyUnitChange } from '../rules/unitRegistry.js';

export const EVENTS_SCHEMA = 'events-v1';
export const EFFECT_KINDS = Object.freeze(['reorganize', 'grant_stock']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ['infantry', 'mountain', 'airborne', 'cavalry', 'motorized', 'mechanized', 'armored'];

/** Errori del file degli eventi. unitIds / itemIds (facoltativi): insiemi degli id esistenti (unità; voci `equipment.<id>` o risorse). */
export function validateEvents(file, { unitIds = null, itemIds = null, nationIds = null } = {}) {
  if (file?.schema !== EVENTS_SCHEMA) return [`eventi: schema ${JSON.stringify(file?.schema)}`];
  const e = [];
  const seen = new Set();
  for (const ev of file.events ?? []) {
    const p = `evento ${ev?.id ?? '?'}`;
    if (!/^EV-[A-Z0-9-]+$/.test(ev?.id ?? '')) { e.push(`${p}: id non valido`); continue; }
    if (seen.has(ev.id)) e.push(`${p}: duplicato`);
    seen.add(ev.id);
    if (!DATE_RE.test(ev.date ?? '')) e.push(`${p}: data non valida`);
    if (!ev.title_it) e.push(`${p}: titolo mancante`);
    if (!(ev.effects ?? []).length) e.push(`${p}: nessun effetto`);
    for (const f of ev.effects ?? []) {
      if (!EFFECT_KINDS.includes(f.kind)) { e.push(`${p}: effetto ${JSON.stringify(f.kind)}`); continue; }
      if (f.kind === 'reorganize') {
        if (unitIds && !unitIds.has(f.unit)) e.push(`${p}: unità ${f.unit} inesistente`);
        if (!CATEGORIES.includes(f.category)) e.push(`${p}: categoria ${JSON.stringify(f.category)}`);
      }
      if (f.kind === 'grant_stock') {
        if (nationIds && !nationIds.has(f.nation)) e.push(`${p}: nazione ${f.nation} inesistente`);
        if (itemIds && !itemIds.has(f.item)) e.push(`${p}: voce ${f.item} inesistente`);
        if (!(f.qty > 0)) e.push(`${p}: quantità non valida`);
      }
    }
  }
  return e;
}

/** Applica gli effetti di un evento. */
export function applyEvent(state, ev) {
  let s = state;
  for (const f of ev.effects) {
    if (f.kind === 'reorganize') s = applyUnitChange(s, f.unit, { category: f.category }, { date: s.date, event: ev.id });
    if (f.kind === 'grant_stock' && s.nations?.[f.nation]) {
      const n = s.nations[f.nation];
      s = { ...s, nations: { ...s.nations, [f.nation]: { ...n, stocks: { ...n.stocks, [f.item]: Math.round(((n.stocks?.[f.item] ?? 0) + f.qty) * 1000) / 1000 } } } };
    }
  }
  const cur = s.events ?? { schema: EVENTS_SCHEMA, done: [], log: [] };
  return { ...s, events: { schema: EVENTS_SCHEMA, done: [...cur.done, ev.id], log: [...cur.log, { id: ev.id, date: s.date }] } };
}

/** Sistema giornaliero: esegue (in ordine di data, poi id) gli eventi arrivati e non ancora eseguiti. Se la partita inizia dopo, li esegue al primo giorno. */
export function createEventsSystem({ events }) {
  const list = [...(events?.events ?? [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return (state) => {
    if (!list.length || state.date < list[0].date) return state;
    const done = new Set(state.events?.done ?? []);
    let s = state;
    for (const ev of list) { if (ev.date > state.date) break; if (!done.has(ev.id)) s = applyEvent(s, ev); }
    return s;
  };
}

export function validateEventsState(ev) {
  if (ev === undefined) return [];
  if (ev === null || typeof ev !== 'object' || ev.schema !== EVENTS_SCHEMA || !Array.isArray(ev.done) || !Array.isArray(ev.log)) return ['eventi: forma dello stato non valida'];
  return new Set(ev.done).size === ev.done.length ? [] : ['eventi: evento eseguito due volte'];
}
