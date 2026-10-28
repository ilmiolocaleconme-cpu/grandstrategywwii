// Salvataggi locali versionati. Principi: mai perdere un salvataggio in silenzio.
//  - ogni file porta formato e versione dello schema;
//  - un salvataggio più recente del codice, illeggibile o non migrabile NON viene cancellato né
//    sovrascritto: si copia sotto "<slot>.broken" e si segnala il motivo;
//  - se la scrittura fallisce (quota piena, modalità privata) il salvataggio precedente resta intatto.

import { STATE_SCHEMA, validateState } from './state.js';
import { migrateV1toV2, migrateV2toV3 } from './economyState.js';

export const SAVE_FORMAT = 'gswwii-save';
export const SAVE_SCHEMA = STATE_SCHEMA;
const PREFIX = 'gswwii.save.';
export const SLOTS = ['auto', 'manual'];

/**
 * Migrazioni: MIGRATIONS[n] porta uno stato dallo schema n allo schema n+1.
 * Schema 1 → 2 (27/10/2026): aggiunge difficoltà ed economia per nazione (`nations: null`, da inizializzare dai dati iniziali).
 * Schema 2 → 3 (28/10/2026): popolazione per nazione (null, riempita dai dati al caricamento) e coda delle costruzioni.
 * Quando cambia la forma dello stato si incrementa STATE_SCHEMA e si aggiunge qui la funzione, con un test.
 */
export const MIGRATIONS = { 1: migrateV1toV2, 2: migrateV2toV3 };

export function serializeSave(state, { savedAt, label = '' } = {}) {
  return JSON.stringify({ format: SAVE_FORMAT, schema: state.schema, savedAt: savedAt ?? null, label, state });
}

/**
 * Legge un salvataggio. { ok: true, state, savedAt, label, migratedFrom? } oppure
 * { ok: false, reason, detail } con reason in `invalid_json`, `wrong_format`, `newer_version`,
 * `missing_migration`, `invalid_state`.
 */
export function parseSave(text, { migrations = MIGRATIONS, currentSchema = SAVE_SCHEMA } = {}) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'invalid_json', detail: String(e.message) };
  }
  if (doc === null || typeof doc !== 'object' || doc.format !== SAVE_FORMAT || !Number.isInteger(doc.schema) || doc.schema < 1
    || doc.state === null || typeof doc.state !== 'object') {
    return { ok: false, reason: 'wrong_format', detail: 'non è un salvataggio di Grand Strategy WWII' };
  }
  if (doc.schema > currentSchema) {
    return { ok: false, reason: 'newer_version', detail: `salvato con lo schema ${doc.schema}, questa versione arriva a ${currentSchema}` };
  }
  let state = doc.state;
  for (let v = doc.schema; v < currentSchema; v += 1) {
    const step = migrations[v];
    if (typeof step !== 'function') return { ok: false, reason: 'missing_migration', detail: `manca la migrazione dallo schema ${v} al ${v + 1}` };
    try {
      state = step(state);
    } catch (e) {
      return { ok: false, reason: 'invalid_state', detail: `migrazione ${v}→${v + 1} fallita: ${e.message}` };
    }
  }
  // dopo le migrazioni lo stato deve essere valido per lo schema corrente (che sia `currentSchema` o quello iniettato nei test)
  const errors = currentSchema === SAVE_SCHEMA ? validateState(state) : [];
  if (errors.length > 0) return { ok: false, reason: 'invalid_state', detail: errors.join('; ') };
  const result = { ok: true, state, savedAt: doc.savedAt ?? null, label: doc.label ?? '' };
  if (doc.schema < currentSchema) result.migratedFrom = doc.schema;
  return result;
}

/**
 * Archivio sopra un oggetto con getItem/setItem/removeItem (localStorage o un finto nei test).
 * Ogni chiamata ritorna un risultato, non lancia mai.
 */
export function createSaveStore(storage) {
  const key = (slot) => `${PREFIX}${slot}`;
  const brokenKey = (slot) => `${PREFIX}${slot}.broken`;

  function write(slot, state, meta) {
    if (!SLOTS.includes(slot)) return { ok: false, reason: 'invalid_slot' };
    try {
      storage.setItem(key(slot), serializeSave(state, meta));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'write_failed', detail: String(e?.message ?? e) };
    }
  }

  function read(slot, options) {
    if (!SLOTS.includes(slot)) return { ok: false, reason: 'invalid_slot' };
    let text;
    try {
      text = storage.getItem(key(slot));
    } catch (e) {
      return { ok: false, reason: 'read_failed', detail: String(e?.message ?? e) };
    }
    if (text === null || text === undefined) return { ok: false, reason: 'empty' };
    const parsed = parseSave(text, options);
    if (parsed.ok) return parsed;
    // Non si perde nulla: la copia illeggibile resta disponibile sotto <slot>.broken.
    let backedUp = false;
    try {
      storage.setItem(brokenKey(slot), text);
      backedUp = true;
    } catch {
      backedUp = false;
    }
    return { ...parsed, backedUp };
  }

  function info(slot) {
    const r = read(slot);
    if (!r.ok) return null;
    return { slot, savedAt: r.savedAt, label: r.label, date: r.state.date, player: r.state.player };
  }

  return { write, read, info };
}

/** localStorage se disponibile, altrimenti null (anteprime, finestre private, dati bloccati). */
export function browserStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = `${PREFIX}probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
