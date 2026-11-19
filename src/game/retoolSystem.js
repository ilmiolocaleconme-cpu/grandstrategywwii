// Riconversione degli impianti d'equipaggiamento (20/11/2026, richiesta dell'utente: «inserisci ciò che manca»). Funzioni PURE.
// Prima nessuna regola cambiava la ricetta di un impianto tranne il giocatore: l'IA non produceva mai i modelli nati dopo il 1936 e le sue linee
// si fermavano per sempre quando un modello usciva di produzione (es. T-26 dal 1/7/1941). Due regole:
//  1) PIANO STORICO (tutte le nazioni): un impianto iniziale con `plannedRecipe: { recipeId, from }` passa alla ricetta del piano alla data,
//     appena il modello è producibile (data, tecnologia, controllo). Il giocatore lo annulla cambiando la ricetta a mano (setFacilityRecipe).
//  2) IA (nazioni non del giocatore), il primo di ogni mese: un impianto fermo (modello fuori produzione o senza il controllo della fabbrica storica)
//     o che produce un pezzo di cui le divisioni non hanno bisogno passa al modello producibile della stessa fabbrica con il fabbisogno più grande
//     (organico previsto − effettivo delle divisioni, meno la scorta). Al massimo una riconversione ogni RETOOL_COOLDOWN_DAYS per impianto.
// Alla riconversione i lotti già chiusi si consegnano subito (non si perdono e non cambiano prodotto); i pezzi in lavorazione si perdono, come per il giocatore.
import { recipeUnlocked } from '../data/equipmentProduction.js';

export const RETOOL_COOLDOWN_DAYS = 90;
const DAY = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Impianto riconvertito: lotti chiusi consegnati subito in `stocks`, lavorazione azzerata, data della riconversione. Ritorna { facility, stocks }. */
export function retoolFacility(f, recipeId, date, stocks, product) {
  const { wip, runDays, batches, plannedRecipe, ...rest } = f;
  const closed = (batches ?? []).reduce((t, b) => t + b.qty, 0);
  const next = closed > 0 && product ? { ...stocks, [product]: r3((stocks[product] ?? 0) + closed) } : stocks;
  return { facility: { ...rest, recipeId, retooledOn: date }, stocks: next };
}

/**
 * Fabbisogno per prodotto di una nazione: per ogni voce `equipment.*` delle sue divisioni max(0, previsto − effettivo), meno la scorta delle fonti
 * della voce (sourcesOf: voce → prodotti che la riforniscono). Ritorna Map(prodotto → pezzi mancanti) per i soli prodotti che riforniscono una voce.
 */
export function equipmentNeeds({ divisions, stocks, sourcesOf }) {
  const missing = new Map();
  for (const d of divisions) for (const [k, v] of Object.entries(d.items ?? {})) {
    if (!k.startsWith('equipment.') || !(v?.planned > 0)) continue;
    missing.set(k, (missing.get(k) ?? 0) + Math.max(0, v.planned - Math.max(0, v.effective ?? 0)));
  }
  const need = new Map();
  for (const [item, m] of missing) {
    const sources = sourcesOf ? sourcesOf(item) : [item];
    const net = m - sources.reduce((t, s) => t + (stocks?.[s] ?? 0), 0);
    for (const s of sources) need.set(s, Math.max(need.get(s) ?? 0, net)); // una voce si riempie da una qualunque delle sue fonti
  }
  return need;
}

/**
 * Riconversioni del mese per una nazione dell'IA. ctx: { recipes (Map), factories (Map, base_capacity_per_day), table, researched (Set), date,
 * controllerOf, need (Map da equipmentNeeds), horizonDays (default 90) }. Ritorna { facilities, stocks, changes: [{ id, from, to, reason }] }.
 */
export function aiRetoolNation(nation, nationId, ctx) {
  const { recipes, factories, table, researched, date, controllerOf = null, need, horizonDays = 90 } = ctx;
  const usable = (r) => r?.equipmentId && r.equipmentId.split('-')[1] === nationId && recipeUnlocked(table, r, researched, date, controllerOf);
  const perDay = (r) => ((factories?.get(r.factory)?.base_capacity_per_day ?? 0) * (r.capacityShare ?? 1)) / r.massTonnes;
  const left = new Map(need);
  // la produzione già in corso copre una parte del fabbisogno: si sottrae prima di scegliere
  for (const f of nation.facilities) { const r = recipes.get(f.recipeId); if (usable(r) && f.active !== false) left.set(r.output.product, (left.get(r.output.product) ?? 0) - perDay(r) * horizonDays); }
  let stocks = nation.stocks; const changes = [];
  const facilities = nation.facilities.map((f) => {
    const cur = recipes.get(f.recipeId);
    if (!cur?.equipmentId || f.plannedRecipe) return f; // solo impianti d'equipaggiamento; un piano storico ha la precedenza
    if (f.retooledOn && daysBetween(f.retooledOn, date) < RETOOL_COOLDOWN_DAYS) return f;
    const stopped = !usable(cur);
    const idle = !stopped && (need.get(cur.output.product) ?? 0) <= 0;
    if (!stopped && !idle) return f;
    const options = [...recipes.values()].filter((r) => r.factory === cur.factory && r.id !== cur.id && usable(r) && (left.get(r.output.product) ?? 0) > 0);
    options.sort((a, b) => (left.get(b.output.product) * b.massTonnes) - (left.get(a.output.product) * a.massTonnes) || (a.id < b.id ? -1 : 1));
    let to = options[0];
    // fermo e senza fabbisogno: il modello più recente della stessa categoria (il successore), per non lasciare la linea inattiva
    // (prima lo stesso ruolo, es. carro leggero → carro leggero; altrimenti lo stesso gruppo, es. T-26 → T-34 nell'estate 1941)
    if (!to && stopped) to = [...recipes.values()].filter((r) => r.factory === cur.factory && r.id !== cur.id && usable(r) && r.group === cur.group)
      .sort((a, b) => Number(b.role === cur.role) - Number(a.role === cur.role) || (b.availableFrom ?? '').localeCompare(a.availableFrom ?? '') || (a.id < b.id ? -1 : 1))[0];
    if (!to) return f;
    left.set(to.output.product, (left.get(to.output.product) ?? 0) - perDay(to) * horizonDays);
    const res = retoolFacility(f, to.id, date, stocks, cur.output.product);
    stocks = res.stocks;
    changes.push({ id: f.id, from: cur.id, to: to.id, reason: stopped ? 'fermo' : 'senza fabbisogno' });
    return res.facility;
  });
  return { facilities, stocks, changes };
}

/**
 * Sistema giornaliero. ctx: { recipes, factories, table, techsOf(nationState) → Set, controllerOf(state) → (provincia) → nazione | null,
 * divisionsOf(state, nationId) → istanze di divisione, sourcesOf(nationId, item) → prodotti }.
 */
export function createRetoolSystem(ctx) {
  const { recipes, factories, table, techsOf, controllerOf = null, divisionsOf, sourcesOf } = ctx;
  return function retoolDay(state) {
    if (!state.nations || !state.date) return state;
    const monthly = state.date.endsWith('-01');
    const where = controllerOf ? controllerOf(state) : null;
    let nations = state.nations; let changed = false;
    for (const id of Object.keys(state.nations).sort()) {
      let n = nations[id];
      if (!n?.facilities?.length) continue;
      const researched = techsOf(n);
      // 1) piano storico
      if (n.facilities.some((f) => f.plannedRecipe && f.plannedRecipe.from <= state.date)) {
        let stocks = n.stocks;
        const facilities = n.facilities.map((f) => {
          if (!f.plannedRecipe || f.plannedRecipe.from > state.date) return f;
          const to = recipes.get(f.plannedRecipe.recipeId);
          if (!to || !recipeUnlocked(table, to, researched, state.date, where)) return f; // aspetta tecnologia o controllo
          const res = retoolFacility(f, to.id, state.date, stocks, recipes.get(f.recipeId)?.output?.product);
          stocks = res.stocks;
          return res.facility;
        });
        n = { ...n, facilities, stocks }; changed = true;
      }
      // 2) IA, il primo del mese
      if (monthly && id !== state.player && divisionsOf) {
        const need = equipmentNeeds({ divisions: divisionsOf(state, id), stocks: n.stocks, sourcesOf: sourcesOf ? (item) => sourcesOf(id, item) : null });
        const r = aiRetoolNation(n, id, { recipes, factories, table, researched, date: state.date, controllerOf: where, need });
        if (r.changes.length) { n = { ...n, facilities: r.facilities, stocks: r.stocks }; changed = true; }
      }
      if (n !== nations[id]) nations = { ...nations, [id]: n };
    }
    return changed ? { ...state, nations } : state;
  };
}
