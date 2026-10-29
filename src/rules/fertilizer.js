// Effetto dei fertilizzanti sulla resa del frumento (data/agriculture/fertilizer_effect.json). Funzione PURA e deterministica.
// Regola (scelta dell'utente, 29/10/2026): il fertilizzante aumenta la resa. Ogni giorno una nazione ha un frumento di base (punti per scala) e una
// scorta di fertilizzante. Il fabbisogno a copertura piena è base × fertilizerPerWheatTon; la copertura è scorta / fabbisogno (al massimo 1);
// il frumento in più è base × yieldBonusMax × copertura; il fertilizzante consumato è fabbisogno × copertura.
// NON modellato: stagioni, suolo, altri fertilizzanti, differenze fra province (manca il modello agricolo: province_agriculture.json è vuoto).

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * baseWheat: t di frumento di base al giorno; fertilizer: t di fertilizzante in scorta; params: contenuto di fertilizer_effect.json.
 * Ritorna { need, coverage, used, extraWheat }: need (t/giorno a copertura piena), coverage (0..1), used (t consumate), extraWheat (t di frumento in più).
 * Lancia un RangeError con ingressi negativi o non numerici: nessuna quantità inventata.
 */
export function fertilizerEffect({ baseWheat, fertilizer }, params) {
  if (!Number.isFinite(baseWheat) || baseWheat < 0) throw new RangeError(`frumento di base non valido: ${baseWheat}`);
  if (!Number.isFinite(fertilizer) || fertilizer < 0) throw new RangeError(`fertilizzante non valido: ${fertilizer}`);
  const need = baseWheat * params.fertilizerPerWheatTon;
  const coverage = need > 0 ? Math.min(1, fertilizer / need) : 0;
  return { need: r3(need), coverage: r3(coverage), used: r3(need * coverage), extraWheat: r3(baseWheat * params.yieldBonusMax * coverage) };
}
