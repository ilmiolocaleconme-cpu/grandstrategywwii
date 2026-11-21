// Esperienza delle fabbriche (21/11/2026, logica di produzione; dati in data/industry/production_experience.json). Funzioni PURE.
// Ogni impianto conta i giorni in cui ha prodotto la stessa ricetta (`expDays`); il fattore moltiplica la produzione a parità di materie consumate.
// Una riconversione riparte da zero, o dalla metà dei giorni se il nuovo modello è della stessa catena: cambiare modello diventa una scelta strategica.
export const EXPERIENCE_SCHEMA = 'production-experience-v1';

export function validateExperience(doc) {
  const e = [];
  if (doc?.schema !== EXPERIENCE_SCHEMA) return [`esperienza: schema ${JSON.stringify(doc?.schema)}`];
  const c = doc.curve;
  if (!Array.isArray(c) || c.length < 2 || !c.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0))) e.push('esperienza: curve non valida');
  else for (let i = 1; i < c.length; i += 1) if (!(c[i][0] > c[i - 1][0]) || c[i][1] < c[i - 1][1]) e.push(`esperienza: curve non crescente al punto ${i}`);
  if (!(doc.materialsMax >= 1)) e.push('esperienza: materialsMax deve essere ≥ 1');
  if (!(doc.sameChainKeep >= 0 && doc.sameChainKeep <= 1)) e.push('esperienza: sameChainKeep fra 0 e 1');
  if (!(Number.isInteger(doc.initialDays) && doc.initialDays >= 0)) e.push('esperienza: initialDays intero ≥ 0');
  return e;
}

/** Fattore di produzione dopo `days` giorni sulla stessa ricetta; equipment = false per acciaio, carburante e gli altri materiali (tetto materialsMax). */
export function experienceFactor(days, cfg, { equipment = true } = {}) {
  const c = cfg.curve;
  let v = c[c.length - 1][1];
  if (days <= c[0][0]) v = c[0][1];
  else for (let i = 1; i < c.length; i += 1) {
    if (days <= c[i][0]) { const [d0, v0] = c[i - 1]; const [d1, v1] = c[i]; v = v0 + (v1 - v0) * (days - d0) / (d1 - d0); break; }
  }
  return Math.round(Math.min(v, equipment ? Infinity : cfg.materialsMax) * 1000) / 1000;
}

/** Giorni d'esperienza di un impianto (assenti = initialDays). */
export const expDaysOf = (f, cfg) => f.expDays ?? cfg.initialDays;

/** Giorni dopo una riconversione: 0, oppure la metà (sameChainKeep) se il nuovo prodotto è della stessa catena del vecchio. */
export function retooledDays(f, cfg, related) {
  return related ? Math.floor(expDaysOf(f, cfg) * cfg.sameChainKeep) : 0;
}
