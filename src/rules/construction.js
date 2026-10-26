// Avvio di una costruzione (fabbrica, miniera...): cinque vincoli decisi in chat il 26/10/2026 — denaro, acciaio, manodopera,
// energia disponibile nel pool e tecnologia richiesta. Funzione PURA: dice se si può iniziare e cosa manca, non modifica nulla.
const round = (v) => Math.round(v * 1000) / 1000;

/**
 * cost: { ecv, steel?, workers?, energyMw? }  requires: id tecnologia o null
 * have: { balance, steel, workers, powerSurplusMw, techs: Set|Array }
 * Ritorna { ok, missing: [{ what, need, have }] } — `missing` elenca TUTTI i vincoli non soddisfatti (per mostrarli nella UI).
 */
export function canStartBuild({ cost, requires = null }, have) {
  const missing = [];
  const check = (what, need, has) => { if (need > 0 && !(has >= need)) missing.push({ what, need: round(need), have: round(has ?? 0) }); };
  check('ecv', cost.ecv, have.balance);
  check('steel', cost.steel, have.steel);
  check('workers', cost.workers, have.workers);
  check('energyMw', cost.energyMw, have.powerSurplusMw);
  if (requires) {
    const techs = have.techs instanceof Set ? have.techs : new Set(have.techs ?? []);
    if (!techs.has(requires)) missing.push({ what: 'tech', need: requires, have: null });
  }
  return { ok: missing.length === 0, missing };
}
