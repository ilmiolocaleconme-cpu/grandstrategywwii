// Dotazione d'armi di una divisione e suo effetto sulla potenza in battaglia (12/11/2026). Funzioni PURE.
// Configurazione: data/units/combat_equipment.json (valori DESIGN_DEFAULT). Vedi la nota del file per la regola.
export const COMBAT_EQUIPMENT_SCHEMA = 'combat-equipment-v1';

export function validateCombatEquipment(cfg, { categories = null } = {}) {
  if (cfg?.schema !== COMBAT_EQUIPMENT_SCHEMA) return [`dotazione in battaglia: schema ${JSON.stringify(cfg?.schema)}`];
  const errors = [];
  if (!(cfg.floor >= 0 && cfg.floor <= 1)) errors.push('dotazione in battaglia: floor fuori da 0..1');
  for (const [c, w] of Object.entries(cfg.weights ?? {})) {
    if (!(w > 0)) errors.push(`dotazione in battaglia: peso di ${c} non valido`);
    if (categories && !categories.has(c)) errors.push(`dotazione in battaglia: categoria ${c} inesistente nel catalogo`);
  }
  if (!Object.keys(cfg.weights ?? {}).length) errors.push('dotazione in battaglia: nessun peso');
  return errors;
}

/**
 * Categoria d'arma di una voce di divisione: catalog = catalogo unito { entries, aliases }.
 * `equipment.<chiave>` → alias (nazione, chiave) → equipment_id, oppure la chiave stessa se è già un equipment_id. Ritorna (nazione, voce) → categoria | null.
 */
export function buildCategoryOf(catalog) {
  const byId = new Map((catalog?.entries ?? []).map((e) => [e.equipment_id, e.category ?? null]));
  const alias = new Map((catalog?.aliases ?? []).map((a) => [`${a.nation}|${a.templateKey}`, a.equipment_id]));
  return (nation, path) => {
    if (!path.startsWith('equipment.')) return null;
    const key = path.slice('equipment.'.length);
    return byId.get(alias.get(`${nation}|${key}`) ?? key) ?? null;
  };
}

/** { fill (0..1 o null se nessuna voce riconosciuta), factor (moltiplicatore della potenza), byCategory: { cat: dotazione } }. */
export function equipmentFill(items, categoryOf, cfg) {
  const sums = {};
  for (const [k, v] of Object.entries(items ?? {})) {
    const c = categoryOf(k);
    if (!c || !(cfg.weights?.[c] > 0) || !(v?.planned > 0)) continue;
    const s = (sums[c] ??= { planned: 0, effective: 0 });
    s.planned += v.planned;
    s.effective += Math.max(0, v.effective ?? 0);
  }
  const cats = Object.keys(sums);
  if (!cats.length) return { fill: null, factor: 1, byCategory: {} };
  const byCategory = {};
  let num = 0;
  let den = 0;
  for (const c of cats) {
    const f = Math.min(1, sums[c].effective / sums[c].planned);
    byCategory[c] = Math.round(f * 1000) / 1000;
    num += cfg.weights[c] * f;
    den += cfg.weights[c];
  }
  const fill = num / den;
  return { fill: Math.round(fill * 1000) / 1000, factor: Math.round((cfg.floor + (1 - cfg.floor) * fill) * 1000) / 1000, byCategory };
}
