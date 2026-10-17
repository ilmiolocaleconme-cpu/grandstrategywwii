// Motore a tick giornalieri. Funzioni pure: stesso stato in ingresso, stesso stato in uscita
// (nessun Date.now, nessun Math.random), così una partita si riproduce dal salvataggio.
//
// STATO ATTUALE: l'unico effetto di un tick è far avanzare la data. Le regole (economia, unità,
// movimento, combattimento, eventi) non esistono ancora. Quando arriveranno si aggiungono a
// SYSTEMS, nell'ordine di priorità del master (combattimenti, fronti, logistica critica,
// movimenti, economia, eventi, secondari). Ogni sistema è una funzione (stato) => stato.

import { withNextDay } from './state.js';

/** Sistemi eseguiti a ogni giorno, in ordine. Vuoto di proposito: niente regole finte. */
export const SYSTEMS = [];

export function advanceDay(state, systems = SYSTEMS) {
  let next = withNextDay(state);
  for (const system of systems) next = system(next);
  return next;
}

export function advanceDays(state, days, systems = SYSTEMS) {
  if (!Number.isInteger(days) || days < 0) throw new RangeError('advanceDays: days deve essere un intero >= 0');
  let s = state;
  for (let i = 0; i < days; i += 1) s = advanceDay(s, systems);
  return s;
}
