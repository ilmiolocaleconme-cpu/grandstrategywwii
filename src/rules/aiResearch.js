// Ricerca dell'IA per punteggio (23/11/2026, IA passo 3, approvato dall'utente). Funzioni PURE.
// Le date storiche (src/game/historicalTech.js) restano il minimo garantito: qui si decide solo cosa ricercare prima.
// Punteggio di una tecnologia = somma dei suoi effetti × dottrina del ramo (al massimo +15% per settore):
//  - armi nuove (`equipment`): di quanto migliora il miglior modello nei posti delle divisioni (valore per tonnellata del passo 2);
//  - bonus in battaglia: bonus × quota delle divisioni interessate × BATTLE_SCALE;
//  - nuovi battaglioni, armi individuali, munizioni perforanti, porti: valori fissi;
//  - industria prima in pace, sicurezza prima con i rivali (come prima);
//  - minaccia: un rivale ha già la tecnologia (armi, munizioni, bonus in battaglia) → +THREAT;
//  - prerequisito: + PREREQ × il punteggio migliore delle tecnologie che apre (un livello, es. le ottiche aprono i cannoni lunghi).
// I valori fissi sono scelte di bilanciamento di Claude (DESIGN_DEFAULT), non dati storici.
import { techList } from '../data/equipmentProduction.js';
import { sameSlot } from './aiProduction.js';

export const RESEARCH_WEIGHTS = Object.freeze({
  BATTLE_SCALE: 10, MODULES: 0.25, SMALL_ARMS: 0.3, AP_ROUNDS: 0.4, PORT: 0.2,
  INDUSTRY_PEACE: 1.2, INDUSTRY_WAR: 0.6, SECURITY_RIVALS: 1.2, SECURITY_PEACE: 0.05,
  THREAT: 0.5, UNLOCK_CAP: 2, NOT_NEEDED: 0.3, HORIZON_DAYS: 730, PREREQ: 0.5,
});
const THREAT_KINDS = new Set(['equipment', 'ap_rounds', 'battle_bonus']);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Miglioramento delle armi sbloccate dalla tecnologia `techId` (≥ 0): per ogni ricetta che la richiede e che si sbloccherebbe entro
 * HORIZON_DAYS, rapporto tra il suo punteggio e il miglior modello oggi producibile per lo stesso posto delle divisioni, meno 1
 * (1 se oggi non c'è niente). Posti senza fabbisogno valgono NOT_NEEDED. Massimo UNLOCK_CAP.
 * ctx: { recipes (iterabile), unlocked(recipe, researched, date) → bool, researched: Set, date, slots: Map, need: Map, scoreOf(recipe) }
 */
export function techUnlockGain(techId, ctx) {
  const W = RESEARCH_WEIGHTS;
  const { recipes, unlocked, researched, date, slots, need, scoreOf } = ctx;
  const all = [...recipes];
  const withT = new Set([...researched, techId]);
  const later = addDays(date, W.HORIZON_DAYS);
  let best = 0;
  for (const r of all) {
    if (!techList(r.requiresTech).includes(techId) || !slots.has(r.output.product)) continue;
    if (!unlocked(r, withT, later) || unlocked(r, researched, later)) continue;
    const s = scoreOf(r);
    if (!(s > 0)) continue;
    const cur = Math.max(0, ...all.filter((x) => x !== r && unlocked(x, researched, date) && sameSlot(slots, x.output.product, r.output.product)).map((x) => scoreOf(x) ?? 0));
    const gain = cur > 0 ? Math.max(0, s / cur - 1) : 1;
    best = Math.max(best, gain * ((need.get(r.output.product) ?? 0) > 0 ? 1 : W.NOT_NEEDED));
  }
  return Math.min(W.UNLOCK_CAP, best);
}

/**
 * Punteggio della tecnologia. ctx: { involved, rivalsHave(techId) → bool, unlockGain(techId) → number,
 * categoryShare(categorie) → 0..1, doctrine(ramo) → fattore ≥ 1, successorsOf(techId) → tecnologie (facoltativo) }.
 */
export function techScore(tech, ctx, lookahead = true) {
  const W = RESEARCH_WEIGHTS;
  let v = 0;
  for (const e of tech.unlocks ?? tech.effects ?? []) {
    if (e.kind === 'equipment') v += ctx.unlockGain(tech.id);
    else if (e.kind === 'battle_bonus') v += e.value * W.BATTLE_SCALE * ctx.categoryShare(e.categories ?? []);
    else if (e.kind === 'modules') v += W.MODULES;
    else if (e.kind === 'small_arms') v += W.SMALL_ARMS;
    else if (e.kind === 'ap_rounds') v += W.AP_ROUNDS;
    else if (e.kind === 'port_level') v += W.PORT;
    else if (e.kind === 'factory_level') v += ctx.involved ? W.INDUSTRY_WAR : W.INDUSTRY_PEACE;
    else if (e.kind === 'security') v += ctx.involved ? W.SECURITY_RIVALS : W.SECURITY_PEACE;
  }
  if ((tech.unlocks ?? tech.effects ?? []).some((e) => THREAT_KINDS.has(e.kind)) && ctx.rivalsHave(tech.id)) v += W.THREAT;
  v *= ctx.doctrine?.(tech.branch) ?? 1;
  // ctx.successorsOf(id) → tecnologie che hanno `id` fra i prerequisiti (un solo livello)
  if (lookahead && ctx.successorsOf) v += W.PREREQ * Math.max(0, ...ctx.successorsOf(tech.id).map((t) => techScore(t, ctx, false)));
  return v;
}

/** La voce dell'elenco (`{ tech }`) con il punteggio più alto; a parità, id in ordine alfabetico. null se l'elenco è vuoto. */
export function pickResearch(list, scoreOf) {
  let best = null; let bestScore = -Infinity;
  for (const x of [...list].sort((a, b) => (a.tech.id < b.tech.id ? -1 : 1))) {
    const s = scoreOf(x.tech);
    if (s > bestScore) { best = x; bestScore = s; }
  }
  return best;
}
