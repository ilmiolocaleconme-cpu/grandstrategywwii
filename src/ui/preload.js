// Precaricamento all'apertura: la schermata d'apertura conta anche i dati di tutte le mappe (fiumi, mari, città, nomi, terreno, risorse,
// collegamenti), non solo le province. Funzioni PURE (testate); l'interfaccia le usa in App.jsx.

/** Avanzamento unico per la barra: file di province + dati delle mappe. `items`: [{ label, done }]. total 0 = ancora ignoto. */
export function preloadProgress(provinces, items) {
  const total = provinces.total > 0 ? provinces.total + items.length : 0;
  return { done: provinces.done + items.filter((x) => x.done).length, total };
}

/** Si può aprire quando le province sono pronte e i dati ci sono tutti, oppure dopo il tempo massimo (un file che non arriva non blocca l'apertura). */
export function preloadComplete({ provincesReady, items, gaveUp }) {
  return provincesReady && (gaveUp || items.every((x) => x.done));
}

/** Il cambio livello può evitare la copertura con la bandiera solo se i dati del livello di arrivo sono già in memoria. */
export function layerNeedsCover(next, { terrain, resources }) {
  if (next === 'terrain') return terrain === null || terrain === undefined;
  if (next === 'resources') return resources === null || resources === undefined;
  return false;
}

export const PRELOAD_GIVE_UP_MS = 30000;
