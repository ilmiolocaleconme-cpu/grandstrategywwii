// Stato delle strade e delle ferrovie in partita (campo facoltativo state.infrastructure: assente = tutti i collegamenti al livello di partenza). Funzioni PURE, nessuna dipendenza.
// state.infrastructure = { levels: { [idCollegamento]: livello 1-4 } } contiene solo i collegamenti MIGLIORATI; i lavori in corso stanno nella coda delle costruzioni della nazione (kind 'infra').

export function validateInfrastructureShape(inf) {
  if (inf === undefined) return [];
  if (inf === null || typeof inf !== 'object' || inf.levels === null || typeof inf.levels !== 'object' || Array.isArray(inf.levels)) return ['stato: infrastructure non valida'];
  const errors = [];
  for (const [id, v] of Object.entries(inf.levels)) if (!Number.isInteger(v) || v < 1 || v > 4) errors.push(`stato: infrastructure, livello ${v} non valido per ${id}`);
  return errors;
}
