// IA diplomatica (30/10/2026). Funzione PURA e deterministica (niente Math.random). Ogni `period` giorni, sfalsata per nazione, ogni IA fa AL PIÙ UN'AZIONE:
// 1. sceglie il miglior candidato = nazione non in guerra, non già alleata, con un nemico comune (terza nazione ostile a entrambe), rapporto più alto (poi ordine alfabetico);
// 2. se il rapporto >= soglia: propone l'alleanza (a un'altra IA vale subito, con le stesse condizioni del giocatore; al giocatore è una proposta da accettare o rifiutare);
// 3. altrimenti, se il rapporto è >= 0 (non ostile), spende ECV per migliorarlo. Mai sotto la riserva.
// IMPLEMENTATO: alleanze e miglioramento dei rapporti. MANCANTE: l'IA non chiede accessi, non commercia, non dichiara guerra, non rompe alleanze.
import { atWar } from '../rules/war.js';
import { areAllied, relationOf } from '../rules/diplomacy.js';

export function createAiDiplomacy({ diplomacy }) {
  const cfg = diplomacy.config;

  function actFor(state, id) {
    const spendable = state.nations[id].balance - cfg.ai.reserveEcv;
    const candidates = Object.keys(state.nations).filter((t) => t !== id && !atWar(state.war, id, t) && !areAllied(state.diplomacy, id, t) && diplomacy.commonEnemy(state, id, t))
      .sort((a, b) => relationOf(state.diplomacy, id, b) - relationOf(state.diplomacy, id, a) || (a < b ? -1 : 1));
    for (const t of candidates) {
      const rel = relationOf(state.diplomacy, id, t);
      if (rel >= cfg.alliance.minRelation) {
        if (spendable < cfg.alliance.ecv) return state;
        if (t === state.player) { const r = diplomacy.offerAlliance(state, id, t); return r.ok ? r.state : state; }
        const r = diplomacy.proposeAlliance(state, id, t);
        return r.ok ? r.state : state;
      }
      if (rel >= 0 && spendable >= cfg.improve.ecv && t !== state.player) { const r = diplomacy.improveRelations(state, id, t); if (r.ok) return r.state; }
    }
    return state;
  }

  /** Sistema giornaliero (per GAME_SYSTEMS). */
  function aiDiplomacyDay(state) {
    if (!state.diplomacy || !state.nations) return state;
    const ids = Object.keys(state.nations).sort();
    let s = state;
    ids.forEach((id, i) => {
      if (id === s.player || (s.day + i) % cfg.ai.period !== 0) return;
      s = actFor(s, id);
    });
    return s;
  }

  return { aiDiplomacyDay, actFor };
}
