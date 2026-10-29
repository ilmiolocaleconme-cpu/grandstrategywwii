// Condizione delle divisioni nello stato della partita: campo OPZIONALE `conditions` (assente = tutte alle condizioni iniziali), quindi
// nessuna migrazione. Le regole sono in src/rules/divisionCondition.js; qui: validazione, comando del giocatore e sistema giornaliero.
import { validateConditionState, createConditionState, trainUntil, setPolicy } from '../rules/divisionCondition.js';

export const validateConditionShape = (state) => validateConditionState(state.conditions);

/** Il giocatore sceglie la politica d'impiego di una sua divisione (solo memorizzata). */
export function playerSetPolicy(state, unitId, policy, cfg, nation = null) {
  return { ...state, conditions: setPolicy(state.conditions ?? createConditionState(), unitId, policy, cfg, nation) };
}

/** Sistema giornaliero: addestramento mensile delle unità nuove (idempotente per mese). */
export function createConditionSystem(cfg) {
  return (state) => {
    if (!state.conditions) return state;
    const next = trainUntil(state.conditions, state.date, cfg);
    return next === state.conditions ? state : { ...state, conditions: next };
  };
}
