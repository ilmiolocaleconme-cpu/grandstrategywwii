// Leggi di mobilitazione (04/11/2026): quando la condizione di una legge è vera, i quadri della nazione vengono mobilitati con `mobilize` (src/rules/reinforcements.js):
// da quel momento i rinforzi li portano al previsto SE ci sono le risorse. Non crea uomini né mezzi. Dati: data/units/mobilization_laws.json.
// Stato (campo OPZIONALE, nessuna migrazione): state.mobilization = { schema: 'mobilization-v1', started: { idLegge: { on: 'AAAA-MM-GG' } } } (prima data in cui la legge è scattata).
// La condizione `war` guarda state.war (atWar), quindi funziona con qualunque origine della guerra (giocatore, eventi, IA futura).
// Ogni giorno, finché la condizione resta vera, mobilita anche i quadri comparsi dopo (idempotente: nessun cambiamento = stesso oggetto di stato).
import { atWar } from '../rules/war.js';
import { mobilize } from '../rules/reinforcements.js';

export const MOBILIZATION_SCHEMA = 'mobilization-v1';
export const LAWS_SCHEMA = 'mobilization-laws-v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Errori della tabella delle leggi (vuoto = valida). nationIds = id delle nazioni esistenti. */
export function validateMobilizationLaws(doc, { nationIds } = {}) {
  const errors = [];
  if (doc?.schema !== LAWS_SCHEMA) errors.push(`mobilitazione: schema ${JSON.stringify(doc?.schema)}`);
  if (!Array.isArray(doc?.laws)) return [...errors, 'mobilitazione: laws non è un array'];
  const seen = new Set();
  const known = nationIds ? new Set(nationIds) : null;
  for (const l of doc.laws) {
    const p = `mobilitazione ${l?.id}`;
    if (typeof l?.id !== 'string' || l.id === '') { errors.push('mobilitazione: legge senza id'); continue; }
    if (seen.has(l.id)) errors.push(`${p}: id duplicato`);
    seen.add(l.id);
    if (known && !known.has(l.nation)) errors.push(`${p}: nazione ${JSON.stringify(l.nation)} inesistente`);
    if (l.effect !== 'mobilize_cadres') errors.push(`${p}: effetto ${JSON.stringify(l.effect)} non supportato`);
    const t = l.trigger;
    if (t?.type !== 'war') errors.push(`${p}: condizione ${JSON.stringify(t?.type)} non supportata`);
    else {
      if (typeof t.a !== 'string' || typeof t.b !== 'string' || t.a === t.b) errors.push(`${p}: la guerra richiede due nazioni diverse`);
      if (known) for (const n of [t.a, t.b]) if (!known.has(n)) errors.push(`${p}: nazione ${JSON.stringify(n)} della condizione inesistente`);
    }
    if (!['utente', 'ipotesi'].includes(l.basis)) errors.push(`${p}: basis ${JSON.stringify(l.basis)}`);
    if (!String(l.source ?? '').trim()) errors.push(`${p}: senza fonte`);
  }
  return errors;
}

/** Errori di forma dello stato (opzionale). */
export function validateMobilizationShape(m) {
  if (m === undefined) return [];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return ['mobilitazione: non è un oggetto'];
  const errors = [];
  if (m.schema !== MOBILIZATION_SCHEMA) errors.push(`mobilitazione: schema ${JSON.stringify(m.schema)}`);
  if (m.started === null || typeof m.started !== 'object' || Array.isArray(m.started)) return [...errors, 'mobilitazione: started non è un oggetto'];
  for (const [id, v] of Object.entries(m.started)) if (!DATE_RE.test(v?.on ?? '')) errors.push(`mobilitazione: ${id} senza data valida`);
  return errors;
}

const conditionHolds = (state, t) => t.type === 'war' && atWar(state.war, t.a, t.b);

/** Sistema giornaliero. ctx: { units (unitsFile.units), laws (documento mobilization_laws) }. Senza forze inizializzate non fa nulla. */
export function createMobilizationSystem({ units, laws }) {
  const nationOf = new Map(units.map((u) => [u.id, u.nation]));
  return function mobilizationDay(state) {
    if (!state.forces?.initialized) return state;
    let forces = state.forces;
    let started = state.mobilization?.started ?? {};
    let changed = false;
    for (const law of laws.laws) {
      if (!conditionHolds(state, law.trigger)) continue;
      for (const [id, d] of Object.entries(forces.divisions)) {
        if (d.cadre === true && nationOf.get(id) === law.nation) { forces = mobilize(forces, id); changed = true; }
      }
      if (!started[law.id]) { started = { ...started, [law.id]: { on: state.date } }; changed = true; }
    }
    if (!changed) return state;
    return { ...state, forces, mobilization: { schema: MOBILIZATION_SCHEMA, started } };
  };
}
