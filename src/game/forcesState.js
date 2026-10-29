// Forze nello stato della partita (schema 6, 29/10/2026): istanze di divisione con dotazione previsto/effettivo.
// La logica è in src/rules/forces.js; qui: forma dello stato, migrazione 5→6, inizializzazione e pool di uomini della nazione.
import { FORCES_SCHEMA, createForcesState, initForces, enlistedManpower } from '../rules/forces.js';
import { manpowerPoolState } from '../rules/manpowerPool.js';
import { validateReinforcementFields } from '../rules/reinforcements.js';

/** Errori di forma (non conosce il catalogo: per quello validateForcesState di rules/forces.js). */
export function validateForcesShape(f) {
  const errors = [];
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return ['forze: non è un oggetto'];
  if (f.schema !== FORCES_SCHEMA) errors.push(`forze: schema ${JSON.stringify(f.schema)} (atteso ${FORCES_SCHEMA})`);
  if (typeof f.initialized !== 'boolean') errors.push('forze: initialized non è booleano');
  const d = f.divisions;
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return [...errors, 'forze: divisions non è un oggetto'];
  errors.push(...validateReinforcementFields(f));
  for (const [id, v] of Object.entries(d)) {
    if (v === null || typeof v !== 'object') { errors.push(`forze: ${id} non valido`); continue; }
    if (typeof v.templateId !== 'string' || v.templateId === '') errors.push(`forze: ${id} senza templateId`);
    if (typeof v.since !== 'string') errors.push(`forze: ${id} senza data`);
    if (v.items === null || typeof v.items !== 'object' || Array.isArray(v.items)) { errors.push(`forze: ${id} senza items`); continue; }
    for (const [k, it] of Object.entries(v.items)) {
      if (!Number.isInteger(it?.planned) || it.planned < 0) errors.push(`forze: ${id} ${k} previsto non valido`);
      else if (!Number.isInteger(it.effective) || it.effective < 0) errors.push(`forze: ${id} ${k} effettivo non valido`);
      else if (it.effective > it.planned) errors.push(`forze: ${id} ${k} effettivo ${it.effective} supera il previsto ${it.planned}`);
      if (!['template', 'ratio'].includes(it?.source)) errors.push(`forze: ${id} ${k} con origine ${JSON.stringify(it?.source)}`);
    }
  }
  return errors;
}

/** Migrazione schema 5 → 6: nessuna istanza (si crea con initForcesState). */
export function migrateV5toV6(state) {
  return { ...state, schema: 6, forces: createForcesState() };
}

/** Crea le istanze delle divisioni attive alla data dello stato (una sola volta). ctx: { units, templates, ratio }. Ritorna { state, created, withoutTemplate }. */
export function initForcesState(state, { units, templates, ratio }) {
  if (state.forces.initialized) return { state, created: 0, withoutTemplate: [] };
  const r = initForces(state.forces, { units, templates, ratio, date: state.date });
  return { state: { ...state, forces: r.state }, created: r.created, withoutTemplate: r.withoutTemplate };
}

/** Pool di uomini di una nazione dello stato. ctx: { units, population, baseShare, modifiers? }. */
export function nationManpowerPool(state, nation, { units, population, baseShare, modifiers = [] }) {
  return manpowerPoolState({ population, baseShare, modifiers, enlisted: enlistedManpower(state.forces, units, nation) });
}
