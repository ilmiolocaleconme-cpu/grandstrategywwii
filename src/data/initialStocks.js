// Stock iniziali 1/1/1936 (data/industry/initial_stocks.json). Solo dati e funzioni PURE.
// Regola (approvata in chat il 27/10/2026): una nazione con industria resiste `days` giorni senza commercio, con l'industria a `utilisation` del pieno regime.
// stock = giorni × (consumo dell'industria − produzione nazionale: estrazione + impianti), solo dove il saldo è negativo. Qualità DESIGN_DEFAULT.
// `floor` (29/10/2026): riserva minima per risorsa uguale per tutte le nazioni, applicata da buildNations come massimo.
import { fullCapacityFlows } from './recipes.js';
export const INITIAL_STOCKS_SCHEMA = 'initial-stocks-v1';

/**
 * Calcola gli stock iniziali. ctx: { industry (file initial_industry), recipes (file ricette), factoriesById: Map, supply: { idEntità: { risorsa: t/giorno } }, days, utilisation }
 * Ritorna { idEntità: { risorsa: t (intere, per eccesso) } } solo con quantità > 0.
 */
export function computeInitialStocks({ industry, recipes, factoriesById, supply, days, utilisation }) {
  const rec = new Map(recipes.recipes.map((r) => [r.id, r]));
  const out = {};
  for (const [id, n] of Object.entries(industry.nations)) {
    const net = { ...(supply[id] ?? {}) };
    for (const f of n.facilities) {
      const r = rec.get(f.recipeId); const fl = fullCapacityFlows(r, factoriesById.get(f.factory));
      if (fl.outputUnit === 'MW') { net.coal = (net.coal ?? 0) - fl.inputsPerDay.coal * f.count * utilisation; continue; } // le centrali consumano solo il carbone; l'elettricità è un flusso
      net[r.output.product] = (net[r.output.product] ?? 0) + fl.outputPerDay * f.count * utilisation;
      for (const [k, q] of Object.entries(fl.inputsPerDay)) net[k] = (net[k] ?? 0) - q * f.count * utilisation;
    }
    const stock = {};
    for (const [k, v] of Object.entries(net)) if (v < -1e-9) stock[k] = Math.ceil(-v * days - 1e-6);
    if (Object.keys(stock).length) out[id] = stock;
  }
  return out;
}

/** Errori (lista vuota = valido). ctx: { resourceIds: Set, industry } */
export function validateInitialStocks(file, { resourceIds, industry }) {
  const errors = [];
  if (file?.schema !== INITIAL_STOCKS_SCHEMA) return [`stock iniziali: schema ${file?.schema}, atteso ${INITIAL_STOCKS_SCHEMA}`];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('stock iniziali: qualità attesa DESIGN_DEFAULT');
  if (!(file.days > 0)) errors.push('stock iniziali: giorni non validi');
  if (!(file.utilisation > 0 && file.utilisation <= 1)) errors.push('stock iniziali: utilizzo non valido');
  for (const [r, q] of Object.entries(file.floor ?? {})) {
    if (!resourceIds.has(r)) errors.push(`stock iniziali: riserva minima con risorsa inesistente ${r}`);
    if (r === 'electricity' || r === 'hydro') errors.push(`stock iniziali: riserva minima di ${r}, che è un flusso`);
    if (!Number.isInteger(q) || q <= 0) errors.push(`stock iniziali: riserva minima non valida per ${r}`);
  }
  for (const [id, s] of Object.entries(file.stocks ?? {})) {
    if (!industry.nations?.[id]) errors.push(`stock iniziali: ${id} non ha industria iniziale`);
    for (const [r, v] of Object.entries(s)) {
      if (!resourceIds.has(r)) errors.push(`stock iniziali: ${id} con risorsa inesistente ${r}`);
      if (r === 'electricity' || r === 'hydro') errors.push(`stock iniziali: ${id} con ${r}, che è un flusso e non uno stock`);
      if (!Number.isInteger(v) || v <= 0) errors.push(`stock iniziali: ${id}, quantità non valida per ${r}`);
    }
  }
  return errors;
}
