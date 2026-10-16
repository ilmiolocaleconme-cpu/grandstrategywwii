import { loadProvincesFrom } from './provinces.js';

// Solo browser/Vite: import.meta.glob fissa a build time l'elenco dei file in data/provinces/.
// Ogni file è un modulo (chunk) a sé; tutti vengono richiesti subito e in parallelo, e il
// service worker li mette nel precache (vedi vite.config.js e scripts/check-precache.js),
// quindi anche offline partono insieme.
const modules = import.meta.glob('../../data/provinces/*.json');

let pending = null;

/**
 * Tutte le province unite in una collezione. L'unione si fa una volta sola per sessione (la
 * stessa collezione serve a mappa e App: buildMapModel la mette in cache per oggetto).
 * Se un file non si carica l'errore resta: i browser non ripetono un import() fallito, serve ricaricare la pagina.
 */
export function loadProvinces() {
  if (pending === null) pending = loadProvincesFrom(modules);
  return pending;
}
