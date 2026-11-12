// Leggi di mobilitazione (04/11/2026): quando la condizione di una legge è vera, i quadri della nazione vengono mobilitati con `mobilize` (src/rules/reinforcements.js):
// da quel momento i rinforzi li portano al previsto SE ci sono le risorse. Non crea uomini né mezzi. Dati: data/units/mobilization_laws.json.
// Stato (campo OPZIONALE, nessuna migrazione): state.mobilization = { schema: 'mobilization-v1', started: { idLegge: { on: 'AAAA-MM-GG' } } } (prima data in cui la legge è scattata).
// La condizione `war` guarda state.war (atWar), quindi funziona con qualunque origine della guerra (giocatore, eventi, IA futura).
// Ogni giorno, finché la condizione resta vera, mobilita anche i quadri comparsi dopo (idempotente: nessun cambiamento = stesso oggetto di stato).
import { atWar } from '../rules/war.js';
import { mobilize } from '../rules/reinforcements.js';
import { orderMove } from './movementState.js';

export const MOBILIZATION_SCHEMA = 'mobilization-v1';
export const LAWS_SCHEMA = 'mobilization-laws-v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Errori della tabella delle leggi (vuoto = valida). nationIds = id delle nazioni esistenti. */
export function validateMobilizationLaws(doc, { nationIds, provinceIds = null } = {}) {
  const errors = [];
  if (doc?.schema !== LAWS_SCHEMA) errors.push(`mobilitazione: schema ${JSON.stringify(doc?.schema)}`);
  if (!Array.isArray(doc?.laws)) return [...errors, 'mobilitazione: laws non è un array'];
  const seen = new Set();
  const known = nationIds ? new Set(nationIds) : null;
  for (const l of doc.laws) {
    const p = `mobilitazione ${l?.id}`;
    if (typeof l?.id !== 'string' || l.id === '') { errors.push('mobilitazione: legge senza id'); continue; }
    if (seen.has(l.id)) errors.push(`${p}: id duplicato`);
    seen.add(l.id);
    if (known && !known.has(l.nation)) errors.push(`${p}: nazione ${JSON.stringify(l.nation)} inesistente`);
    if (l.effect !== 'mobilize_cadres') errors.push(`${p}: effetto ${JSON.stringify(l.effect)} non supportato`);
    const t = l.trigger;
    if (t?.type !== 'war') errors.push(`${p}: condizione ${JSON.stringify(t?.type)} non supportata`);
    else {
      if (typeof t.a !== 'string' || typeof t.b !== 'string' || t.a === t.b) errors.push(`${p}: la guerra richiede due nazioni diverse`);
      if (known) for (const n of [t.a, t.b]) if (!known.has(n)) errors.push(`${p}: nazione ${JSON.stringify(n)} della condizione inesistente`);
    }
    if (!['utente', 'ipotesi'].includes(l.basis)) errors.push(`${p}: basis ${JSON.stringify(l.basis)}`);
    if (!String(l.source ?? '').trim()) errors.push(`${p}: senza fonte`);
    const g = l.garrison;
    if (g !== undefined) {
      if (typeof g.category !== 'string' || g.category === '') errors.push(`${p}: guarnigione senza categoria`);
      if (!(typeof g.share === 'number' && g.share > 0 && g.share <= 1)) errors.push(`${p}: quota di guarnigione non valida`);
      if (!Array.isArray(g.provinces) || g.provinces.length === 0 || new Set(g.provinces).size !== g.provinces.length) errors.push(`${p}: province di guarnigione assenti o duplicate`);
      if (!['utente', 'ipotesi'].includes(g.basis) || !['utente', 'ipotesi'].includes(g.selection)) errors.push(`${p}: guarnigione senza basis/selection validi`);
      if (!String(g.source ?? '').trim()) errors.push(`${p}: guarnigione senza fonte`);
      if (provinceIds) for (const id of g.provinces ?? []) if (!provinceIds.has(id)) errors.push(`${p}: provincia di guarnigione ${id} inesistente`);
    }
  }
  return errors;
}

/** Errori di forma dello stato (opzionale). */
export function validateMobilizationShape(m) {
  if (m === undefined) return [];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return ['mobilitazione: non è un oggetto'];
  const errors = [];
  if (m.schema !== MOBILIZATION_SCHEMA) errors.push(`mobilitazione: schema ${JSON.stringify(m.schema)}`);
  if (m.started === null || typeof m.started !== 'object' || Array.isArray(m.started)) return [...errors, 'mobilitazione: started non è un oggetto'];
  for (const [id, v] of Object.entries(m.started)) if (!DATE_RE.test(v?.on ?? '')) errors.push(`mobilitazione: ${id} senza data valida`);
  if (m.garrison !== undefined) {
    if (m.garrison === null || typeof m.garrison !== 'object' || Array.isArray(m.garrison)) return [...errors, 'mobilitazione: garrison non è un oggetto'];
    for (const [id, g] of Object.entries(m.garrison)) {
      if (!DATE_RE.test(g?.on ?? '') || !Array.isArray(g.units) || !Number.isInteger(g.quota) || !Number.isInteger(g.shortfall)) errors.push(`mobilitazione: guarnigione ${id} non valida`);
      else if (g.units.some((u) => typeof u?.unit !== 'string' || typeof u?.to !== 'string')) errors.push(`mobilitazione: guarnigione ${id} con ordini non validi`);
    }
  }
  return errors;
}

const conditionHolds = (state, t) => t.type === 'war' && atWar(state.war, t.a, t.b);

/**
 * Guarnigione di confine: sceglie ceil(share × n) divisioni della categoria tra quelle della nazione (le più vicine per giorni di marcia a una delle province),
 * le ripartisce in modo equilibrato (capienza ceil(k / province)) e impartisce gli ordini di movimento. Ritorna { state, record }.
 */
function garrisonOrders(state, law, { units, nationOf, deploymentDoc, net }) {
  const g = law.garrison;
  const mine = units.filter((u) => u.category === g.category && nationOf.get(u.id) === law.nation && state.forces.divisions[u.id]);
  const quota = Math.ceil(g.share * mine.length);
  // giorni di marcia di ogni divisione verso ogni provincia (prova a vuoto: lo stato non cambia)
  const options = [];
  for (const u of mine) {
    const days = [];
    for (const to of g.provinces) {
      const r = orderMove(state, { units: [u], to, nation: law.nation, deploymentDoc, net });
      if (r.moved.length) days.push({ to, days: r.moved[0].days });
    }
    if (days.length) options.push({ u, days: days.sort((a, b) => a.days - b.days || a.to.localeCompare(b.to)) });
  }
  options.sort((a, b) => a.days[0].days - b.days[0].days || a.u.id.localeCompare(b.u.id));
  const chosen = options.slice(0, quota);
  const cap = Math.ceil(chosen.length / g.provinces.length);
  const load = Object.fromEntries(g.provinces.map((p) => [p, 0]));
  let cur = state;
  const assigned = [];
  for (const { u, days } of chosen) {
    const target = days.find((d) => load[d.to] < cap) ?? days[0];
    const r = orderMove(cur, { units: [u], to: target.to, nation: law.nation, deploymentDoc, net });
    if (!r.moved.length) continue;
    cur = r.state; load[target.to] += 1; assigned.push({ unit: u.id, to: target.to });
  }
  return { state: cur, record: { on: state.date, quota, units: assigned, shortfall: quota - assigned.length } };
}

/**
 * Sistema giornaliero. ctx: { units (unitsFile.units), laws (documento mobilization_laws), movement: { net: (state) => rete|null, deploymentDoc } (facoltativo: senza, nessuna guarnigione) }.
 * Senza forze inizializzate non fa nulla. La guarnigione scatta una volta sola per legge, il primo giorno in cui la rete di movimento è disponibile.
 */
export function createMobilizationSystem({ units, laws, movement = null }) {
  const nationOf = new Map(units.map((u) => [u.id, u.nation]));
  return function mobilizationDay(state) {
    if (!state.forces?.initialized) return state;
    let cur = state;
    let forces = state.forces;
    let started = state.mobilization?.started ?? {};
    let garrison = state.mobilization?.garrison;
    let changed = false;
    for (const law of laws.laws) {
      if (!conditionHolds(state, law.trigger)) continue;
      for (const [id, d] of Object.entries(forces.divisions)) {
        if (d.cadre === true && nationOf.get(id) === law.nation) { forces = mobilize(forces, id); changed = true; }
      }
      if (!started[law.id]) { started = { ...started, [law.id]: { on: state.date } }; changed = true; }
      const net = law.garrison && movement && !garrison?.[law.id] ? movement.net(state) : null;
      if (net) {
        const r = garrisonOrders({ ...cur, forces }, law, { units, nationOf, deploymentDoc: movement.deploymentDoc, net });
        cur = { ...cur, movement: r.state.movement };
        garrison = { ...(garrison ?? {}), [law.id]: r.record };
        changed = true;
      }
    }
    if (!changed) return state;
    return { ...cur, forces, mobilization: { schema: MOBILIZATION_SCHEMA, started, ...(garrison ? { garrison } : {}) } };
  };
}
