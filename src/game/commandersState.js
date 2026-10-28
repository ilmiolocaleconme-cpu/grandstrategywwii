// Comandanti nello stato della partita (schema 4, 29/10/2026): assegnazioni di corpi e armate, scelte del giocatore incluse.
// La logica è in src/rules/commanders.js; qui: forma dello stato, migrazione 3→4, sistema giornaliero e scelta del giocatore sullo stato di gioco.
import { COMMANDER_SCHEMA, createCommanderState, autoAssign, assignCommander, releaseCommander } from '../rules/commanders.js';

/** Errori di forma (non conosce i cataloghi: per quelli validateCommanderState di rules/commanders.js). */
export function validateCommandersShape(c) {
  const errors = [];
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return ['comandanti: non è un oggetto'];
  if (c.schema !== COMMANDER_SCHEMA) errors.push(`comandanti: schema ${JSON.stringify(c.schema)} (atteso ${COMMANDER_SCHEMA})`);
  const a = c.assignments;
  if (a === null || typeof a !== 'object' || Array.isArray(a)) return [...errors, 'comandanti: assignments non è un oggetto'];
  const used = new Map();
  for (const [cid, v] of Object.entries(a)) {
    if (v === null || typeof v !== 'object') { errors.push(`comandanti: ${cid} non valido`); continue; }
    if (typeof v.officerId !== 'string' || v.officerId === '') errors.push(`comandanti: ${cid} senza officerId`);
    if (!['auto', 'player'].includes(v.source)) errors.push(`comandanti: ${cid} con origine ${JSON.stringify(v.source)}`);
    if (typeof v.since !== 'string') errors.push(`comandanti: ${cid} senza data`);
    if (used.has(v.officerId)) errors.push(`comandanti: ${v.officerId} comanda sia ${used.get(v.officerId)} sia ${cid}`);
    used.set(v.officerId, cid);
  }
  return errors;
}

/** Migrazione schema 3 → 4: nessun comandante assegnato (nello schema 3 non esistevano). */
export function migrateV3toV4(state) {
  return { ...state, schema: 4, commanders: createCommanderState() };
}

/** Sistema giornaliero per engine.js: schiera in automatico i comandi liberi. Va costruito con i cataloghi già caricati. */
export function commandersSystem({ units, officers, fallback = 'dated' }) {
  return (state) => {
    const { state: commanders } = autoAssign(state.commanders, { units, officers, date: state.date, fallback });
    return commanders === state.commanders || JSON.stringify(commanders) === JSON.stringify(state.commanders) ? state : { ...state, commanders };
  };
}

/** Il giocatore sceglie il comandante di un corpo o di un'armata della PROPRIA nazione. Lancia un Error sui blocchi; ritorna { state, events, warnings }. */
export function playerAssignCommander(state, { commandId, officerId, units, officers }) {
  const command = units.find((u) => u.id === commandId);
  if (command && command.nation !== state.player) throw new Error(`il comando ${command.name} è ${command.nation}, il giocatore è ${state.player}`);
  const r = assignCommander(state.commanders, { commandId, officerId, units, officers, date: state.date });
  return { state: { ...state, commanders: r.state }, events: r.events, warnings: r.warnings };
}

export function playerReleaseCommander(state, commandId, { units }) {
  const command = units.find((u) => u.id === commandId);
  if (command && command.nation !== state.player) throw new Error(`il comando ${command.name} è ${command.nation}, il giocatore è ${state.player}`);
  const r = releaseCommander(state.commanders, commandId);
  return { state: { ...state, commanders: r.state }, events: r.events };
}
