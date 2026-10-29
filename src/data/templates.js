// Template di unità: organico PREVISTO ("value") e dotazione EFFETTIVA ("effective") per ogni voce numerica (decisione dell'utente, 29/10/2026:
// per esempio cavalli previsti 5000, effettivi 4780; carri previsti 500, effettivi 437). Funzioni PURE.
// Forma di una voce: { value, basis, referenceYear, source, effective?: { value, asOf, basis, source } }.
// Regole: la base è 'utente' | 'ipotesi' | 'da_definire'; un valore non nullo ha una fonte; l'effettivo non supera il previsto, è un intero >= 0 e
// se non nullo ha una data (asOf) e una fonte; "utente" richiede un anno di riferimento.
export const BASES = ['utente', 'ipotesi', 'da_definire'];

export const isLeaf = (o) => o !== null && typeof o === 'object' && !Array.isArray(o) && 'basis' in o;

/** Percorsi e voci di tutte le foglie di un template (esclusi i campi di intestazione). */
export function leaves(template) {
  const out = [];
  const walk = (o, path) => {
    if (isLeaf(o)) { out.push([path, o]); return; }
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  for (const key of ['formation', 'mobility', 'structure', 'regimentsInfantry', 'battalionsPerRegiment', 'manpower', 'horses', 'equipment', 'organicSupport']) {
    if (key in template) walk(template[key], key);
  }
  return out;
}

export function validateTemplate(t) {
  const errors = [];
  if (t.schema !== 'unit-template-v1') errors.push(`schema ${JSON.stringify(t.schema)}`);
  if (!/^TPL-[A-Z]+-[A-Z]+-\d{4}$/.test(t.id ?? '')) errors.push(`id non valido: ${t.id}`);
  for (const [path, l] of leaves(t)) {
    if (!BASES.includes(l.basis)) errors.push(`${path}: basis ${JSON.stringify(l.basis)}`);
    if (l.value !== null && l.value !== undefined && !String(l.source ?? '').trim()) errors.push(`${path}: valore senza fonte`);
    if (l.basis === 'utente' && l.referenceYear == null && l.value !== null) errors.push(`${path}: basis utente senza anno di riferimento`);
    if (l.effective !== undefined) {
      const e = l.effective;
      if (typeof l.value !== 'number') errors.push(`${path}: effettivo su una voce non numerica`);
      else if (e.value !== null) {
        if (!Number.isInteger(e.value) || e.value < 0) errors.push(`${path}: effettivo non valido (${e.value})`);
        else if (e.value > l.value) errors.push(`${path}: effettivo ${e.value} supera il previsto ${l.value}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.asOf ?? '')) errors.push(`${path}: effettivo senza data`);
        if (!String(e.source ?? '').trim()) errors.push(`${path}: effettivo senza fonte`);
      }
    }
  }
  return errors;
}

/** Rapporto effettivo/previsto (0..1) di una voce, oppure null se manca uno dei due (non si inventa). */
export function fillRatio(leaf) {
  if (typeof leaf?.value !== 'number' || leaf.value === 0 || leaf.effective?.value == null) return null;
  return leaf.effective.value / leaf.value;
}
