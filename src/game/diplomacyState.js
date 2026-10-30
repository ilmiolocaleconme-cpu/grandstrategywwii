// Diplomazia dentro la partita (30/10/2026). Campo OPZIONALE `state.diplomacy` (nessuna migrazione): assente = nessun rapporto, nessuna alleanza.
// Funzioni PURE. Parametri da data/diplomacy/diplomacy.json (DESIGN_DEFAULT), situazione 1936 da data/diplomacy/relations_1936.json (hypothesis).
// Collegamenti: commercio (consenso), guerra (costi diplomatici), movimento (accesso, via hasAccess in rules/diplomacy.js) e IA di sabotaggio (ostilità).
import { atWar, declareWar as warDeclare, makePeace as warPeace, createWar, pairKey } from '../rules/war.js';
import {
  createDiplomacy, relationOf, setRelation, addRelation, areAllied, alliesOf, addAlliance, removeAlliance, grantAccess, hasAccess, revokeAccess, clearAccessBetween,
  hostilesOf as rawHostiles, validateDiplomacy,
} from '../rules/diplomacy.js';
import { cancelContract } from '../rules/trade.js';

export { validateDiplomacy as validateDiplomacyShape, hasAccess };

const r3 = (x) => Math.round(x * 1000) / 1000;

/** Documento iniziale dal file del 1936: rapporti elencati, alleanze elencate, il resto neutro. */
export function buildStartDiplomacy(startDoc, date, range) {
  let d = createDiplomacy();
  for (const [a, b, v] of startDoc.relations ?? []) d = setRelation(d, a, b, v, range);
  for (const [a, b] of startDoc.alliances ?? []) d = addAlliance(d, a, b, date);
  return d;
}

export function createDiplomacyGame({ config, start }) {
  const range = { min: config.relation.min, max: config.relation.max };
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  const dip = (state) => state.diplomacy ?? createDiplomacy();
  const withDip = (state, d) => ({ ...state, diplomacy: d });
  const nationIds = (state) => Object.keys(state.nations ?? {});
  const hostileLimit = config.sabotage.maxRelation;

  /** Aggiunge `state.diplomacy` se manca (partita nuova o salvataggio vecchio). */
  const init = (state) => (state.diplomacy ? state : withDip(state, buildStartDiplomacy(start, state.date, range)));

  const relation = (state, a, b) => relationOf(state.diplomacy, a, b);
  const allied = (state, a, b) => areAllied(state.diplomacy, a, b);

  /** Il commercio tra due nazioni è consentito? Guerra o rapporto sotto soglia lo bloccano. Senza diplomazia nello stato: consentito (vecchi stati). */
  function tradeConsent(state, a, b) {
    if (!state.diplomacy) return { ok: true };
    if (atWar(state.war, a, b)) return { ok: false, reason: 'at_war' };
    const rel = relationOf(state.diplomacy, a, b);
    if (rel < config.trade.minRelation) return { ok: false, reason: 'hostile', relation: rel, min: config.trade.minRelation };
    return { ok: true, relation: rel };
  }

  /** Nazioni ostili a `id` (guerra o rapporto <= soglia di sabotaggio). Sostituisce il vecchio file provvisorio dei rivali. */
  const hostilesOf = (state, id) => rawHostiles(state.diplomacy, state.war, id, nationIds(state), hostileLimit);

  function pay(state, nationId, ecv) {
    const n = state.nations?.[nationId];
    if (!n) return fail('no_economy');
    if (!(n.balance >= ecv)) return fail('missing', { missing: [{ what: 'ecv', need: ecv, have: n.balance }] });
    return { ok: true, state: { ...state, nations: { ...state.nations, [nationId]: { ...n, balance: r3(n.balance - ecv) } } } };
  }

  const checkPair = (state, actor, target) => {
    if (!state.nations?.[actor] || !state.nations?.[target]) return fail('unknown_nation');
    if (actor === target) return fail('same_nation');
    return null;
  };

  /** Migliora i rapporti spendendo ECV. Non in guerra, non oltre il massimo. */
  function improveRelations(state, actor, target) {
    const bad = checkPair(state, actor, target); if (bad) return bad;
    if (atWar(state.war, actor, target)) return fail('at_war');
    const d = dip(state);
    if (relationOf(d, actor, target) >= config.improve.maxRelation) return fail('already_max');
    const p = pay(state, actor, config.improve.ecv); if (!p.ok) return p;
    return { ok: true, state: withDip(p.state, addRelation(d, actor, target, config.improve.gain, range)) };
  }

  /** Terza nazione ostile a entrambe (in guerra con lei o rapporto <= soglia): il "nemico comune". */
  function commonEnemy(state, a, b) {
    const ha = new Set(hostilesOf(state, a));
    return hostilesOf(state, b).find((t) => t !== a && t !== b && ha.has(t)) ?? null;
  }

  /** Proposta di alleanza. L'IA accetta se rapporto >= soglia e c'è un nemico comune. Costa ECV (solo se accettata). */
  function proposeAlliance(state, actor, target) {
    const bad = checkPair(state, actor, target); if (bad) return bad;
    if (atWar(state.war, actor, target)) return fail('at_war');
    const d = dip(state);
    if (areAllied(d, actor, target)) return fail('already_allied');
    const rel = relationOf(d, actor, target);
    if (rel < config.alliance.minRelation) return fail('relation_low', { relation: rel, min: config.alliance.minRelation });
    const enemy = commonEnemy(withDip(state, d), actor, target);
    if (!enemy) return fail('no_common_enemy');
    const p = pay(state, actor, config.alliance.ecv); if (!p.ok) return p;
    return { ok: true, enemy, state: withDip(p.state, addAlliance(dip(p.state), actor, target, state.date)) };
  }

  const proposalsOf = (state) => state.diplomacy?.proposals ?? [];

  /** Un'IA offre un'alleanza a un'altra nazione (di solito il giocatore): stesse condizioni della proposta, paga chi offre, la risposta arriva dopo. */
  function offerAlliance(state, from, to) {
    const bad = checkPair(state, from, to); if (bad) return bad;
    if (atWar(state.war, from, to)) return fail('at_war');
    const d = dip(state);
    if (areAllied(d, from, to)) return fail('already_allied');
    if (proposalsOf(state).some((x) => pairKey(x.from, x.to) === pairKey(from, to))) return fail('already_pending');
    const rel = relationOf(d, from, to);
    if (rel < config.alliance.minRelation) return fail('relation_low', { relation: rel, min: config.alliance.minRelation });
    const enemy = commonEnemy(withDip(state, d), from, to);
    if (!enemy) return fail('no_common_enemy');
    const p = pay(state, from, config.alliance.ecv); if (!p.ok) return p;
    const proposal = { id: `A-${state.day}-${from}-${to}`, from, to, kind: 'alliance', date: state.date, day: state.day, enemy };
    const d2 = dip(p.state);
    return { ok: true, proposal, state: withDip(p.state, { ...d2, proposals: [...(d2.proposals ?? []), proposal] }) };
  }

  const dropProposal = (d, id) => ({ ...d, proposals: (d.proposals ?? []).filter((x) => x.id !== id) });

  /** `actor` accetta una proposta ricevuta: nasce l'alleanza (gratis per chi accetta). */
  function acceptProposal(state, actor, id) {
    const pr = proposalsOf(state).find((x) => x.id === id);
    if (!pr || pr.to !== actor) return fail('no_proposal');
    const d = dip(state);
    if (atWar(state.war, pr.from, pr.to)) return { ok: false, reason: 'at_war', state: withDip(state, dropProposal(d, id)) };
    if (areAllied(d, pr.from, pr.to)) return { ok: false, reason: 'already_allied', state: withDip(state, dropProposal(d, id)) };
    return { ok: true, state: withDip(state, addAlliance(dropProposal(d, id), pr.from, pr.to, state.date)) };
  }

  /** `actor` rifiuta: la proposta cade e il rapporto cala un poco (rejectPenalty). */
  function rejectProposal(state, actor, id) {
    const pr = proposalsOf(state).find((x) => x.id === id);
    if (!pr || pr.to !== actor) return fail('no_proposal');
    return { ok: true, state: withDip(state, addRelation(dropProposal(dip(state), id), pr.from, pr.to, config.proposals.rejectPenalty, range)) };
  }

  /** Rompe un'alleanza: -30 (soglia dell'utente) con l'ex alleato, accesso reciproco revocato. */
  function breakAlliance(state, actor, ally) {
    const bad = checkPair(state, actor, ally); if (bad) return bad;
    const d = dip(state);
    if (!areAllied(d, actor, ally)) return fail('not_allied');
    return { ok: true, state: withDip(state, addRelation(clearAccessBetween(removeAlliance(d, actor, ally), actor, ally), actor, ally, config.alliance.breakPenalty, range)) };
  }

  /** Chiede di poter muovere truppe nel territorio di `host`. Serve rapporto >= soglia; costa ECV. */
  function requestAccess(state, actor, host) {
    const bad = checkPair(state, actor, host); if (bad) return bad;
    if (atWar(state.war, actor, host)) return fail('at_war');
    const d = dip(state);
    if (hasAccess(d, actor, host)) return fail('already_has');
    const rel = relationOf(d, actor, host);
    if (rel < config.access.minRelation) return fail('relation_low', { relation: rel, min: config.access.minRelation });
    const p = pay(state, actor, config.access.ecv); if (!p.ok) return p;
    return { ok: true, state: withDip(p.state, grantAccess(dip(p.state), actor, host, state.date)) };
  }

  /** `host` ritira l'accesso concesso a `holder` (non vale per le alleanze: vanno rotte). */
  function revokeAccessTo(state, host, holder) {
    const d = dip(state);
    if (!d.access[`${holder}>${host}`]) return fail('no_agreement');
    return { ok: true, state: withDip(state, revokeAccess(d, holder, host)) };
  }

  function cancelBetween(state, a, b) {
    if (!state.trade?.contracts?.length) return state;
    let trade = state.trade;
    for (const c of trade.contracts) {
      if ((c.status === 'active' || c.status === 'suspended') && pairKey(c.seller, c.buyer) === pairKey(a, b)) { const r = cancelContract(trade, c.id); if (r.ok) trade = r.state; }
    }
    return trade === state.trade ? state : { ...state, trade };
  }

  /**
   * Dichiarazione di guerra con costi diplomatici: la vittima scende di `victimPenalty` con l'aggressore, i suoi alleati di `victimAlliesPenalty`;
   * accessi tra le due parti revocati e contratti commerciali annullati. Non si dichiara guerra a un alleato (va prima rotta l'alleanza).
   */
  function declareWar(state, actor, target) {
    const bad = checkPair(state, actor, target); if (bad) return bad;
    if (atWar(state.war, actor, target)) return fail('already_at_war');
    const base = init(state);
    let d = base.diplomacy;
    if (areAllied(d, actor, target)) return fail('allied');
    d = clearAccessBetween(addRelation(d, actor, target, config.war.victimPenalty, range), actor, target);
    for (const ally of alliesOf(d, target)) if (ally !== actor) d = addRelation(d, actor, ally, config.war.victimAlliesPenalty, range);
    const war = warDeclare(base.war ?? createWar(), { a: actor, b: target, date: state.date });
    return { ok: true, state: cancelBetween({ ...base, war, diplomacy: d }, actor, target) };
  }

  /** Pace: possibile solo se il rapporto non è disperato; dopo la pace il rapporto resta ostile (afterPeaceRelation). */
  function makePeace(state, actor, target) {
    const bad = checkPair(state, actor, target); if (bad) return bad;
    if (!atWar(state.war, actor, target)) return fail('not_at_war');
    const d = dip(state);
    const rel = relationOf(d, actor, target);
    if (rel <= config.war.peaceMinRelation) return fail('hopeless', { relation: rel, min: config.war.peaceMinRelation });
    return { ok: true, state: { ...state, war: warPeace(state.war, { a: actor, b: target }), diplomacy: setRelation(d, actor, target, config.war.afterPeaceRelation, range) } };
  }

  /** Sistema giornaliero: in guerra i rapporti scendono; il commercio regolare li fa salire piano (fino al tetto); i contratti vietati vengono annullati. */
  function diplomacyDay(state) {
    if (!state.diplomacy) return state;
    let s = state;
    let d = state.diplomacy;
    const touched = new Set();
    for (const k of Object.keys(state.war?.pairs ?? {})) { const [a, b] = k.split('|'); d = addRelation(d, a, b, config.war.dailyDrift, range); }
    for (const c of state.trade?.contracts ?? []) {
      if (c.status !== 'active') continue;
      const k = pairKey(c.seller, c.buyer);
      if (touched.has(k)) continue;
      touched.add(k);
      if (!tradeConsent({ ...s, diplomacy: d }, c.seller, c.buyer).ok) continue;
      if (relationOf(d, c.seller, c.buyer) < config.trade.gainCap) d = addRelation(d, c.seller, c.buyer, config.trade.dailyGain, range);
    }
    d = { ...d, proposals: (d.proposals ?? []).filter((x) => state.day - (x.day ?? state.day) < config.proposals.expireDays) }; // le proposte senza risposta scadono
    s = { ...s, diplomacy: d };
    for (const c of s.trade?.contracts ?? []) {
      if ((c.status === 'active' || c.status === 'suspended') && !tradeConsent(s, c.seller, c.buyer).ok) s = cancelBetween(s, c.seller, c.buyer);
    }
    return s;
  }

  return { init, offerAlliance, acceptProposal, rejectProposal, proposalsOf, relation, allied, tradeConsent, hostilesOf, commonEnemy, improveRelations, proposeAlliance, breakAlliance, requestAccess, revokeAccessTo, declareWar, makePeace, diplomacyDay, config };
}

