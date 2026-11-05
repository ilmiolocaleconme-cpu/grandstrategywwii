// Scheda unità, fase 2: regole pure (read model). Nessuna nuova regola di simulazione: legge ciò che il motore già produce.
// - affiliationOf: amico / nemico / neutrale rispetto al giocatore (alleati inclusi), dallo stato di guerra e di diplomazia esistenti.
// - natoSpec: simbolo NATO semplificato (cornice per affiliazione, glifo per categoria, indicatore di scaglione).
// - sheetSections: sezioni della scheda, ciascuna con stato 'dato' o 'non_disponibile' (mostrate sempre, fase 2 decisione B).
import { atWar } from './war.js';
import { areAllied } from './diplomacy.js';

/** Amico (giocatore o alleato), nemico (in guerra con il giocatore), neutrale (altrimenti). Senza giocatore: neutrale. */
export function affiliationOf(state, nation) {
  const player = state?.player;
  if (!player || !nation) return 'neutrale';
  if (nation === player || areAllied(state.diplomacy, player, nation)) return 'amico';
  if (state.war && atWar(state.war, player, nation)) return 'nemico';
  return 'neutrale';
}

// Glifo per categoria. Versione SEMPLIFICATA del simbolo NATO (APP-6): da verificare con lo standard completo nella fase 8.
export const NATO_GLYPH = Object.freeze({
  infantry: 'x', mountain: 'x', airborne: 'x', motorized: 'wheel', mechanized: 'oval-x', armored: 'oval', cavalry: 'slash', command: 'none',
});
export const NATO_FRAME = Object.freeze({ amico: 'rect', nemico: 'diamond', neutrale: 'square' });

/** Scaglione: divisione = 2 barre, brigata = 1, corpo = 3, armata = 4; altrimenti nessun indicatore. */
export function echelonMarks(unit) {
  if (unit.echelon === 'division') return 2;
  if (unit.echelon === 'brigade') return 1;
  if (unit.echelon === 'command' && unit.commandLevel === 'corps') return 3;
  if (unit.echelon === 'command' && unit.commandLevel === 'army') return 4;
  return 0;
}

/** Descrizione del simbolo: { frame, glyph, marks, affiliation, label }. Categoria sconosciuta: glifo 'none' (mai un'icona inventata). */
export function natoSpec(unit, affiliation) {
  const aff = NATO_FRAME[affiliation] ? affiliation : 'neutrale';
  return {
    frame: NATO_FRAME[aff], glyph: NATO_GLYPH[unit.category] ?? 'none', marks: echelonMarks(unit), affiliation: aff,
    label: `${aff}, ${unit.category ?? 'categoria sconosciuta'}`,
  };
}

/** Sezioni della scheda. `available` = il dato c'è davvero; le altre compaiono con «dato non disponibile». */
export function sheetSections(info) {
  const has = (x) => x !== null && x !== undefined;
  return [
    { id: 'panoramica', label: 'Panoramica', available: true },
    { id: 'organico', label: 'Organico', available: has(info.strength?.manpower) },
    { id: 'composizione', label: 'Composizione', available: has(info.composition) },
    { id: 'equipaggiamento', label: 'Equipaggiamento', available: (info.equipment ?? []).length > 0 },
    { id: 'comando', label: 'Comando', available: true },
    { id: 'operazioni', label: 'Operazioni', available: true },
    { id: 'condizione', label: 'Condizione', available: has(info.condition) },
    { id: 'logistica', label: 'Logistica', available: false },
    { id: 'sanita', label: 'Sanità', available: false },
    { id: 'storia', label: 'Storia', available: false },
  ];
}
