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
  const byId = new Map((file.buildings ?? []).map((b) => [b.id, b]));
  for (const c of file.conversions ?? []) {
    const a = byId.get(c.a); const b = byId.get(c.b);
    if (!a || !b) errors.push(`edifici: conversione ${c.a}→${c.b} con edificio inesistente`);
    else if (a.pool !== b.pool) errors.push(`edifici: conversione ${c.a}→${c.b} fra pool diversi`);
    else if (c.a === c.b) errors.push(`edifici: conversione ${c.a}→${c.b} su se stesso`);
  }
  if (!(file.buildings ?? []).some((b) => b.pool === 'slot')) errors.push('edifici: nessun edificio nel pool slot');
  return errors;
}

/** Mappa id → edificio. */
export function buildingIndex(file) {
  return new Map(file.buildings.map((b) => [b.id, b]));
}

/** Conversioni consentite da `from`: [{ to, cost, days }] (costo e giorni null = non ancora definiti). */
export function conversionsFrom(file, from) {
  const out = [];
  for (const c of file.conversions ?? []) {
    if (c.a === from) out.push({ to: c.b, cost: c.cost ?? null, days: c.days ?? null });
    else if (c.bidirectional && c.b === from) out.push({ to: c.a, cost: c.cost ?? null, days: c.days ?? null });
  }
  return out;
}
