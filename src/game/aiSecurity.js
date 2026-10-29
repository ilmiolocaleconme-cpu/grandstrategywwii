// IA per ricerca, difesa e sabotaggio. Funzione PURA e deterministica (nessun Math.random, nessun Date.now): usa solo gli ordini del giocatore (research.start, security.*).
// IMPLEMENTATO: scelta della ricerca, polizia militare nei luoghi con più impianti, spie → sabotatori → sabotaggio contro i rivali.
// PROVVISORIO: i rivali vengono da data/security/ai_rivals_1936.json (hypothesis), perché non esiste ancora un sistema diplomatico né di guerra.
// MANCANTE: l'IA non migliora ancora le fabbriche, non commercia, non muove unità e non usa la diplomazia.
import { roll01 } from '../rules/security.js';
import { securityOf } from './securityState.js';

export const AI_DEFAULTS = Object.freeze({ period: 10, reserveEcv: 150, policePerPlace: 2 });

/** Rivali di una nazione dal file delle coppie (la relazione è simmetrica). */
export function rivalsOf(rivalsFile, id) {
  const out = new Set();
  for (const [a, b] of rivalsFile?.pairs ?? []) { if (a === id) out.add(b); if (b === id) out.add(a); }
  return [...out].sort();
}

export function createAiSecurity({ research, security, rivals, options = {} }) {
  const o = { ...AI_DEFAULTS, ...options };

  function actFor(state, id) {
    let s = state;
    const my = () => s.nations[id];
    const enemies = rivalsOf(rivals, id).filter((t) => s.nations[t]);
    const involved = enemies.length > 0;
    const spendable = () => my().balance - o.reserveEcv;

    // 1. ricerca: chi ha rivali parte dalla sicurezza, gli altri dall'industria
    if (!my().research?.active) {
      const list = research.listFor(s, id).filter((x) => x.status === 'available' && x.cost.ecv <= spendable());
      const rank = (x) => (x.tech.branch === 'security') === involved ? 0 : 1;
      const pick = [...list].sort((a, b) => rank(a) - rank(b) || (a.tech.id < b.tech.id ? -1 : 1))[0];
      if (pick) s = research.start(s, id, pick.tech.id).state;
    }
    if (!involved) return s;

    // 2. difesa: polizia militare dove ci sono più impianti
    if (spendable() >= security.policeCost(s).ecv) {
      const counts = new Map();
      for (const f of my().facilities) counts.set(security.placeOf(f), (counts.get(security.placeOf(f)) ?? 0) + 1);
      const sec = securityOf(my());
      const queued = (p) => sec.queue.filter((q) => q.kind === 'mp' && q.place === p).length;
      const place = [...counts].filter(([p]) => (sec.mp[p] ?? 0) + queued(p) < o.policePerPlace).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
      if (place) { const r = security.trainMilitaryPolice(s, id, place); if (r.ok) s = r.state; }
    }

    // 3. attacco: spie → sabotatori → sabotaggio, contro ogni rivale con impianti
    if (!security.canAgents(my())) return s;
    // Finché non c'è la diplomazia l'IA non sabota il giocatore (scelta dell'utente): colpisce solo altre IA.
    for (const t of enemies) {
      if (t === s.player) continue;
      if (!s.nations[t].facilities.length) continue;
      let sec = securityOf(my());
      const queuedRole = (role) => sec.queue.filter((q) => q.kind === 'train' && q.role === role).length;
      if ((sec.deployed[t] ?? 0) < 1) {
        if (sec.agents.spy > 0) { const r = security.deploySpy(s, id, t); if (r.ok) s = r.state; }
        else if (!queuedRole('spy') && spendable() >= security.agentCost(s, 'spy').ecv) { const r = security.train(s, id, 'spy'); if (r.ok) s = r.state; }
        continue;
      }
      if (sec.agents.saboteur < 1) {
        if (!queuedRole('saboteur') && spendable() >= security.agentCost(s, 'saboteur').ecv) { const r = security.train(s, id, 'saboteur'); if (r.ok) s = r.state; }
        continue;
      }
      const busy = new Set(sec.queue.filter((q) => q.kind === 'op').map((q) => q.facilityId));
      const target = security.targetsFor(s, id, t).filter((x) => x.damage < 0.7 && !busy.has(x.facilityId))
        .sort((a, b) => b.level - a.level || b.chance - a.chance || (a.facilityId < b.facilityId ? -1 : 1))[0];
      if (target && spendable() >= security.sabotageCost(s).ecv) { const r = security.sabotage(s, id, { targetNation: t, facilityId: target.facilityId }); if (r.ok) s = r.state; }
    }
    return s;
  }

  /** Sistema giornaliero: ogni nazione controllata dall'IA (tutte tranne il giocatore) decide una volta ogni `period` giorni, con uno sfasamento fisso per nazione. */
  function aiDay(state) {
    if (!state.nations) return state;
    let s = state;
    for (const id of Object.keys(state.nations).sort()) {
      if (id === state.player) continue;
      const offset = Math.floor(roll01('ai', id) * o.period);
      if ((state.day + offset) % o.period !== 0) continue;
      s = actFor(s, id);
    }
    return s;
  }

  return { aiDay, actFor };
}
