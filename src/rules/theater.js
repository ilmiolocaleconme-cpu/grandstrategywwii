// Incarichi di teatro: il giocatore DÀ UN INCARICO (attacco o difesa), SCEGLIE le province sulla mappa e assegna le unità. L'incarico
// resta registrato e visibile (province segnate, unità, stato). Funzioni PURE. Campo OPZIONALE `state.theaters` (niente migrazione).
//
// Regole (decise con l'utente, 30/10/2026):
//  - attacco: le province scelte sono gli OBIETTIVI da prendere (controllate da una nazione in guerra con la tua); l'incarico finisce
//    quando sono tutte tue;
//  - difesa: le province scelte sono da TENERE (tue); l'incarico resta attivo finché non lo annulli;
//  - ogni unità ha al massimo un incarico attivo: assegnarla a un nuovo incarico la toglie dal precedente.
// Come le unità eseguono l'incarico (marcia, contatto, battaglia, conquista) è in src/game/theaterState.js e src/rules/combat.js.
export const THEATERS_SCHEMA = 'theaters-v1';
export const KINDS = Object.freeze(['attack', 'defend']);
export const STATUSES = Object.freeze(['active', 'done', 'cancelled']);

export const createTheaters = () => ({ schema: THEATERS_SCHEMA, seq: 0, list: {} });

const idOf = (n) => `TH-${String(n).padStart(4, '0')}`;

/** Incarichi attivi in ordine di id. */
export function activeAssignments(th) {
  return Object.values(th.list).filter((a) => a.status === 'active').sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Incarico attivo di un'unità, oppure null. */
export function assignmentOfUnit(th, unitId) {
  return activeAssignments(th).find((a) => a.units.includes(unitId)) ?? null;
}

/**
 * Crea un incarico. `units` e `provinces` sono liste di id (non vuote, senza doppioni). Ritorna { state, id }.
 * Lancia un Error su dati non validi. Le unità già in un altro incarico attivo passano a questo.
 */
export function createAssignment(th, { nation, kind, provinces, units, date, name = null }) {
  if (!KINDS.includes(kind)) throw new Error(`incarico: tipo ${JSON.stringify(kind)} sconosciuto`);
  if (typeof nation !== 'string' || nation === '') throw new Error('incarico: nazione mancante');
  const prov = [...new Set(provinces)];
  const uns = [...new Set(units)];
  if (prov.length === 0) throw new Error('incarico: scegli almeno una provincia');
  if (uns.length === 0) throw new Error('incarico: assegna almeno un\'unità');
  const seq = th.seq + 1;
  const id = idOf(seq);
  const list = {};
  for (const [k, a] of Object.entries(th.list)) {
    if (a.status === 'active' && a.units.some((u) => uns.includes(u))) {
      const left = a.units.filter((u) => !uns.includes(u));
      list[k] = left.length ? { ...a, units: left } : { ...a, units: left, status: 'cancelled', closed: date };
    } else list[k] = a;
  }
  list[id] = { id, nation, kind, name: name ?? `${kind === 'attack' ? 'Attacco' : 'Difesa'} ${seq}`, provinces: prov, units: uns, status: 'active', since: date };
  return { state: { ...th, seq, list }, id };
}

export function cancelAssignment(th, id, { date }) {
  const a = th.list[id];
  if (!a) throw new Error(`incarico inesistente: ${id}`);
  if (a.status !== 'active') return th;
  return { ...th, list: { ...th.list, [id]: { ...a, status: 'cancelled', closed: date } } };
}

export function completeAssignment(th, id, { date }) {
  const a = th.list[id];
  if (!a || a.status !== 'active') return th;
  return { ...th, list: { ...th.list, [id]: { ...a, status: 'done', closed: date } } };
}

/** Toglie unità dagli incarichi attivi (distrutte o rientrate); un incarico senza unità si chiude. */
export function dropUnits(th, unitIds, { date }) {
  const gone = new Set(unitIds);
  let changed = false;
  const list = {};
  for (const [k, a] of Object.entries(th.list)) {
    if (a.status === 'active' && a.units.some((u) => gone.has(u))) {
      changed = true;
      const left = a.units.filter((u) => !gone.has(u));
      list[k] = left.length ? { ...a, units: left } : { ...a, units: left, status: 'cancelled', closed: date };
    } else list[k] = a;
  }
  return changed ? { ...th, list } : th;
}

export function validateTheaters(th) {
  if (th === undefined) return [];
  if (th === null || typeof th !== 'object' || Array.isArray(th)) return ['teatri: non è un oggetto'];
  const errors = [];
  if (th.schema !== THEATERS_SCHEMA) errors.push(`teatri: schema ${JSON.stringify(th.schema)}`);
  if (!Number.isInteger(th.seq) || th.seq < 0) errors.push('teatri: seq non valido');
  if (th.list === null || typeof th.list !== 'object') return [...errors, 'teatri: list mancante'];
  const seen = new Map();
  for (const [k, a] of Object.entries(th.list)) {
    if (a?.id !== k) errors.push(`teatri: id incoerente per ${k}`);
    if (!KINDS.includes(a?.kind)) errors.push(`teatri: ${k} tipo ${JSON.stringify(a?.kind)}`);
    if (!STATUSES.includes(a?.status)) errors.push(`teatri: ${k} stato ${JSON.stringify(a?.status)}`);
    if (typeof a?.nation !== 'string' || a.nation === '') errors.push(`teatri: ${k} senza nazione`);
    if (!Array.isArray(a?.provinces) || a.provinces.length === 0 || !a.provinces.every((p) => typeof p === 'string')) errors.push(`teatri: ${k} province non valide`);
    if (!Array.isArray(a?.units) || !a.units.every((p) => typeof p === 'string')) errors.push(`teatri: ${k} unità non valide`);
    else if (a.status === 'active') {
      if (a.units.length === 0) errors.push(`teatri: ${k} attivo senza unità`);
      for (const u of a.units) { if (seen.has(u)) errors.push(`teatri: ${u} in due incarichi attivi (${seen.get(u)}, ${k})`); seen.set(u, k); }
    }
    if (a?.force !== undefined && typeof a.force !== 'boolean') errors.push(`teatri: ${k} force non booleano`);
    if (typeof a?.since !== 'string') errors.push(`teatri: ${k} senza data`);
  }
  return errors;
}
