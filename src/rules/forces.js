// Istanze di divisione nello stato: per ogni divisione attiva con un template, uomini, cavalli e armi PREVISTI ed EFFETTIVI (29/10/2026).
// Funzioni PURE. L'effettivo iniziale viene da initialEffective (src/rules/readiness.js): dato reale del template, altrimenti previsto × frazione di esempio.
// Solo le divisioni che hanno un template ricevono un'istanza: le altre (nazioni o tipi senza template) restano senza dotazione, NON si inventa.
import { isActiveAt } from '../data/units.js';
import { initialEffective } from './readiness.js';

export const FORCES_SCHEMA = 'forces-v1';

export function createForcesState() {
  return { schema: FORCES_SCHEMA, initialized: false, divisions: {} };
}

/** Template che si applica a un'unità (stessa nazione, categoria e scaglione), oppure null. */
export function templateFor(unit, templates) {
  if (unit.echelon !== 'division') return null;
  return templates.find((t) => t.appliesTo && t.appliesTo.nation === unit.nation && t.appliesTo.category === unit.category && t.appliesTo.echelon === unit.echelon) ?? null;
}

/** Istanza di una divisione: { templateId, since, items: { 'manpower.war': { planned, effective, source }, ... } } (solo voci numeriche note). */
export function buildDivision(template, ratio, date) {
  return { templateId: template.id, since: date, items: initialEffective(template, ratio) };
}

/** Crea le istanze mancanti per le divisioni attive alla data. Ritorna { state, created, withoutTemplate: [id] }. Idempotente: non tocca le istanze esistenti. */
export function initForces(forces, { units, templates, ratio, date }) {
  const divisions = { ...forces.divisions };
  const withoutTemplate = [];
  let created = 0;
  for (const u of [...units].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (u.echelon !== 'division' || !isActiveAt(u, date) || divisions[u.id]) continue;
    const t = templateFor(u, templates);
    if (!t) { withoutTemplate.push(u.id); continue; }
    divisions[u.id] = buildDivision(t, ratio, date);
    created += 1;
  }
  return { state: { ...forces, initialized: true, divisions }, created, withoutTemplate };
}

/** Uomini effettivamente arruolati nelle divisioni di una nazione (somma di manpower.war effettivo; le divisioni senza dato non contano). */
export function enlistedManpower(forces, units, nation) {
  const byId = new Map(units.map((u) => [u.id, u]));
  let total = 0;
  for (const [id, d] of Object.entries(forces.divisions)) {
    if (byId.get(id)?.nation !== nation) continue;
    total += d.items['manpower.war']?.effective ?? 0;
  }
  return total;
}

/** Errori di coerenza con il catalogo (vuoto = valido). */
export function validateForcesState(forces, units) {
  const errors = [];
  const byId = new Map(units.map((u) => [u.id, u]));
  for (const [id, d] of Object.entries(forces.divisions)) {
    const u = byId.get(id);
    if (!u) { errors.push(`forze: unità inesistente ${id}`); continue; }
    if (u.echelon !== 'division') errors.push(`forze: ${id} non è una divisione`);
    for (const [k, it] of Object.entries(d.items)) {
      if (it.effective > it.planned) errors.push(`forze: ${id} ${k} effettivo ${it.effective} supera il previsto ${it.planned}`);
    }
  }
  return errors;
}
