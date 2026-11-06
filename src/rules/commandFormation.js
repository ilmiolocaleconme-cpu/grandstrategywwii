// Formazione dei comandi creati dal giocatore (decisioni 06/11/2026): costo in uomini dal pool e tempo (corpo 20 giorni, armata 45).
// Il template è in data/units/command_templates.json (ipotesi di bilanciamento approvate). Funzioni PURE.
// Le formazioni in corso stanno in `unitRegistry.forming` (campo opzionale: assente = nessuna). Gli uomini impegnati sono riservati
// e non sono disponibili né per i rinforzi né per altre formazioni.
import { addDays } from '../game/calendar.js';
import { registerUnit } from './unitRegistry.js';
import { attach } from './orbat.js';
import { createMovementState } from '../rules/movement.js';

export const COMMAND_TEMPLATE_SCHEMA = 'command-template-v1';
export const COMMAND_LEVELS = ['corps', 'army'];

/** Errori del template dei comandi (lista vuota = valido). */
export function validateCommandTemplates(t) {
  if (t?.schema !== COMMAND_TEMPLATE_SCHEMA) return [`comandi: schema ${JSON.stringify(t?.schema)}`];
  const errors = [];
  for (const lv of COMMAND_LEVELS) {
    const d = t.levels?.[lv];
    if (!d) { errors.push(`comandi: livello ${lv} mancante`); continue; }
    for (const f of ['staff', 'formationManpower', 'formationDays']) if (!Number.isInteger(d[f]) || d[f] <= 0) errors.push(`comandi: ${lv}.${f} non valido`);
  }
  return errors;
}

/** Uomini impegnati in formazioni di una nazione. */
export function reservedManpower(state, nation) {
  return (state?.unitRegistry?.forming ?? []).filter((f) => f.nation === nation).reduce((s, f) => s + f.manpower, 0);
}

/** Uomini disponibili per una nazione: il pool meno quelli impegnati nelle formazioni in corso (mai sotto zero). */
export function availableManpower(state, nation, poolBase) {
  return Math.max(0, poolBase - reservedManpower(state, nation));
}

/** Avvia la formazione di un comando. Ritorna { ok, state } o { ok: false, reason }. */
export function startFormation(state, { nation, level, parentId = null, date, template, pool, catalog, province = null }) {
  if (!COMMAND_LEVELS.includes(level)) return { ok: false, reason: 'livello' };
  const d = template.levels[level];
  const available = availableManpower(state, nation, pool);
  if (available < d.formationManpower) return { ok: false, reason: 'uomini', need: d.formationManpower, have: available };
  if (parentId !== null) {
    const parent = catalog.get(parentId) ?? state.unitRegistry?.units?.[parentId];
    const okParent = parent && parent.nation === nation && (level === 'corps' ? parent.commandLevel === 'army' : false);
    if (!okParent) return { ok: false, reason: 'superiore' };
  }
  const reg = state.unitRegistry;
  const maxSeen = Math.max(0, ...(reg.forming ?? []).map((f) => Number(f.id.slice(1)) || 0));
  const entry = { id: `F${maxSeen + 1}`, nation, level, manpower: d.formationManpower, start: date, end: addDays(date, d.formationDays), parentId, province };
  return { ok: true, state: { ...state, unitRegistry: { ...reg, forming: [...(reg.forming ?? []), entry] } }, formation: entry };
}

/** Nome del comando nuovo: livello + nazione + progressivo fra i comandi già creati dal giocatore di quel livello e nazione. */
export function commandName(level, nation, n) {
  return `${level === 'army' ? 'Armata' : "Corpo d'armata"} ${nation} ${n}`;
}

/** Completa le formazioni arrivate alla data: registra il comando e lo inquadra nell'ORBAT. Ritorna il nuovo stato. */
export function completeFormations(state, { date, units, catalog }) {
  const reg = state.unitRegistry;
  const forming = reg?.forming ?? [];
  const due = forming.filter((f) => f.end <= date);
  if (due.length === 0) return state;
  let registry = { ...reg, forming: forming.filter((f) => f.end > date) };
  let orbat = state.orbat;
  let movement = state.movement;
  for (const f of due) {
    const seq = Object.values(registry.units).filter((u) => u.nation === f.nation && u.commandLevel === f.level && u.origin === 'player').length + 1;
    const r = registerUnit(registry, { name: commandName(f.level, f.nation, seq), nation: f.nation, echelon: 'command', category: 'command', commandLevel: f.level, variant: null, startYear: Number(f.end.slice(0, 4)), endYear: null, origin: 'player', formedOn: f.end });
    registry = r.registry;
    // il comando nasce nella provincia della divisione che ha avviato la formazione: così è sulla mappa e può muoversi
    if (f.province) movement = { ...(movement ?? createMovementState()), positions: { ...(movement?.positions ?? {}), [r.id]: f.province } };
    if (f.parentId) {
      const view = [...catalog.values(), ...Object.values(registry.units)];
      const res = attach(orbat, { childId: r.id, parentId: f.parentId, units: view, date: f.end, source: 'player' });
      orbat = res.state;
    }
  }
  return { ...state, unitRegistry: registry, orbat, movement };
}
