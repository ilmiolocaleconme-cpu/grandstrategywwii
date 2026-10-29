// Ricerca: una tecnologia per volta per nazione. Funzioni PURE (nessun Date.now, nessun Math.random).
// Stato per nazione (campo facoltativo, assente = nessuna tecnologia): nation.research = { done: [id], active: null | { techId, daysLeft, totalDays, paid, startedOn } }.
import { techIndex, techCost } from '../data/technologies.js';

export const researchOf = (nation) => nation?.research ?? { done: [], active: null };
export const techsOf = (nation) => new Set(researchOf(nation).done);
export const hasTech = (nation, techId) => techId == null || techsOf(nation).has(techId);

/** Errori di forma di nation.research (lista vuota = valido); undefined = valido. */
export function validateResearch(id, r, known = null) {
  if (r === undefined) return [];
  const errors = [];
  if (r === null || typeof r !== 'object' || !Array.isArray(r.done)) return [`stato: ${id}, ricerca non valida`];
  if (new Set(r.done).size !== r.done.length) errors.push(`stato: ${id}, tecnologia ricercata due volte`);
  if (known) for (const t of r.done) if (!known.has(t)) errors.push(`stato: ${id}, tecnologia sconosciuta ${t}`);
  const a = r.active;
  if (a !== null && a !== undefined) {
    if (typeof a.techId !== 'string' || !Number.isInteger(a.daysLeft) || a.daysLeft < 1) errors.push(`stato: ${id}, ricerca in corso non valida`);
    else if (r.done.includes(a.techId)) errors.push(`stato: ${id}, ricerca in corso già completata`);
    else if (known && !known.has(a.techId)) errors.push(`stato: ${id}, ricerca in corso sconosciuta ${a.techId}`);
  }
  return errors;
}

export function createResearch({ technologies, economy }) {
  const index = techIndex(technologies);
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

  /** Stato di ogni tecnologia per una nazione: 'done' | 'active' | 'available' | 'locked' | 'unaffordable'. */
  function listFor(state, nationId) {
    const nation = state.nations?.[nationId];
    if (!nation) return [];
    const r = researchOf(nation);
    return [...index.values()].map((t) => {
      const cost = techCost(economy, t, state.difficulty);
      const missing = t.prerequisites.filter((p) => !r.done.includes(p));
      let status = 'available';
      if (r.done.includes(t.id)) status = 'done';
      else if (r.active?.techId === t.id) status = 'active';
      else if (missing.length) status = 'locked';
      else if (r.active) status = 'busy';
      else if (nation.balance < cost.ecv) status = 'unaffordable';
      return { tech: t, cost, status, missing };
    });
  }

  /** Avvia una ricerca. Ritorna { ok, state } o { ok:false, reason: unknown_nation|unknown_tech|already_done|busy|prerequisites|missing, ... }. */
  function start(state, nationId, techId) {
    const nation = state.nations?.[nationId];
    if (!nation) return fail('unknown_nation');
    const tech = index.get(techId);
    if (!tech) return fail('unknown_tech');
    const r = researchOf(nation);
    if (r.done.includes(techId)) return fail('already_done');
    if (r.active) return fail('busy', { active: r.active.techId });
    const missingPre = tech.prerequisites.filter((p) => !r.done.includes(p));
    if (missingPre.length) return fail('prerequisites', { missing: missingPre });
    const cost = techCost(economy, tech, state.difficulty);
    if (!(nation.balance >= cost.ecv)) return fail('missing', { missing: [{ what: 'ecv', need: cost.ecv, have: nation.balance }] });
    const active = { techId, daysLeft: cost.days, totalDays: cost.days, paid: cost.ecv, startedOn: state.date };
    const next = { ...nation, balance: Math.round((nation.balance - cost.ecv) * 1000) / 1000, research: { done: r.done, active } };
    return { ok: true, state: { ...state, nations: { ...state.nations, [nationId]: next } } };
  }

  /** Sistema giornaliero: avanza la ricerca in corso di ogni nazione; a zero giorni la tecnologia è acquisita. */
  function researchDay(state) {
    if (!state.nations) return state;
    let nations = null;
    for (const [id, n] of Object.entries(state.nations)) {
      const a = n.research?.active;
      if (!a) continue;
      const left = a.daysLeft - 1;
      const research = left > 0 ? { done: n.research.done, active: { ...a, daysLeft: left } } : { done: [...n.research.done, a.techId], active: null };
      nations ??= { ...state.nations };
      nations[id] = { ...n, research };
    }
    return nations ? { ...state, nations } : state;
  }

  return { start, researchDay, listFor, index };
}
