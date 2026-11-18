// Registro delle unità create in partita (decisioni 4a–4c dell'utente, 05/11/2026).
// - id: prefisso `X` + contatore a 5 cifre, nello stato; il contatore non si riusa mai. Il catalogo usa `U#####`: nessuna collisione.
// - ricerca: `unitOf` cerca prima nel catalogo statico (sola lettura) e poi nel registro. Il catalogo non viene mai modificato.
// - stato: campo `unitRegistry` (schema 8). Funzioni PURE.
export const REGISTRY_SCHEMA = 'unit-registry-v1';
export const REGISTRY_PREFIX = 'X';

export function createUnitRegistry() {
  return { schema: REGISTRY_SCHEMA, next: 1, units: {}, forming: [] };
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
  const u = catalog?.get(id) ?? state?.unitRegistry?.units?.[id] ?? null;
  const ch = state?.unitChanges?.byUnit?.[id]; // riorganizzazioni da eventi (18/11/2026): il catalogo non si modifica, si sovrappone il cambio
  return u && ch ? { ...u, ...ch.patch } : u;
}

// Cambi di un'unità decisi in partita (eventi, 18/11/2026): `state.unitChanges` = { schema, byUnit: { id: { patch: { category }, since, event } } }.
export const UNIT_CHANGES_SCHEMA = 'unit-changes-v1';
export const CHANGEABLE_FIELDS = Object.freeze(['category']);
export function applyUnitChange(state, unitId, patch, { date, event }) {
  const cur = state.unitChanges ?? { schema: UNIT_CHANGES_SCHEMA, byUnit: {} };
  const prev = cur.byUnit[unitId]?.patch ?? {};
  return { ...state, unitChanges: { ...cur, byUnit: { ...cur.byUnit, [unitId]: { patch: { ...prev, ...patch }, since: date, event } } } };
}
export function validateUnitChanges(c) {
  if (c === undefined) return [];
  if (c === null || typeof c !== 'object' || c.schema !== UNIT_CHANGES_SCHEMA || c.byUnit === null || typeof c.byUnit !== 'object') return ['cambi delle unità: forma non valida'];
  const e = [];
  for (const [id, ch] of Object.entries(c.byUnit)) {
    for (const k of Object.keys(ch?.patch ?? {})) if (!CHANGEABLE_FIELDS.includes(k)) e.push(`cambi delle unità: ${id}.${k} non modificabile`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ch?.since ?? '')) e.push(`cambi delle unità: ${id} senza data`);
  }
  return e;
}

/** Vista unificata (Map): catalogo + registro. Ricostruita solo se cambia il registro. */
const viewCache = new WeakMap();
export function unitsView(state, catalog) {
  const reg = state?.unitRegistry?.units;
  const ch = state?.unitChanges?.byUnit;
  const hasReg = reg && Object.keys(reg).length > 0; const hasCh = ch && Object.keys(ch).length > 0;
  if (!hasReg && !hasCh) return catalog;
  let entry = viewCache.get(catalog);
  if (!entry || entry.reg !== reg || entry.ch !== ch) {
    const m = new Map(catalog);
    for (const [id, u] of Object.entries(reg ?? {})) m.set(id, u);
    for (const [id, c] of Object.entries(ch ?? {})) if (m.has(id)) m.set(id, { ...m.get(id), ...c.patch }); // riorganizzazioni da eventi
    entry = { reg, ch, map: m };
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
  if (r.forming !== undefined && !Array.isArray(r.forming)) errors.push('registro unità: forming non è un elenco');
  return errors;
}

/** Lista delle unità (come l'array del catalogo) più quelle del registro. Ricostruita solo se cambia il registro. */
const listCache = new WeakMap();
export function unitsList(state, catalogArray) {
  const reg = state?.unitRegistry?.units;
  const ch = state?.unitChanges?.byUnit;
  const hasCh = ch && Object.keys(ch).length > 0;
  if ((!reg || Object.keys(reg).length === 0) && !hasCh) return catalogArray;
  let entry = listCache.get(catalogArray);
  if (!entry || entry.reg !== reg || entry.ch !== ch) {
    const base = [...catalogArray, ...Object.values(reg ?? {})];
    entry = { reg, ch, list: hasCh ? base.map((u) => (ch[u.id] ? { ...u, ...ch[u.id].patch } : u)) : base }; // con le riorganizzazioni da eventi
    listCache.set(catalogArray, entry);
  }
  return entry.list;
}
