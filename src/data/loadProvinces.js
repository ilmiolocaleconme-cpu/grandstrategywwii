import { loadProvincesFrom } from './provinces.js';

// Solo browser/Vite: import.meta.glob fissa a build time l'elenco dei file in data/provinces/.
// Ogni file è un modulo (chunk) a sé; vengono richiesti a gruppi (vedi LOAD_DEFAULTS in provinces.js) con
// nuovi tentativi per i file falliti, e il service worker li mette nel precache (vedi vite.config.js e
// scripts/check-precache.js), quindi anche offline si caricano senza rete.
const modules = import.meta.glob('../../data/provinces/*.json');

let pending = null;
let progress = { done: 0, total: 0 };
const listeners = new Set();

/**
 * Tutte le province unite in una collezione. L'unione si fa una volta sola per sessione (la
 * stessa collezione serve a mappa e App: buildMapModel la mette in cache per oggetto).
 * Se un file non si carica dopo i tentativi l'errore resta: alcuni browser non ripetono un import() fallito, allora serve ricaricare la pagina.
 */
export function loadProvinces(onProgress) {
  if (typeof onProgress === 'function') {
    listeners.add(onProgress);
    onProgress(progress.done, progress.total);
  }
  if (pending === null) {
    pending = loadProvincesFrom(modules, (done, total) => {
      progress = { done, total };
      for (const fn of listeners) fn(done, total);
    });
  }
  return pending;
}

/** Toglie un ascoltatore di avanzamento (quando il componente si smonta). */
export function unwatchProvinces(onProgress) {
  listeners.delete(onProgress);
}
