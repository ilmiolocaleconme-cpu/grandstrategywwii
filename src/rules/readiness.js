// Dotazione effettiva iniziale dei template: effettivo = previsto × frazione (ESEMPIO dell'utente, 29/10/2026; non un dato storico).
// Funzioni PURE. Un dato reale nel campo `effective` del template ha SEMPRE la precedenza sulla frazione di esempio.
import { leaves } from '../data/templates.js';

export function validateReadiness(doc) {
  const errors = [];
  if (doc?.schema !== 'readiness-v1') errors.push(`readiness: schema ${JSON.stringify(doc?.schema)}`);
  const f = doc?.initialFillRatio;
  if (!f || typeof f.value !== 'number' || !(f.value > 0 && f.value <= 1)) errors.push('readiness: initialFillRatio.value deve essere nell\'intervallo (0, 1]');
  if (f && !['USER_EXAMPLE', 'USER_ESTIMATE', 'HISTORICAL'].includes(f.basis)) errors.push(`readiness: basis ${JSON.stringify(f.basis)}`);
  if (f && !String(f.source ?? '').trim()) errors.push('readiness: initialFillRatio senza fonte');
  return errors;
}

/**
 * Effettivo iniziale per ogni voce numerica del template: { 'equipment.carri': { planned, effective, source: 'template'|'ratio' }, ... }.
 * Se la voce ha un effettivo reale lo usa (source 'template'), altrimenti arrotonda previsto × ratio (source 'ratio').
 */
export function initialEffective(template, ratio) {
  if (!(ratio > 0 && ratio <= 1)) throw new RangeError(`frazione non valida: ${ratio}`);
  const out = {};
  for (const [path, l] of leaves(template)) {
    if (typeof l.value !== 'number' || l.effective === undefined) continue;
    out[path] = l.effective.value !== null
      ? { planned: l.value, effective: l.effective.value, source: 'template' }
      : { planned: l.value, effective: Math.round(l.value * ratio), source: 'ratio' };
  }
  return out;
}
