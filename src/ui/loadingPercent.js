/** Percentuale intera 0..100 di file caricati; 0 se il totale non è ancora noto. */
export function loadingPercent(done, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((100 * done) / total)));
}
