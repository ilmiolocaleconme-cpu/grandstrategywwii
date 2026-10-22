// Catalogo degli edifici (data/buildings.json): quali occupano uno slot di costruzione (pool 'slot') e quali stanno negli slot
// ausiliari a parte (pool 'support'). Funzioni PURE senza I/O.
export const BUILDINGS_SCHEMA = 'buildings-v1';
export const POOLS = Object.freeze(['slot', 'support']);

export function validateBuildings(file) {
  const errors = [];
  if (file?.schema !== BUILDINGS_SCHEMA) return [`edifici: schema ${file?.schema}, atteso ${BUILDINGS_SCHEMA}`];
  const ids = new Set();
  for (const b of file.buildings ?? []) {
    if (typeof b.id !== 'string' || !b.id) errors.push('edifici: id mancante');
    if (ids.has(b.id)) errors.push(`edifici: id duplicato ${b.id}`);
    ids.add(b.id);
    if (!b.name) errors.push(`edifici: ${b.id} senza nome`);
    if (!POOLS.includes(b.pool)) errors.push(`edifici: ${b.id} con pool sconosciuto "${b.pool}"`);
    if (!Number.isInteger(b.slots) || b.slots < 1) errors.push(`edifici: ${b.id} con slots non valido`);
  }
  if (!(file.buildings ?? []).some((b) => b.pool === 'slot')) errors.push('edifici: nessun edificio nel pool slot');
  return errors;
}

/** Mappa id → edificio. */
export function buildingIndex(file) {
  return new Map(file.buildings.map((b) => [b.id, b]));
}
