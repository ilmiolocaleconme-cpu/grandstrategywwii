// Industria iniziale 1/1/1936 (data/industry/initial_industry.json): quali impianti ha ogni nazione all'inizio. Solo dati e funzioni PURE.
// Qualità DESIGN_DEFAULT: stime di progetto, non dati storici per impianto. Le nazioni della fascia C (tierC) partono senza industria.
export const INITIAL_INDUSTRY_SCHEMA = 'initial-industry-v1';

/** Errori (lista vuota = valido). ctx: { factoriesById: Map, recipes: file ricette, entityIds: Set, nationIds: string[] } */
export function validateInitialIndustry(file, { factoriesById, recipes, entityIds, nationIds }) {
  const errors = [];
  if (file?.schema !== INITIAL_INDUSTRY_SCHEMA) return [`industria iniziale: schema ${file?.schema}, atteso ${INITIAL_INDUSTRY_SCHEMA}`];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('industria iniziale: qualità attesa DESIGN_DEFAULT');
  const recipeById = new Map((recipes?.recipes ?? []).map((r) => [r.id, r]));
  for (const [id, n] of Object.entries(file.nations ?? {})) {
    if (!entityIds.has(id)) errors.push(`industria iniziale: ${id} non è un'entità politica`);
    if (!entityIds.has(n.owner)) errors.push(`industria iniziale: ${id} con proprietario inesistente (${n.owner})`);
    if (n.tier !== 'A' && n.tier !== 'B') errors.push(`industria iniziale: ${id} con fascia ${n.tier} (solo A o B hanno impianti)`);
    if (!Array.isArray(n.facilities) || n.facilities.length === 0) errors.push(`industria iniziale: ${id} senza impianti`);
    const seen = new Set();
    for (const f of n.facilities ?? []) {
      const key = `${f.factory}/${f.recipeId}`;
      if (seen.has(key)) errors.push(`industria iniziale: ${id} con ${key} duplicato`);
      seen.add(key);
      if (!factoriesById.has(f.factory)) errors.push(`industria iniziale: ${id} usa la fabbrica inesistente ${f.factory}`);
      const r = recipeById.get(f.recipeId);
      if (!r) errors.push(`industria iniziale: ${id} usa la ricetta inesistente ${f.recipeId}`);
      else if (r.factory !== f.factory) errors.push(`industria iniziale: ${id}, la ricetta ${f.recipeId} non è di ${f.factory}`);
      if (!Number.isInteger(f.count) || f.count < 1) errors.push(`industria iniziale: ${id}, numero di impianti non valido per ${key}`);
    }
  }
  const nationSet = new Set(nationIds);
  for (const id of file.tierC ?? []) {
    if (!nationSet.has(id)) errors.push(`industria iniziale: ${id} in fascia C non è una nazione`);
    if (file.nations?.[id]) errors.push(`industria iniziale: ${id} è in fascia C ma ha impianti`);
  }
  for (const id of nationIds) if (!file.nations?.[id] && !(file.tierC ?? []).includes(id)) errors.push(`industria iniziale: la nazione ${id} non è in nessuna fascia`);
  return errors;
}

/** Totale impianti per fabbrica di una nazione: { 'FCT-STEEL': 12, … }. */
export function facilityCounts(file, nationId) {
  const out = {};
  for (const f of file.nations?.[nationId]?.facilities ?? []) out[f.factory] = (out[f.factory] ?? 0) + f.count;
  return out;
}
