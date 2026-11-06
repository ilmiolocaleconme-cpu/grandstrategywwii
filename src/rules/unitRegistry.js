// Registro delle unità create in partita (decisioni 4a–4c dell'utente, 05/11/2026).
// - id: prefisso `X` + contatore a 5 cifre, nello stato; il contatore non si riusa mai. Il catalogo usa `U#####`: nessuna collisione.
// - ricerca: `unitOf` cerca prima nel catalogo statico (sola lettura) e poi nel registro. Il catalogo non viene mai modificato.
// - stato: campo `unitRegistry` (schema 8). Funzioni PURE.
export const REGISTRY_SCHEMA = 'unit-registry-v1';
export const REGISTRY_PREFIX = 'X';

export function createUnitRegistry() {
  return { schema: REGISTRY_SCHEMA, next: 1, units: {} };
}

/** Id nuovo per il contatore dato. */
export const registryId = (n) => `${REGISTRY_PREFIX}${String(n).padStart(5, '0')}`;

/** Aggiunge un'unità al registro. Ritorna { id, registry } senza modificare il registro ricevuto. */
export function registerUnit(registry, unit) {
  const id = registryId(registry.next);
  return { id, registry: { ...registry, next: registry.next + 1, units: { ...registry.units, [id]: { ...unit, id } } } };
}

/** Unità per id: dal catalogo statico (Map) oppure dal registro della partita. null se non esiste. */
export function unitOf(state, id, catalog) {
  if (id === undefined || id === null) return null;
  return catalog?.get(id) ?? state?.unitRegistry?.units?.[id] ?? null;
}

/** Vista unificata (Map): catalogo + registro. Ricostruita solo se cambia il registro. */
const viewCache = new WeakMap();
export function unitsView(state, catalog) {
  const reg = state?.unitRegistry?.units;
  if (!reg || Object.keys(reg).length === 0) return catalog;
  let entry = viewCache.get(catalog);
  if (!entry || entry.reg !== reg) {
    const m = new Map(catalog);
    for (const [id, u] of Object.entries(reg)) m.set(id, u);
    entry = { reg, map: m };
    viewCache.set(catalog, entry);
  }
  return entry.map;
}

/** Errori di forma del registro (lista vuota = valido). Assente = nessun errore (schema 7 migrato). */
export function validateUnitRegistry(r) {
  if (r === undefined) return [];
  if (r === null || typeof r !== 'object' || Array.isArray(r)) return ['registro unità: non è un oggetto'];
  const errors = [];
  if (r.schema !== REGISTRY_SCHEMA) errors.push(`registro unità: schema ${JSON.stringify(r.schema)}`);
  if (!Number.isInteger(r.next) || r.next < 1) errors.push('registro unità: contatore non valido');
  if (r.units === null || typeof r.units !== 'object') return [...errors, 'registro unità: units mancante'];
  const max = Math.max(0, ...Object.keys(r.units).map((id) => Number(id.slice(1)) || 0));
  for (const [id, u] of Object.entries(r.units)) {
    if (!new RegExp(`^${REGISTRY_PREFIX}\\d{5}$`).test(id)) errors.push(`registro unità: id ${id} non valido`);
    if (u?.id !== id) errors.push(`registro unità: ${id} con id interno diverso`);
  }
  if (r.next <= max) errors.push('registro unità: il contatore non supera gli id già usati');
  return errors;
}
