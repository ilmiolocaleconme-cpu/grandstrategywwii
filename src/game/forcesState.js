// Forze nello stato della partita (schema 6, 29/10/2026): istanze di divisione con dotazione previsto/effettivo.
// La logica è in src/rules/forces.js; qui: forma dello stato, migrazione 5→6, inizializzazione e pool di uomini della nazione.
import { FORCES_SCHEMA, createForcesState, initForces, enlistedManpower, templateFor } from '../rules/forces.js';
import { upgradeTarget, upgradeDivision } from '../rules/templateUpgrade.js';
import { manpowerPoolState } from '../rules/manpowerPool.js';
import { hospitalStaff } from '../rules/hospitals.js';
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
      if (!['template', 'ratio', 'upgrade'].includes(it?.source)) errors.push(`forze: ${id} ${k} con origine ${JSON.stringify(it?.source)}`);
    }
    // campo opzionale `upgrade` (aggiornamento di template, 03/11/2026): { from, on, surplus?, dropped? }
    if (v.upgrade !== undefined) {
      const u = v.upgrade;
      if (u === null || typeof u !== 'object' || typeof u.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(u.on ?? '')) errors.push(`forze: ${id} upgrade non valido`);
      else for (const f of ['surplus', 'dropped']) if (u[f] !== undefined && (u[f] === null || typeof u[f] !== 'object' || !Object.values(u[f]).every((q) => Number.isInteger(q) && q > 0))) errors.push(`forze: ${id} upgrade.${f} non valido`);
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
  // il personale degli ospedali (costruiti e in costruzione) è fuori dal pool: conta come arruolato
  return manpowerPoolState({ population, baseShare, modifiers, enlisted: enlistedManpower(state.forces, units, nation) + hospitalStaff(state.nations?.[nation]) });
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Attivazione delle forze nel tempo (03/11/2026): ogni giorno 1) crea le istanze delle divisioni che ora hanno un template valido e prima no (es. la fanteria francese dal 1/9/1939, l'italiana
 * dal 1/6/1940); 2) AGGIORNA le istanze esistenti quando per la loro unità vale un template più recente (es. la fanteria tedesca e francese già create nel 1936, dal 1/9/1939): vedi
 * src/rules/templateUpgrade.js (dotazione portata con la mappa, mai creata; eccedenza alla scorta nazionale). Quadri esclusi. Senza forze inizializzate non fa nulla.
 * ctx: { units, templates, ratio, upgradeMap? } (senza mappa: nessuna voce di equipaggiamento si porta, solo uomini e cavalli).
 */
export function createForcesActivationSystem(ctx) {
  const starts = ctx.templates.map((t) => t.appliesTo?.validFrom ?? t.appliesTo?.activeFrom ?? null).filter((d) => d !== null).sort();
  const unitsById = new Map(ctx.units.map((u) => [u.id, u]));
  return function forcesActivationDay(state) {
    if (!state.forces?.initialized || starts.length === 0 || state.date < starts[0]) return state;
    const r = initForces(state.forces, { ...ctx, date: state.date });
    let forces = r.created === 0 ? state.forces : r.state;
    let nations = state.nations;
    let divisions = forces.divisions;
    for (const id of Object.keys(divisions).sort()) {
      const unit = unitsById.get(id);
      const next = unit ? upgradeTarget(divisions[id], unit, ctx.templates, state.date, templateFor) : null;
      if (!next) continue;
      const up = upgradeDivision(divisions[id], next, { nation: unit.nation, map: ctx.upgradeMap, date: state.date });
      divisions = { ...divisions, [id]: up.division };
      if (nations?.[unit.nation]) {
        const stocks = { ...nations[unit.nation].stocks };
        for (const [path, qty] of Object.entries(up.surplus)) stocks[path] = r3((stocks[path] ?? 0) + qty);
        if (Object.keys(up.surplus).length) nations = { ...nations, [unit.nation]: { ...nations[unit.nation], stocks } };
      }
    }
    if (divisions !== forces.divisions) forces = { ...forces, divisions };
    return forces === state.forces && nations === state.nations ? state : { ...state, forces, nations };
  };
}
