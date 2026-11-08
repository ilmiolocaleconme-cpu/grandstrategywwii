// Stato di un nodo dell'albero di comando (pura, senza React): dati per la barra di dettaglio, pallino di stato e spunte degli ordini.
// Solo dati che il motore produce già. Un dato assente è null, mai zero. La forza materiale non c'è: la media non è affidabile (resta «—»).
import { conditionOf } from './divisionCondition.js';

const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/**
 * Dati di un insieme di divisioni (le sue o quelle sotto un comando).
 * ritorna { divisions, men: {effective, planned, ratio}|null, readiness, morale } con readiness e morale = medie, null senza divisioni.
 */
export function nodeStats({ divisionIds, forces, conditions, conditionConfig, nation }) {
  const ids = [...new Set(divisionIds)];
  let effective = 0; let planned = 0; let counted = 0;
  for (const id of ids) {
    const m = forces?.divisions?.[id]?.items?.['manpower.war'];
    if (m && Number.isFinite(m.effective) && Number.isFinite(m.planned)) { effective += m.effective; planned += m.planned; counted += 1; }
  }
  const conds = ids.map((id) => conditionOf(conditions, id, conditionConfig, nation));
  return {
    divisions: ids.length,
    men: counted ? { effective, planned, ratio: planned > 0 ? effective / planned : null } : null,
    readiness: avg(conds.map((c) => c.readiness)),
    morale: avg(conds.map((c) => c.morale)),
  };
}

/**
 * Pallino di stato di un comando, derivato solo dalla distanza dal comando (nessuna soglia inventata):
 * 'r' = tutte le divisioni fuori portata, 'y' = alcune, 'g' = nessuna, null = nessuna divisione.
 */
export function statusDot(divisionIds, farIds) {
  const ids = [...new Set(divisionIds)];
  if (ids.length === 0) return null;
  const far = ids.filter((id) => farIds?.has(id)).length;
  return far === 0 ? 'g' : far === ids.length ? 'r' : 'y';
}

/** Riga breve sotto il nome del nodo: «3 divisioni · 74%» oppure «nessuna divisione»; «fuori comando» se il pallino è rosso. */
export function nodeCaption({ divisions, readiness }, dot) {
  if (divisions === 0) return 'nessuna divisione';
  const n = `${divisions} ${divisions === 1 ? 'divisione' : 'divisioni'}`;
  if (dot === 'r') return `${n} · fuori comando`;
  return readiness === null ? n : `${n} · ${readiness}%`;
}

/** Spunte degli ordini: insieme di id scelti tra quelli disponibili (le spunte di unità non più disponibili cadono). */
export const checkAll = (ids) => new Set(ids);
export const checkNone = () => new Set();
export function toggleCheck(checked, id) { const n = new Set(checked); if (n.has(id)) n.delete(id); else n.add(id); return n; }
export const keepAvailable = (checked, ids) => { const ok = new Set(ids); return new Set([...checked].filter((id) => ok.has(id))); };
