// Porti in partita (campo facoltativo state.ports: assente = tutti i porti al livello del 1936 di data/ports/ports_1936.json).
// state.ports = { levels: { [cittaId]: livello 1-3 } } contiene solo i porti COSTRUITI o MIGLIORATI; i lavori in corso stanno nella coda delle costruzioni (kind 'port'). Funzioni PURE.

export function validatePortsShape(ports) {
  if (ports === undefined) return [];
  if (ports === null || typeof ports !== 'object' || ports.levels === null || typeof ports.levels !== 'object' || Array.isArray(ports.levels)) return ['stato: ports non valida'];
  const errors = [];
  for (const [id, v] of Object.entries(ports.levels)) if (!Number.isInteger(v) || v < 1 || v > 3) errors.push(`stato: ports, livello ${v} non valido per ${id}`);
  return errors;
}

/** Livello del porto della città (0 = nessun porto): stato di partita, altrimenti elenco del 1936. */
export const portLevelIn = (state, base, cittaId) => state?.ports?.levels?.[cittaId] ?? base?.ports?.[cittaId]?.level ?? 0;
