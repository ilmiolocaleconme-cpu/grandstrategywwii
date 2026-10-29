// Albero tecnologico: dati (data/research/technologies.json) e validazione. Funzioni PURE.
import { difficulty } from './economy.js';

export const TECH_SCHEMA = 'technologies-v1';

/**
 * Errori del file (lista vuota = valido). `consumers` (opzionale) = insieme degli id di tecnologia effettivamente richiesti da qualche regola:
 * ogni tecnologia deve avere un'utilità, quindi una tecnologia che nessuno richiede è un errore.
 */
export function validateTechnologies(file, { consumers = null } = {}) {
  if (file?.schema !== TECH_SCHEMA) return [`tecnologie: schema ${file?.schema}, atteso ${TECH_SCHEMA}`];
  const errors = [];
  if (!['DESIGN_DEFAULT', 'MISSING_DATA', 'verified'].includes(file.quality)) errors.push('tecnologie: qualità sconosciuta');
  const branches = new Set((file.branches ?? []).map((b) => b.id));
  const byId = new Map();
  for (const t of file.technologies ?? []) {
    if (typeof t.id !== 'string' || !t.id) { errors.push('tecnologie: voce senza id'); continue; }
    if (byId.has(t.id)) errors.push(`tecnologie: id duplicato ${t.id}`);
    byId.set(t.id, t);
    if (!branches.has(t.branch)) errors.push(`tecnologie: ${t.id} con ramo sconosciuto ${t.branch}`);
    if (!t.name_it) errors.push(`tecnologie: ${t.id} senza nome`);
    if (!(t.cost_ecv > 0)) errors.push(`tecnologie: ${t.id} con costo non valido`);
    if (!Number.isInteger(t.days) || t.days < 1) errors.push(`tecnologie: ${t.id} con durata non valida`);
    if (!Array.isArray(t.prerequisites)) errors.push(`tecnologie: ${t.id} senza elenco prerequisiti`);
    if (!Array.isArray(t.unlocks) || t.unlocks.length === 0) errors.push(`tecnologie: ${t.id} non sblocca nulla`);
    for (const u of t.unlocks ?? []) {
      if (u.kind === 'factory_level' ? !Number.isInteger(u.level) : u.kind === 'security' ? typeof u.capability !== 'string' : true) errors.push(`tecnologie: ${t.id} con sblocco non valido`);
    }
  }
  for (const t of byId.values()) for (const p of t.prerequisites ?? []) if (!byId.has(p)) errors.push(`tecnologie: ${t.id} richiede ${p}, che non esiste`);
  // cicli nei prerequisiti
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { errors.push(`tecnologie: ciclo nei prerequisiti (${[...path, id].join(' → ')})`); return; }
    state.set(id, 1);
    for (const p of byId.get(id)?.prerequisites ?? []) if (byId.has(p)) visit(p, [...path, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);
  if (consumers) for (const id of byId.keys()) if (!consumers.has(id)) errors.push(`tecnologie: ${id} non è richiesta da nessuna regola (nessuna utilità)`);
  return errors;
}

export const techIndex = (file) => new Map((file?.technologies ?? []).map((t) => [t.id, t]));

/** Id richiesti dalle regole: livelli fabbrica (`requires`) e capacità di sicurezza (`requires` per capacità in security.json). */
export function consumersOf({ levels = null, security = null } = {}) {
  const s = new Set();
  for (const l of levels?.levels ?? []) if (l.requires) s.add(l.requires);
  for (const r of Object.values(security?.capabilities ?? {})) if (r) s.add(r);
  return s;
}

/** Costo e durata di una ricerca alla difficoltà data: ecv e giorni scalati come le costruzioni (costMul, timeMul). */
export function techCost(economy, tech, difficultyId) {
  const d = difficulty(economy, difficultyId);
  return { ecv: Math.round(tech.cost_ecv * d.costMul * 1000) / 1000, days: Math.ceil(tech.days * d.timeMul) };
}
