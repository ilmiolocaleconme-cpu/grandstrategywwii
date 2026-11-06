// Stato del registro unità: migrazione 7→8 (campo unitRegistry vuoto). Vedi src/rules/unitRegistry.js.
import { createUnitRegistry, validateUnitRegistry } from '../rules/unitRegistry.js';

/** Schema 7 → 8: il registro nasce vuoto; nessuna unità cambia. */
export function migrateV7toV8(state) {
  return { ...state, schema: 8, unitRegistry: createUnitRegistry() };
}

export const validateUnitRegistryShape = (state) => validateUnitRegistry(state.unitRegistry);
