// Tecnologie alle date storiche per le nazioni dell'IA (19/11/2026). Decisione dell'utente: «date storiche» finché l'IA non avrà una sua ricerca.
// Il giocatore NON riceve nulla: le sue tecnologie le ricerca. Dati: data/research/historical_tech_dates.json. Funzioni PURE.
import { researchOf } from './research.js';

export const HISTORICAL_TECH_SCHEMA = 'historical-tech-dates-v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Errori del file (lista vuota = valido): tecnologie note, date valide, prerequisiti già posseduti all'inizio o con data non successiva. */
export function validateHistoricalTechDates(doc, technologies) {
  if (doc?.schema !== HISTORICAL_TECH_SCHEMA) return [`date storiche: schema ${JSON.stringify(doc?.schema)}`];
  const pre = new Map((technologies.technologies ?? []).map((t) => [t.id, t.prerequisites ?? []]));
  const e = [];
  for (const [n, dates] of Object.entries(doc.byNation ?? {})) {
    const init = new Set(technologies.initialResearch?.[n] ?? []);
    for (const [id, d] of Object.entries(dates)) {
      if (!pre.has(id)) { e.push(`date storiche: ${n} ${id} sconosciuta`); continue; }
      if (!DATE_RE.test(d)) e.push(`date storiche: ${n} ${id} data non valida`);
      if (init.has(id)) e.push(`date storiche: ${n} ha già ${id} all'inizio`);
      for (const p of pre.get(id)) if (!init.has(p) && !(dates[p] && dates[p] <= d)) e.push(`date storiche: ${n} ${id} prima del prerequisito ${p}`);
    }
  }
  return e;
}

/** Tecnologie che la nazione riceve alla data (in ordine di data, poi di id), escluse quelle già possedute o in ricerca. */
export function dueTechs(doc, nationId, nation, date) {
  const r = researchOf(nation);
  const have = new Set(r.done);
  return Object.entries(doc.byNation?.[nationId] ?? {}).filter(([id, d]) => d <= date && !have.has(id) && r.active?.techId !== id)
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : 1)).map(([id]) => id);
}

/** Sistema giornaliero: le nazioni dell'IA (tutte tranne il giocatore) ricevono le tecnologie giunte alla loro data storica. */
export function createHistoricalTechSystem(doc) {
  const ids = Object.keys(doc.byNation ?? {}).sort();
  return function historicalTechDay(state) {
    let nations = state.nations;
    for (const id of ids) {
      if (id === state.player || !nations?.[id]) continue;
      const due = dueTechs(doc, id, nations[id], state.date);
      if (!due.length) continue;
      const r = researchOf(nations[id]);
      nations = { ...nations, [id]: { ...nations[id], research: { ...r, done: [...r.done, ...due] } } };
    }
    return nations === state.nations ? state : { ...state, nations };
  };
}
