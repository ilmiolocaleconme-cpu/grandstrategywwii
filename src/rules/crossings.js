// Regole sugli attraversamenti (ponti, ponti di barche, guadi, traghetti). Funzioni PURE: niente I/O,
// niente stato globale, niente numeri di bilanciamento. Lavorano sui dati di data/crossings.json
// e su uno stato di partita minimo per ogni attraversamento: { state, controller }.
//
// COSA FANNO: dicono se un attraversamento è utilizzabile (e con quale capacità qualitativa) e come
// cambia lo stato con danni, distruzione, riparazione, ponte temporaneo, ricostruzione e conquista.
// COSA NON FANNO (non esiste ancora il modello di movimento, rifornimenti, economia, diplomazia):
//  - tempi di attraversamento, portata (unità per giorno), costi e durata dei lavori del genio;
//  - stagioni, piene, gelo e disgelo, guadi e traghetti con condizioni;
//  - chi ha diritto di passare tra nazioni (alleanze, accessi): il chiamante fornisce `access`;
//  - il genio e le sue risorse: il chiamante dice solo se ci sono ( `engineers` ).
// La capacità è qualitativa: 'full', 'reduced' o 'none'. Che cosa significhi "reduced" in numeri lo
// decideranno le regole di movimento e logistica.
// Scelte di progetto PROVVISORIE (da rivedere con quelle regole), segnate sotto con "SCELTA".

import { crossingExistsAt } from '../data/crossings.js';

export const CAPACITY = Object.freeze({ FULL: 'full', REDUCED: 'reduced', NONE: 'none' });
export const TRAFFIC = Object.freeze(['road', 'rail']);
export const ACTIONS = Object.freeze(['damage', 'destroy', 'repair', 'build_temporary', 'rebuild', 'capture']);
// Tipi sui quali il genio può costruire un passaggio temporaneo (ponti, non guadi né traghetti).
const BRIDGE_TYPES = ['bridge_road', 'bridge_rail', 'bridge_pontoon'];

/** Stato di partita iniziale di un attraversamento, preso dal dato. */
export function initialCrossingState(crossing) {
  return { state: crossing.state, controller: crossing.controller ?? null };
}

/** Tabella { id: stato } per tutti gli attraversamenti (anche quelli che nascono più avanti). */
export function buildCrossingStates(crossings) {
  return Object.fromEntries(crossings.map((c) => [c.id, initialCrossingState(c)]));
}

/** Capacità qualitativa dallo stato operativo. */
export function crossingCapacity(state) {
  if (state === 'intact') return CAPACITY.FULL;
  if (state === 'damaged' || state === 'temporary') return CAPACITY.REDUCED;
  return CAPACITY.NONE; // 'destroyed'
}

/**
 * Un attore può usare l'attraversamento in una data per un certo traffico?
 * `runtime` = { state, controller } (stato di partita); `ctx` = { date, traffic, actor, access }:
 *  - date: AAAA-MM-GG; traffic: 'road' | 'rail'; actor: id della nazione che passa;
 *  - access: nazioni il cui controllo concede il passaggio all'attore (alleati, accordi): lo decide
 *    la diplomazia, che non esiste ancora. Controllore nullo = nessuna restrizione.
 * Ritorna { ok, capacity, reason }; reason (se ok è falso) è un codice stabile:
 *  'not_built_yet', 'no_longer_exists', 'wrong_traffic', 'destroyed', 'temporary_road_only', 'controller_denied'.
 */
export function canCross(crossing, runtime, { date, traffic, actor, access = [] } = {}) {
  if (typeof date !== 'string') throw new TypeError('canCross: serve la data (AAAA-MM-GG)');
  if (!TRAFFIC.includes(traffic)) throw new RangeError(`canCross: traffico non valido "${traffic}"`);
  const no = (reason) => ({ ok: false, capacity: CAPACITY.NONE, reason });

  if (!crossingExistsAt(crossing, date)) return no(date < crossing.validFrom ? 'not_built_yet' : 'no_longer_exists');
  if (!crossing.carries.includes(traffic)) return no('wrong_traffic');
  if (runtime.state === 'destroyed') return no('destroyed');
  // SCELTA: un passaggio temporaneo del genio porta solo strada, anche se l'originale portava la ferrovia
  // (la ferrovia richiede la riparazione o la ricostruzione).
  if (runtime.state === 'temporary' && traffic === 'rail') return no('temporary_road_only');
  const c = runtime.controller;
  if (c != null && c !== actor && !access.includes(c)) return no('controller_denied');
  return { ok: true, capacity: crossingCapacity(runtime.state), reason: null };
}

/**
 * Applica un'azione e ritorna { ok, runtime, reason }; `runtime` è un NUOVO oggetto (quello dato non
 * cambia) ed è identico all'originale se ok è falso. Azioni (tabella in docs/FIUMI.md):
 *  - damage: intact -> damaged; temporary -> destroyed
 *  - destroy: intact | damaged | temporary -> destroyed
 *  - repair (genio): damaged -> intact
 *  - build_temporary (genio): destroyed -> temporary, solo ponti
 *  - rebuild (genio): destroyed | temporary -> intact
 *  - capture (opts.by = nazione): cambia il controllore, lo stato resta com'è
 * `opts`: { engineers: boolean, by: string }. Costi, tempi e risorse del genio NON sono modellati.
 * Codici di errore: 'engineers_required', 'already_damaged', 'already_destroyed', 'nothing_to_repair',
 * 'not_destroyed', 'not_a_bridge', 'already_intact', 'use_repair', 'already_controlled', 'missing_nation'.
 */
export function applyCrossingAction(crossing, runtime, action, { engineers = false, by } = {}) {
  if (!ACTIONS.includes(action)) throw new RangeError(`applyCrossingAction: azione non valida "${action}"`);
  const fail = (reason) => ({ ok: false, runtime, reason });
  const set = (state) => ({ ok: true, runtime: { ...runtime, state }, reason: null });
  const s = runtime.state;

  switch (action) {
    case 'damage':
      if (s === 'destroyed') return fail('already_destroyed');
      if (s === 'damaged') return fail('already_damaged');
      return set(s === 'temporary' ? 'destroyed' : 'damaged');
    case 'destroy':
      return s === 'destroyed' ? fail('already_destroyed') : set('destroyed');
    case 'repair':
      if (!engineers) return fail('engineers_required');
      return s === 'damaged' ? set('intact') : fail('nothing_to_repair');
    case 'build_temporary':
      if (!engineers) return fail('engineers_required');
      if (!BRIDGE_TYPES.includes(crossing.type)) return fail('not_a_bridge');
      return s === 'destroyed' ? set('temporary') : fail('not_destroyed');
    case 'rebuild':
      if (!engineers) return fail('engineers_required');
      if (s === 'intact') return fail('already_intact');
      if (s === 'damaged') return fail('use_repair');
      return set('intact'); // destroyed | temporary
    case 'capture':
      if (typeof by !== 'string' || by === '') return fail('missing_nation');
      return runtime.controller === by ? fail('already_controlled') : { ok: true, runtime: { ...runtime, controller: by }, reason: null };
    default:
      return fail('unknown');
  }
}
