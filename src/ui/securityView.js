// Testi e righe per ricerca e sicurezza (nessun React): funzioni PURE, testabili da sole.
import { describeBuildFailure } from './buildOptions.js';
import { securityOf } from '../game/securityState.js';

const ROLE = { spy: 'spia', saboteur: 'sabotatore' };
const PLURAL = { spy: 'spie', saboteur: 'sabotatori' };
const STATUS = { done: 'Acquisita', active: 'In corso', available: 'Disponibile', locked: 'Bloccata', busy: 'Un\'altra ricerca è in corso', unaffordable: 'Fondi insufficienti' };
export const researchStatusLabel = (s) => STATUS[s] ?? s;

/** Frase in italiano per un rifiuto di ricerca o di sicurezza ({ ok:false, reason, ... }). */
export function describeOrderFailure(r, { techName = (id) => id } = {}) {
  if (r.ok) return '';
  switch (r.reason) {
    case 'missing': return describeBuildFailure(r, techName);
    case 'busy': return `C'è già una ricerca in corso (${techName(r.active)})`;
    case 'already_done': return 'Tecnologia già acquisita';
    case 'prerequisites': return `Prima serve: ${r.missing.map(techName).join(', ')}`;
    case 'unknown_tech': return 'Tecnologia sconosciuta';
    case 'not_controlled': return 'Questo luogo non è sotto il tuo controllo';
    case 'max_level': return `Massimo di reparti già raggiunto (${r.max})`;
    case 'same_nation': return 'Non puoi agire contro te stesso';
    case 'no_agent': return `Nessun${r.role === 'spy' ? 'a spia' : ' sabotatore'} libero in riserva: addestrane uno`;
    case 'no_intel': return 'Serve almeno una spia schierata presso quella nazione';
    case 'no_facility': return 'Impianto non trovato';
    case 'already_building': return 'Operazione già in corso su questo impianto';
    case 'unknown_nation': return 'Nazione sconosciuta';
    case 'invalid_order': case 'invalid_place': return 'Ordine non valido';
    default: return `Ordine rifiutato (${r.reason})`;
  }
}

/** Voce del registro di chi ha agito → testo. ctx: { nationName(id), facilityName(type), placeName(id) } */
export function describeLog(e, ctx) {
  const n = ctx.nationName; const f = ctx.facilityName;
  switch (e.kind) {
    case 'trained': return `Giorno ${e.day}: ${e.count} ${e.count === 1 ? ROLE[e.role] : PLURAL[e.role]} addestrat${e.count === 1 ? 'o' : 'i'}`;
    case 'police': return `Giorno ${e.day}: reparto di polizia militare operativo a ${ctx.placeName(e.place)}`;
    case 'spy_caught': return `Giorno ${e.day}: ${e.count} ${e.count === 1 ? 'spia scoperta' : 'spie scoperte'} in ${n(e.targetNation)}`;
    case 'sabotage': {
      if (e.result === 'void') return `Giorno ${e.day}: operazione annullata (${f(e.type)} in ${n(e.targetNation)} non esiste più)`;
      const what = `${f(e.type)} in ${n(e.targetNation)}`;
      if (e.result === 'success') return `Giorno ${e.day}: sabotaggio riuscito contro ${what} (danno ${Math.round(e.damage * 100)}%)${e.detected ? ' · sabotatore catturato' : ''}`;
      return `Giorno ${e.day}: sabotaggio fallito contro ${what}${e.detected ? ' · sabotatore catturato' : ' · rientrato senza essere visto'}`;
    }
    default: return `Giorno ${e.day}: ${e.kind}`;
  }
}

/** Incidente subito → testo. */
export function describeIncident(e, ctx) {
  const n = ctx.nationName;
  if (e.kind === 'spy_caught') return `Giorno ${e.day}: ${e.count === 1 ? 'scoperta una spia' : `scoperte ${e.count} spie`} di ${n(e.attacker)}`;
  const what = ctx.facilityName(e.type);
  const who = e.attacker ? `responsabile: ${n(e.attacker)}` : 'autore ignoto';
  return `Giorno ${e.day}: ${e.success ? 'sabotaggio riuscito' : 'tentativo di sabotaggio sventato'} contro ${what} (${who})`;
}

/**
 * Quadro della sicurezza di `nationId` per il pannello. ctx: { security (createSecurity), cfg, state, nationName, facilityName, placeName, techName }.
 */
export function securitySummary(state, nationId, ctx) {
  const nation = state.nations?.[nationId];
  if (!nation) return null;
  const { security: sec, cfg } = ctx;
  const s = securityOf(nation);
  const places = new Map();
  for (const f of nation.facilities) places.set(sec.placeOf(f), (places.get(sec.placeOf(f)) ?? 0) + 1);
  const police = [...places].map(([place, facilities]) => {
    const d = sec.defenseAt(nation, place);
    return { place, name: ctx.placeName(place), facilities, mp: s.mp[place] ?? 0, queued: s.queue.filter((q) => q.kind === 'mp' && q.place === place).length, defense: d.total, max: cfg.militaryPolice.maxPerPlace };
  }).sort((a, b) => b.facilities - a.facilities || (a.place < b.place ? -1 : 1));
  const queueLabel = (q) => (q.kind === 'train' ? `Addestramento: ${q.count} ${q.count === 1 ? ROLE[q.role] : PLURAL[q.role]}` : q.kind === 'mp' ? `Polizia militare a ${ctx.placeName(q.place)}` : `Sabotaggio: ${ctx.facilityName(q.type)} in ${ctx.nationName(q.targetNation)}`);
  return {
    canAgents: sec.canAgents(nation), counterIntel: sec.hasCI(nation), agentsTech: ctx.techName(cfg.capabilities.agents),
    agents: s.agents,
    costs: { spy: sec.agentCost(state, 'spy'), saboteur: sec.agentCost(state, 'saboteur'), police: sec.policeCost(state), sabotage: sec.sabotageCost(state) },
    deployed: Object.entries(s.deployed).map(([target, count]) => ({ target, name: ctx.nationName(target), count })).sort((a, b) => (a.name < b.name ? -1 : 1)),
    police,
    queue: s.queue.map((q) => ({ id: q.id, label: queueLabel(q), daysLeft: q.daysLeft, totalDays: q.totalDays })),
    log: s.log.slice(-8).reverse().map((e) => describeLog(e, ctx)),
    incidents: s.incidents.slice(-8).reverse().map((e) => describeIncident(e, ctx)),
    // nazioni contro cui si può schierare una spia: tutte le altre con almeno un impianto
    targetNations: Object.entries(state.nations).filter(([id, n]) => id !== nationId && n.facilities.length > 0).map(([id]) => ({ id, name: ctx.nationName(id) })).sort((a, b) => (a.name < b.name ? -1 : 1)),
  };
}

/** Impianti attaccabili di una nazione (con almeno una spia schierata): righe per il pannello. */
export function sabotageRows(state, nationId, targetId, ctx) {
  return ctx.security.targetsFor(state, nationId, targetId)
    .sort((a, b) => b.level - a.level || b.chance - a.chance || (a.facilityId < b.facilityId ? -1 : 1))
    .map((t) => ({ ...t, name: `${ctx.facilityName(t.type)}${t.level > 1 ? ` (livello ${t.level})` : ''}`, placeName: ctx.placeName(t.place) }));
}
