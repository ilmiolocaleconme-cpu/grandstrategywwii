// Stato di una partita. Contiene solo ciò che serve a riprodurla: niente geometrie né cataloghi
// (quelli restano nei file di data/ e si ricaricano). Qui nasce l'unica fonte di verità sul
// controllo dei territori: `control` mappa ogni id di `political_1936.json` al suo controllore.

import { START_DATE, addDays, daysBetween, isValidDate } from './calendar.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY, buildNations, validateNations } from './economyState.js';
import { populationOf } from '../data/nationPopulation.js';
import { validateProvinceStates } from './provinceState.js';
import { createCommanderState } from '../rules/commanders.js';
import { createOrbatState } from '../rules/orbat.js';
import { validateOrbatShape } from './orbatState.js';
import { createForcesState } from '../rules/forces.js';
import { validateForcesShape } from './forcesState.js';
import { validateCommandersShape } from './commandersState.js';

export const STATE_SCHEMA = 6; // 2: economia per nazione e difficoltà; 3: popolazione e coda costruzioni; 4: comandanti; 5: inquadramento; 6: forze (istanze di divisione). Migrazioni in economyState.js, commandersState.js, orbatState.js e forcesState.js

/**
 * Nazioni scegliibili: `playable` nel dataset politico E almeno una provincia sulla mappa.
 * (Oggi, ad esempio, il Giappone non è scegliibile: ha la voce politica ma nessuna provincia.)
 * `ownersWithProvinces` è un Set (o un array) di id proprietario presenti nei file delle province.
 */
export function playableNations(political, ownersWithProvinces) {
  const owners = new Set(ownersWithProvinces);
  return political.filter((e) => e.playable === true && e.type === 'country' && owners.has(e.id));
}

/** Controllore iniziale di ogni voce politica (colonie, mandati, protettorati inclusi). */
export function initialControl(political) {
  return Object.fromEntries(political.map((e) => [e.id, e.controller ?? e.id]));
}

/**
 * Nuova partita. Ritorna { ok: true, state } oppure { ok: false, reason } con reason in
 * `invalid_nation`, `unknown_nation`, `not_playable`, `no_provinces`, `invalid_date`, `invalid_difficulty`.
 * `start` ({ nationIds, industry, stocks, cash, economy, population }, i dati iniziali) è opzionale: senza, `nations` è null e si inizializza al caricamento (initEconomy).
 */
export function newGame({ nation, political, ownersWithProvinces, startDate = START_DATE, difficulty = DEFAULT_DIFFICULTY, start = null }) {
  if (typeof nation !== 'string' || nation === '') return { ok: false, reason: 'invalid_nation' };
  if (!isValidDate(startDate)) return { ok: false, reason: 'invalid_date' };
  if (!DIFFICULTIES.includes(difficulty)) return { ok: false, reason: 'invalid_difficulty' };
  const entry = political.find((e) => e.id === nation);
  if (!entry) return { ok: false, reason: 'unknown_nation' };
  if (entry.playable !== true || entry.type !== 'country') return { ok: false, reason: 'not_playable' };
  if (!new Set(ownersWithProvinces).has(nation)) return { ok: false, reason: 'no_provinces' };
  return {
    ok: true,
    state: {
      schema: STATE_SCHEMA,
      startDate,
      date: startDate,
      day: 0,
      player: nation,
      control: initialControl(political),
      difficulty,
      nations: start ? buildNations({ political, ...start, difficulty }) : null,
      commanders: createCommanderState(),
      orbat: createOrbatState(),
      forces: createForcesState(),
    },
  };
}

/** Errori di coerenza interna di uno stato (lista vuota = valido). Non conosce i cataloghi. */
export function validateState(state) {
  const errors = [];
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return ['stato: non è un oggetto'];
  if (state.schema !== STATE_SCHEMA) errors.push(`stato: schema ${JSON.stringify(state.schema)} (atteso ${STATE_SCHEMA})`);
  if (!isValidDate(state.startDate)) errors.push('stato: startDate non valida');
  if (!isValidDate(state.date)) errors.push('stato: date non valida');
  if (!Number.isInteger(state.day) || state.day < 0) errors.push('stato: day deve essere un intero >= 0');
  if (typeof state.player !== 'string' || state.player === '') errors.push('stato: player mancante');
  if (isValidDate(state.startDate) && isValidDate(state.date) && Number.isInteger(state.day)
    && daysBetween(state.startDate, state.date) !== state.day) {
    errors.push('stato: date non coincide con startDate + day');
  }
  const c = state.control;
  if (c === null || typeof c !== 'object' || Array.isArray(c)) errors.push('stato: control non è un oggetto');
  else {
    for (const [k, v] of Object.entries(c)) if (typeof v !== 'string' || v === '') errors.push(`stato: control["${k}"] non valido`);
    if (typeof state.player === 'string' && !(state.player in c)) errors.push('stato: player assente da control');
  }
  if (!DIFFICULTIES.includes(state.difficulty)) errors.push(`stato: difficoltà ${JSON.stringify(state.difficulty)} non valida`);
  if (!('nations' in state)) errors.push('stato: manca nations');
  else errors.push(...validateNations(state.nations, { player: state.nations === null ? undefined : state.player }));
  errors.push(...validateCommandersShape(state.commanders));
  errors.push(...validateOrbatShape(state.orbat));
  errors.push(...validateForcesShape(state.forces));
  errors.push(...validateProvinceStates(state.provinces)); // opzionale: assente = tutte le province al default
  return errors;
}

/** Inizializza `nations` dai dati iniziali se è null (partita nuova senza dati o salvataggio migrato dallo schema 1). Per lo schema 1 è esatto: l'economia non è mai evolsa. */
export function initEconomy(state, { political, start }) {
  if (state.nations === null) return { ...state, nations: buildNations({ political, ...start, difficulty: state.difficulty }) };
  // salvataggio dello schema 2 migrato: popolazione ancora null, si riempie dai dati (il resto dello stato resta com'è)
  if (!Object.values(state.nations).some((n) => n.population === null)) return state;
  const nations = {};
  for (const [id, n] of Object.entries(state.nations)) nations[id] = n.population === null ? { ...n, population: start.population ? populationOf(start.population, id) : 0 } : n;
  return { ...state, nations };
}

/** Stato avanzato di un giorno, senza altri effetti (le regole sono in engine.js). */
export function withNextDay(state) {
  return { ...state, day: state.day + 1, date: addDays(state.date, 1) };
}
