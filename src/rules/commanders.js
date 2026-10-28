// Comandanti di corpo d'armata e di armata: schierati in AUTOMATICO, ma il giocatore può SEMPRE sceglierli (decisione del 28/10/2026).
// Funzioni PURE senza I/O: ricevono unità e ufficiali già caricati e restituiscono un nuovo stato.
//
// Regole:
// - Livelli gestiti: corpo (`corps`) e armata (`army`) del catalogo unità (campo commandLevel).
// - Automatico: assegna un ufficiale disponibile alla data, della stessa nazione, di terra, con quel livello tra i suoi (preferendo chi ha
//   la stessa formazione nel CSV; gli ufficiali SS solo su comandi SS); non tocca mai una scelta del giocatore; sostituisce un automatico non più disponibile.
// - Giocatore: può scegliere qualsiasi ufficiale di terra della propria nazione, anche fuori data o livello, con AVVISI (non blocchi).
//   Blocchi: comando o ufficiale inesistente, livello non gestito, nazione diversa, ufficiale non di terra.
// - Un ufficiale comanda una formazione sola: sceglierlo altrove lo toglie da quella precedente (evento "vacated").
import { isActiveAt } from '../data/units.js';
import { isOfficerAvailable } from '../data/officers.js';

export const COMMANDER_SCHEMA = 'commanders-v1';
export const MANAGED_LEVELS = ['corps', 'army'];

export function createCommanderState() {
  return { schema: COMMANDER_SCHEMA, assignments: {} };
}

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function indexById(list) { return new Map(list.map((x) => [x.id, x])); }

/** Comandi gestiti e attivi alla data (corpi e armate). */
export function managedCommands(units, isoDate) {
  return units.filter((u) => u.category === 'command' && MANAGED_LEVELS.includes(u.commandLevel) && isActiveAt(u, isoDate)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Ufficiali schierabili in automatico su un comando alla data (esclusi quelli indicati in `taken`). */
export function eligibleOfficers({ command, officers, date, taken = new Set() }) {
  const ssCommand = /SS/.test(command.name);
  return officers.filter((o) => o.nation === command.nation && o.branchType === 'land' && o.levels.includes(command.commandLevel)
    && /SS/.test(o.levelRaw) === ssCommand // gli ufficiali SS non comandano in automatico corpi dell'esercito (e viceversa)
    && isOfficerAvailable(o, date) && !taken.has(o.id));
}

function bestOfficer(command, candidates) {
  const key = norm(command.name);
  const score = (o) => (key.length > 2 && norm(o.exampleFormation).includes(key) ? 0 : 1);
  return [...candidates].sort((a, b) => score(a) - score(b) || a.levels.length - b.levels.length || (a.id < b.id ? -1 : 1))[0] ?? null;
}

/** Schiera in automatico i comandi senza comandante (e sostituisce gli automatici non più disponibili). Ritorna { state, events }. */
export function autoAssign(state, { units, officers, date }) {
  const assignments = { ...state.assignments }; const events = []; const byOfficer = indexById(officers);
  const managed = managedCommands(units, date);
  // un automatico non più valido (ufficiale non disponibile o comando non più attivo) torna libero
  for (const [cid, a] of Object.entries(assignments)) {
    if (a.source !== 'auto') continue;
    const stillActive = managed.some((c) => c.id === cid);
    const officer = byOfficer.get(a.officerId);
    if (!stillActive || !officer || !isOfficerAvailable(officer, date)) { delete assignments[cid]; events.push({ type: 'auto_release', commandId: cid, officerId: a.officerId, date }); }
  }
  const taken = new Set(Object.values(assignments).map((a) => a.officerId));
  const nameMatches = (command, o) => norm(command.name).length > 2 && norm(o.exampleFormation).includes(norm(command.name));
  const free = managed.filter((c) => !assignments[c.id]);
  // due passaggi: prima i comandi con un ufficiale della stessa formazione, poi gli altri (così l'ordine dei comandi non toglie l'ufficiale "giusto")
  for (const pass of [1, 2]) {
    for (const command of free) {
      if (assignments[command.id]) continue;
      const candidates = eligibleOfficers({ command, officers, date, taken });
      const pick = bestOfficer(command, pass === 1 ? candidates.filter((o) => nameMatches(command, o)) : candidates);
      if (!pick) continue;
      assignments[command.id] = { officerId: pick.id, source: 'auto', since: date };
      taken.add(pick.id);
      events.push({ type: 'auto_assign', commandId: command.id, officerId: pick.id, date });
    }
  }
  return { state: { ...state, assignments }, events };
}

/** Scelta del giocatore. Lancia un Error sui blocchi; ritorna { state, events, warnings } con gli avvisi non bloccanti. */
export function assignCommander(state, { commandId, officerId, units, officers, date }) {
  const command = indexById(units).get(commandId); const officer = indexById(officers).get(officerId);
  if (!command || command.category !== 'command') throw new Error(`comando inesistente: ${commandId}`);
  if (!officer) throw new Error(`ufficiale inesistente: ${officerId}`);
  if (!MANAGED_LEVELS.includes(command.commandLevel)) throw new Error(`livello ${command.commandLevel} non gestito (solo corpo d'armata e armata): ${command.name}`);
  if (officer.nation !== command.nation) throw new Error(`${officer.name} è ${officer.nation}, il comando è ${command.nation}`);
  if (officer.branchType !== 'land') throw new Error(`${officer.name} non è un ufficiale di terra`);
  const warnings = [];
  if (!isActiveAt(command, date)) warnings.push('comando non ancora attivo o già sciolto a questa data');
  if (date < officer.availableFrom) warnings.push(`non ancora disponibile (dal ${officer.availableFrom})`);
  if (date > officer.availableTo) warnings.push(`non più disponibile (fino al ${officer.availableTo})`);
  if (officer.review && ['date_doubt', 'duplicate'].includes(officer.review.status)) warnings.push(`dati dell'ufficiale dubbi: ${officer.review.reason}`);
  if (!officer.levels.includes(command.commandLevel)) warnings.push(`livello ${command.commandLevel} fuori dal profilo storico (${officer.levels.join('/')})`);
  const assignments = { ...state.assignments }; const events = [];
  for (const [cid, a] of Object.entries(assignments)) {
    if (a.officerId === officerId && cid !== commandId) { delete assignments[cid]; events.push({ type: 'vacated', commandId: cid, officerId, date }); warnings.push(`lascia il comando di ${cid}`); }
  }
  const previous = assignments[commandId];
  if (previous && previous.officerId !== officerId) events.push({ type: 'replaced', commandId, officerId: previous.officerId, date });
  assignments[commandId] = { officerId, source: 'player', since: date };
  events.push({ type: 'player_assign', commandId, officerId, date });
  return { state: { ...state, assignments }, events, warnings };
}

/** Il giocatore toglie il comandante: il comando torna libero e al prossimo autoAssign viene schierato in automatico. */
export function releaseCommander(state, commandId) {
  if (!state.assignments[commandId]) throw new Error(`nessun comandante su ${commandId}`);
  const assignments = { ...state.assignments }; const { officerId } = assignments[commandId];
  delete assignments[commandId];
  return { state: { ...state, assignments }, events: [{ type: 'release', commandId, officerId }] };
}

/** Errori dello stato (per salvataggi e test). */
export function validateCommanderState(state, { units, officers }) {
  const errors = [];
  if (state?.schema !== COMMANDER_SCHEMA) return [`comandanti: schema ${state?.schema}, atteso ${COMMANDER_SCHEMA}`];
  const u = indexById(units); const o = indexById(officers); const used = new Map();
  for (const [cid, a] of Object.entries(state.assignments)) {
    const c = u.get(cid); const off = o.get(a.officerId);
    if (!c) { errors.push(`comandanti: comando ${cid} inesistente`); continue; }
    if (!off) { errors.push(`comandanti: ufficiale ${a.officerId} inesistente`); continue; }
    if (!MANAGED_LEVELS.includes(c.commandLevel)) errors.push(`comandanti: ${cid} ha livello ${c.commandLevel} non gestito`);
    if (off.nation !== c.nation) errors.push(`comandanti: ${a.officerId} (${off.nation}) su ${cid} (${c.nation})`);
    if (!['auto', 'player'].includes(a.source)) errors.push(`comandanti: ${cid} con origine ${a.source}`);
    if (used.has(a.officerId)) errors.push(`comandanti: ${a.officerId} comanda sia ${used.get(a.officerId)} sia ${cid}`);
    used.set(a.officerId, cid);
  }
  return errors;
}
