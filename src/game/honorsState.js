// Vittorie e promozioni dei reparti (20/11/2026, decisione dell'utente: Guardie sovietiche per promozione). Funzioni PURE.
// Stato OPZIONALE (assente = nessuna vittoria): state.honors = { schema, wins: { idUnità: n }, services: { idUnità: { service, since, exName } } }.
// Le vittorie le registra la battaglia (src/game/theaterState.js, chi resta sul campo quando il nemico cede); le promozioni le fa il sistema giornaliero
// qui sotto secondo `promotion` dei servizi (data/units/services.json). Stessa regola per ogni nazione che abbia un servizio con origin «promotion».
import { serviceOf } from '../data/services.js';
import { applyUnitChange } from '../rules/unitRegistry.js';
import { conditionOf, createConditionState } from '../rules/divisionCondition.js';

export const HONORS_SCHEMA = 'honors-v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const empty = () => ({ schema: HONORS_SCHEMA, wins: {}, services: {} });

export function validateHonors(h) {
  if (h === undefined) return [];
  if (!h || h.schema !== HONORS_SCHEMA || typeof h.wins !== 'object' || typeof h.services !== 'object') return ['onorificenze: forma non valida'];
  const e = [];
  for (const [id, n] of Object.entries(h.wins)) if (!(Number.isInteger(n) && n >= 0)) e.push(`onorificenze: vittorie di ${id} non valide`);
  for (const [id, s] of Object.entries(h.services)) if (typeof s?.service !== 'string' || !DATE_RE.test(s?.since ?? '')) e.push(`onorificenze: promozione di ${id} non valida`);
  return e;
}

/** Una vittoria in più per ciascun reparto. */
export function recordWins(honors, unitIds) {
  if (!unitIds.length) return honors;
  const h = honors ?? empty();
  const wins = { ...h.wins };
  for (const id of unitIds) wins[id] = (wins[id] ?? 0) + 1;
  return { ...h, wins };
}

/** Servizio di un reparto tenendo conto delle promozioni in partita. */
export function serviceOfUnit(doc, state, unit) {
  const p = unit ? state?.honors?.services?.[unit.id] : null;
  return (p && (doc?.services ?? []).find((s) => s.id === p.service)) ?? serviceOf(doc, unit);
}

/** Numero d'ordine del prossimo reparto promosso: dopo il più alto già esistente fra quelli con lo stesso nome base (es. «13th Guards Rifle Division» → 14). */
function nextNumber(doc, state, units, svc, unit) {
  let max = 0;
  for (const u of units) {
    if (u.echelon !== unit.echelon || u.category !== unit.category || serviceOfUnit(doc, state, u)?.id !== svc.id) continue;
    const m = /^(\d+)/.exec(u.name ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * Sistema giornaliero delle promozioni. ctx: { doc (services.json), unitsOf(state) → unità (catalogo + partita, con i cambi), conditionCfg }.
 * Un reparto passa al servizio `s` se: s.origin === 'promotion', data ≥ s.availableFrom, il suo servizio attuale è s.promotion.from, ha almeno
 * s.promotion.wins vittorie ed è una divisione o brigata. Effetti: nuovo servizio (precedenza nei rinforzi), esperienza + s.experienceBonus,
 * nome secondo s.promotion.names[categoria] (il vecchio resta in exName).
 */
export function createPromotionSystem({ doc, unitsOf, conditionCfg }) {
  const promoting = (doc?.services ?? []).filter((s) => s.origin === 'promotion' && s.promotion);
  return function promotionDay(state) {
    const wins = state.honors?.wins;
    if (!promoting.length || !wins || !Object.keys(wins).length) return state;
    let s = state;
    const units = unitsOf(state);
    for (const svc of promoting) {
      if (svc.availableFrom && s.date < svc.availableFrom) continue;
      const cands = units.filter((u) => u.nation === svc.nation && (u.echelon === 'division' || u.echelon === 'brigade') && (wins[u.id] ?? 0) >= svc.promotion.wins
        && serviceOfUnit(doc, s, u)?.id === svc.promotion.from).sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const u of cands) {
        const k = nextNumber(doc, s, unitsOf(s), svc, u);
        const fmt = svc.promotion.names?.[`${u.echelon}:${u.category}`] ?? svc.promotion.names?.[u.echelon] ?? '{k} {name}';
        const name = fmt.replace('{k}', String(k)).replace('{name}', u.name);
        const h = s.honors ?? empty();
        s = { ...s, honors: { ...h, services: { ...h.services, [u.id]: { service: svc.id, since: s.date, exName: u.name } } } };
        s = applyUnitChange(s, u.id, { name }, { date: s.date, event: `promozione:${svc.id}` });
        if (conditionCfg && svc.experienceBonus) {
          const conditions = s.conditions ?? createConditionState();
          const cur = conditionOf(conditions, u.id, conditionCfg, u.nation);
          const entry = { experience: Math.min(100, cur.experience + svc.experienceBonus), morale: cur.morale, readiness: cur.readinessBeforeDistance, policy: cur.policy, isNew: cur.isNew, trainedThrough: cur.trainedThrough };
          s = { ...s, conditions: { ...conditions, byUnit: { ...conditions.byUnit, [u.id]: entry } } };
        }
      }
    }
    return s;
  };
}
