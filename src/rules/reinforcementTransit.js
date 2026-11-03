// Giorni di trasferimento dei rinforzi (decisione dell'utente, 03/11/2026): via terra = km del percorso / velocità di transito (stessa del commercio,
// TRANSIT_KM_PER_DAY); i giorni di traversata si aggiungono SOLO se il percorso attraversa il mare (giorni di findSeaRoute, che includono la sosta nei porti).
// Funzioni PURE: il percorso lo calcola il chiamante (rete di movimento e rotte marittime); qui non si inventa nessuna distanza.
import { TRANSIT_KM_PER_DAY } from './trade.js';

/** Giorni di mare dal risultato di findSeaRoute: errore esplicito se la rotta non esiste (mai 0 silenzioso). */
export function seaDaysOf(seaRoute) {
  if (!seaRoute?.ok || !Number.isInteger(seaRoute.days) || seaRoute.days < 0) throw new Error(`rotta marittima non disponibile: ${seaRoute?.reason ?? 'sconosciuto'}`);
  return seaRoute.days;
}

/** route: { landKm >= 0, seaDays?: intero >= 0 }. seaDays assente o 0 = il percorso non attraversa il mare. */
export function transitDaysFromRoute(route, kmPerDay = TRANSIT_KM_PER_DAY) {
  if (!(route?.landKm >= 0)) throw new RangeError(`km via terra non validi: ${route?.landKm}`);
  const sea = route.seaDays ?? 0;
  if (!Number.isInteger(sea) || sea < 0) throw new RangeError(`giorni di mare non validi: ${sea}`);
  return Math.ceil(route.landKm / kmPerDay) + sea;
}

/** Funzione transitDays(divisionId) per planReinforcements. routeOf(divisionId) → route (vedi sopra) e deve lanciare se il percorso non esiste. */
export const makeTransitDays = (routeOf) => (divisionId) => transitDaysFromRoute(routeOf(divisionId));
