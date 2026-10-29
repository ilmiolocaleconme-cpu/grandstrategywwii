// Inquadramento nello stato della partita (schema 5, 29/10/2026): chi dipende da chi. La logica è in src/rules/orbat.js;
// qui: forma dello stato, migrazione 4→5 e azioni del giocatore sulle PROPRIE unità.
import { ORBAT_SCHEMA, createOrbatState, attach, detach } from '../rules/orbat.js';

/** Errori di forma (non conosce il catalogo: per quello validateOrbatState di rules/orbat.js). */
export function validateOrbatShape(o) {
  const errors = [];
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return ['orbat: non è un oggetto'];
  if (o.schema !== ORBAT_SCHEMA) errors.push(`orbat: schema ${JSON.stringify(o.schema)} (atteso ${ORBAT_SCHEMA})`);
  const l = o.links;
  if (l === null || typeof l !== 'object' || Array.isArray(l)) return [...errors, 'orbat: links non è un oggetto'];
  for (const [child, v] of Object.entries(l)) {
    if (v === null || typeof v !== 'object') { errors.push(`orbat: ${child} non valido`); continue; }
    if (typeof v.parent !== 'string' || v.parent === '') errors.push(`orbat: ${child} senza padre`);
    if (v.parent === child) errors.push(`orbat: ${child} dipende da sé stessa`);
    if (!['player', 'data'].includes(v.source)) errors.push(`orbat: ${child} con origine ${JSON.stringify(v.source)}`);
    if (typeof v.since !== 'string') errors.push(`orbat: ${child} senza data`);
  }
  return errors;
}

/** Migrazione schema 4 → 5: nessun inquadramento (nello schema 4 non esisteva). */
export function migrateV4toV5(state) {
  return { ...state, schema: 5, orbat: createOrbatState() };
}

const mustBeOwn = (state, unit) => {
  if (unit && unit.nation !== state.player) throw new Error(`${unit.name} è ${unit.nation}, il giocatore è ${state.player}`);
};

/** Il giocatore inquadra o sposta un'unità della PROPRIA nazione sotto un comando della propria nazione. Lancia un Error sui blocchi. */
export function playerAttach(state, { unitId, parentId, units }) {
  mustBeOwn(state, units.find((u) => u.id === unitId));
  const r = attach(state.orbat, { childId: unitId, parentId, units, date: state.date, source: 'player' });
  return { state: r.state === state.orbat ? state : { ...state, orbat: r.state }, events: r.events };
}

export function playerDetach(state, unitId, { units }) {
  mustBeOwn(state, units.find((u) => u.id === unitId));
  const r = detach(state.orbat, unitId, { date: state.date });
  return { state: r.state === state.orbat ? state : { ...state, orbat: r.state }, events: r.events };
}
