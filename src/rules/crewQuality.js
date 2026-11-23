// Qualità degli equipaggi per nazione e periodo (23/11/2026, scelta A dell'utente). Dati in data/units/crew_quality.json. Funzioni PURE.

/** Errori del file: periodi in ordine di data, valori entro ±maxAbs, quote per categoria tra 0 e 1, nazioni esistenti. */
export function validateCrewQuality(doc, nationIds) {
  const errors = [];
  const max = doc.maxAbs;
  if (!(max > 0 && max <= 0.5)) errors.push('qualità degli equipaggi: maxAbs non valido');
  if (!(doc.defaultShare >= 0 && doc.defaultShare <= 1)) errors.push('qualità degli equipaggi: defaultShare non valido');
  for (const [c, w] of Object.entries(doc.byCategory ?? {})) if (!(w >= 0 && w <= 1)) errors.push(`qualità degli equipaggi: quota ${c} non valida`);
  for (const [n, rows] of Object.entries(doc.nations ?? {})) {
    if (!nationIds.includes(n)) errors.push(`qualità degli equipaggi: ${n} non è una nazione`);
    if (!rows.length) errors.push(`qualità degli equipaggi: ${n} senza periodi`);
    rows.forEach((r, i) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.from ?? '')) errors.push(`qualità degli equipaggi: ${n} data non valida`);
      if (i > 0 && !(r.from > rows[i - 1].from)) errors.push(`qualità degli equipaggi: ${n} periodi non in ordine`);
      if (!(Math.abs(r.value) <= max)) errors.push(`qualità degli equipaggi: ${n} ${r.from} valore ${r.value} oltre ±${max}`);
    });
  }
  return errors;
}

/** Bonus della nazione alla data (0 prima del primo periodo o senza dati), per la categoria della divisione. */
export function crewQualityBonus(doc, nation, date, category) {
  const rows = doc?.nations?.[nation];
  if (!rows || !date) return 0;
  let v = 0;
  for (const r of rows) if (r.from <= date) v = r.value;
  const share = doc.byCategory?.[category] ?? doc.defaultShare ?? 1;
  return Math.round(v * share * 1e6) / 1e6;
}
