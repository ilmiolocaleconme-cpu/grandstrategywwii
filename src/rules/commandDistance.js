// Distanza dal comando (decisione dell'utente, 06/11/2026). ORDINI DI MISURA = IPOTESI DI BILANCIAMENTO da approvare, non dati storici.
// Oltre COMMAND_DISTANCE_KM dal comando superiore, una divisione perde COMMAND_PENALTY_PER_DAY punti di prontezza al giorno,
// fino a COMMAND_PENALTY_CAP. La prontezza PERSA SI RECUPERA: quando il comando torna vicino, la penalità scende di 1 al giorno.
// La penalità è memorizzata nella condizione della divisione (campo opzionale `distancePenalty`, nessuna migrazione).
export const COMMAND_DISTANCE_KM = 300;
export const COMMAND_PENALTY_PER_DAY = 1;
export const COMMAND_PENALTY_CAP = 20;

/** Penalità del giorno successivo: sale se lontano dal comando, scende (recupero) se vicino. */
export function nextPenalty(current, far) {
  const p = Number.isFinite(current) ? current : 0;
  return far ? Math.min(COMMAND_PENALTY_CAP, p + COMMAND_PENALTY_PER_DAY) : Math.max(0, p - COMMAND_PENALTY_PER_DAY);
}

/** Lontano dal comando? km: distanza tra i centri delle province (rete di movimento). */
export const isFarFromCommand = (km) => km > COMMAND_DISTANCE_KM;

/** Aggiorna le penalità: updates = [{ unitId, far }]. Ritorna un nuovo `conditions` (il vecchio non cambia). */
export function applyDistancePenalties(conditions, updates) {
  const byUnit = { ...(conditions?.byUnit ?? {}) };
  for (const { unitId, far, base } of updates) {
    const cur = byUnit[unitId]?.distancePenalty ?? 0;
    const next = nextPenalty(cur, far);
    if (byUnit[unitId] === undefined ? next === 0 : cur === next) continue; // nessun cambiamento: nessuna voce nuova
    // entrata nuova: parte dai valori effettivi già calcolati dal chiamante (base), così il campo non altera nulla altro
    byUnit[unitId] = { ...(byUnit[unitId] ?? base), distancePenalty: next };
  }
  return { ...(conditions ?? { schema: 'conditions-v1' }), byUnit };
}
