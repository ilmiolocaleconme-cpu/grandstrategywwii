// Cassa iniziale (data/industry/initial_cash.json). Solo dati e funzioni PURE. Regola approvata in chat il 28/10/2026:
// cassa = 30 giorni di entrata giornaliera (difficoltà Media, industria a pieno regime, miniere nazionali, quota province e capitale) + minimo uguale per tutte (200 ECV).
export const INITIAL_CASH_SCHEMA = 'initial-cash-v1';

/** Cassa per la difficoltà: cassa base × stockMul (facile 1,5 · media 1 · reale 0,7), arrotondata ai centesimi. */
export function cashFor(base, stockMul) {
  return Math.round(base * stockMul * 100) / 100;
}

/** Errori (lista vuota = valido). ctx: { ownerIds: Set (proprietari di nations nello stato) } */
export function validateInitialCash(file, { ownerIds }) {
  const errors = [];
  if (file?.schema !== INITIAL_CASH_SCHEMA) return [`cassa iniziale: schema ${file?.schema}, atteso ${INITIAL_CASH_SCHEMA}`];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('cassa iniziale: qualità attesa DESIGN_DEFAULT');
  if (!(file.days > 0) || !(file.floor >= 0)) errors.push('cassa iniziale: giorni o minimo non validi');
  for (const id of ownerIds) if (!file.nations?.[id]) errors.push(`cassa iniziale: manca ${id}`);
  for (const [id, n] of Object.entries(file.nations ?? {})) {
    if (!ownerIds.has(id)) errors.push(`cassa iniziale: ${id} non è un proprietario`);
    if (!(n.incomePerDay >= 0) || !Number.isInteger(n.provinces)) errors.push(`cassa iniziale: ${id}, entrata o province non valide`);
    const expected = Math.round((file.days * n.incomePerDay + file.floor) * 100) / 100;
    if (Math.abs(n.cash - expected) > 0.011) errors.push(`cassa iniziale: ${id} con cassa ${n.cash}, attesa ${expected} (giorni × entrata + minimo)`);
  }
  return errors;
}
