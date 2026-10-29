// Inquadramento delle forze di terra (ordine di battaglia): teatro → gruppo d'armate → armata → corpo d'armata → divisione → unità di supporto.
// Funzioni PURE senza I/O: ricevono il catalogo unità già caricato e restituiscono un nuovo stato. Decisione dell'utente (29/10/2026):
// armate, corpi e teatri potranno poi ricevere comandi e missioni (NON ancora implementato: qui c'è solo la struttura padre → figlio).
//
// Regole:
// - Livelli nella catena: theater(5) > army_group(4) > army(3) > corps(2) > division(1, brigate incluse) > support(0). Ogni unità ha UN solo
//   padre; il figlio deve avere un livello più basso del padre (si possono saltare livelli: un corpo può dipendere direttamente da un teatro).
// - Fuori dalla catena: i comandi distrettuali (Wehrkreis, regioni militari), l'alto comando e ogni unità non di terra (aerea, navale): non
//   si inquadrano con questo sistema. Le unità di supporto sono previste (SUPPORT_CATEGORIES) ma il catalogo oggi non ne contiene.
// - Padre e figlio della stessa nazione, entrambi attivi alla data; niente cicli.
// - Nessun inquadramento storico è dato per scontato: i dati 1936 non hanno ancora i collegamenti (nessuna fonte verificata, 29/10/2026).
import { isActiveAt } from '../data/units.js';

export const ORBAT_SCHEMA = 'orbat-v1';
export const LEVEL_RANK = { theater: 5, army_group: 4, army: 3, corps: 2, division: 1, support: 0 };
export const SUPPORT_CATEGORIES = ['artillery', 'engineer', 'antiair', 'antitank', 'signals', 'support', 'supply'];
const FIGHTING_CATEGORIES = ['infantry', 'armored', 'mountain', 'airborne', 'cavalry', 'motorized', 'mechanized'];

export function createOrbatState() {
  return { schema: ORBAT_SCHEMA, links: {} };
}

/** Livello nella catena di un'unità, oppure null se non è inquadrabile (distretti, alto comando, aerei, navi...). */
export function orbatLevel(unit) {
  if (unit.category === 'command') return unit.commandLevel in LEVEL_RANK && unit.commandLevel !== 'support' ? unit.commandLevel : null;
  if (SUPPORT_CATEGORIES.includes(unit.category)) return 'support';
  if (FIGHTING_CATEGORIES.includes(unit.category) && (unit.echelon === 'division' || unit.echelon === 'brigade')) return 'division';
  return null;
}

const byId = (units) => new Map(units.map((u) => [u.id, u]));

/** Figli diretti di un'unità, in ordine di id. */
export function childrenOf(orbat, parentId) {
  return Object.keys(orbat.links).filter((c) => orbat.links[c].parent === parentId).sort();
}

/** Catena dei padri dal più vicino al più alto. */
export function chainOf(orbat, unitId) {
  const out = []; const seen = new Set([unitId]);
  let cur = orbat.links[unitId]?.parent;
  while (cur && !seen.has(cur)) { out.push(cur); seen.add(cur); cur = orbat.links[cur]?.parent; }
  return out;
}

/** Unità senza padre tra quelle inquadrabili e attive: da assegnare. */
export function unassigned(orbat, units, date, { nation } = {}) {
  return units.filter((u) => (nation === undefined || u.nation === nation) && orbatLevel(u) !== null && orbatLevel(u) !== 'theater'
    && isActiveAt(u, date) && !orbat.links[u.id]).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Controlla se `childId` può dipendere da `parentId`. Ritorna { ok: true } oppure { ok: false, reason }. */
export function canAttach(orbat, { childId, parentId, units, date }) {
  const m = byId(units); const child = m.get(childId); const parent = m.get(parentId);
  if (!child) return { ok: false, reason: `unità inesistente: ${childId}` };
  if (!parent) return { ok: false, reason: `comando inesistente: ${parentId}` };
  if (childId === parentId) return { ok: false, reason: 'un\'unità non può dipendere da sé stessa' };
  const cl = orbatLevel(child); const pl = orbatLevel(parent);
  if (cl === null) return { ok: false, reason: `${child.name} non è inquadrabile (${child.category}${child.commandLevel ? `/${child.commandLevel}` : ''})` };
  if (pl === null || pl === 'support') return { ok: false, reason: `${parent.name} non può comandare altre unità` };
  if (child.nation !== parent.nation) return { ok: false, reason: `${child.name} è ${child.nation}, ${parent.name} è ${parent.nation}` };
  if (LEVEL_RANK[cl] >= LEVEL_RANK[pl]) return { ok: false, reason: `${child.name} (${cl}) non può dipendere da ${parent.name} (${pl}): serve un livello più alto` };
  if (!isActiveAt(child, date)) return { ok: false, reason: `${child.name} non è attiva al ${date}` };
  if (!isActiveAt(parent, date)) return { ok: false, reason: `${parent.name} non è attivo al ${date}` };
  if (chainOf(orbat, parentId).includes(childId)) return { ok: false, reason: 'crea un ciclo' };
  return { ok: true };
}

/** Inquadra (o sposta) un'unità. Lancia un Error sui blocchi. Ritorna { state, events } (evento "moved" se c'era un padre diverso). */
export function attach(orbat, { childId, parentId, units, date, source = 'player' }) {
  const check = canAttach(orbat, { childId, parentId, units, date });
  if (!check.ok) throw new Error(check.reason);
  const previous = orbat.links[childId]?.parent ?? null;
  if (previous === parentId) return { state: orbat, events: [] };
  const links = { ...orbat.links, [childId]: { parent: parentId, source, since: date } };
  return { state: { ...orbat, links }, events: [{ type: previous ? 'moved' : 'attached', unitId: childId, from: previous, to: parentId, date }] };
}

/** Toglie il padre di un'unità (torna "non assegnata"). */
export function detach(orbat, childId, { date } = {}) {
  const link = orbat.links[childId];
  if (!link) return { state: orbat, events: [] };
  const { [childId]: _removed, ...links } = orbat.links;
  return { state: { ...orbat, links }, events: [{ type: 'detached', unitId: childId, from: link.parent, to: null, date: date ?? null }] };
}

/** Controlli di coerenza con il catalogo: ritorna un array di errori (vuoto = valido). Non controlla le date (un'unità può finire dopo). */
export function validateOrbatState(orbat, units) {
  const errors = [];
  const m = byId(units);
  for (const [childId, link] of Object.entries(orbat.links)) {
    const child = m.get(childId); const parent = m.get(link.parent);
    if (!child) { errors.push(`orbat: unità inesistente ${childId}`); continue; }
    if (!parent) { errors.push(`orbat: ${childId} dipende da ${link.parent}, che non esiste`); continue; }
    const cl = orbatLevel(child); const pl = orbatLevel(parent);
    if (cl === null) errors.push(`orbat: ${childId} non è inquadrabile`);
    else if (pl === null || pl === 'support') errors.push(`orbat: ${link.parent} non può comandare (${childId})`);
    else if (LEVEL_RANK[cl] >= LEVEL_RANK[pl]) errors.push(`orbat: ${childId} (${cl}) sotto ${link.parent} (${pl})`);
    if (child.nation !== parent.nation) errors.push(`orbat: ${childId} (${child.nation}) sotto ${link.parent} (${parent.nation})`);
    if (chainOf(orbat, childId).includes(childId)) errors.push(`orbat: ciclo su ${childId}`);
  }
  return errors;
}
