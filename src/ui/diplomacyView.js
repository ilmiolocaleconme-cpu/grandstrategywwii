// Dati per il pannello Diplomazia (30/10/2026). Nessuna regola qui: solo etichette, righe e messaggi.
import { atWar } from '../rules/war.js';
import { relationOf, areAllied, hasAccess } from '../rules/diplomacy.js';

/** Etichetta del rapporto, allineata alle soglie di gioco (commercio -20, sabotaggio -40, alleanza +40). */
export function relationLabel(v, cfg) {
  if (v <= cfg.sabotage.maxRelation) return 'Ostile';
  if (v < cfg.trade.minRelation) return 'Teso';
  if (v < cfg.access.minRelation) return 'Neutrale';
  if (v < cfg.alliance.minRelation) return 'Buono';
  return 'Ottimo';
}

export function describeDiplomacyFailure(reason, x = {}) {
  switch (reason) {
    case 'missing': return `ECV insufficienti (servono ${x.missing?.[0]?.need}, hai ${Math.round((x.missing?.[0]?.have ?? 0) * 10) / 10})`;
    case 'at_war': return 'Siete in guerra';
    case 'already_max': return 'Il rapporto è già al massimo consentito per questa azione';
    case 'already_allied': return 'Siete già alleati';
    case 'relation_low': return `Rapporto troppo basso (${Math.round(x.relation)}, ne servono almeno ${x.min})`;
    case 'no_common_enemy': return 'Manca un nemico comune: nessuna terza nazione ostile a entrambi';
    case 'not_allied': return 'Non siete alleati';
    case 'already_has': return 'Hai già il permesso di accesso';
    case 'no_agreement': return 'Nessun accordo di accesso da ritirare';
    case 'allied': return 'Non si dichiara guerra a un alleato: rompi prima l\'alleanza';
    case 'already_at_war': return 'Siete già in guerra';
    case 'not_at_war': return 'Non siete in guerra';
    case 'hopeless': return `Rapporto troppo compromesso per la pace (${Math.round(x.relation)}, serve oltre ${x.min})`;
    case 'no_proposal': return 'La proposta non c\'è più (scaduta o già risolta)';
    case 'already_pending': return 'C\'è già una proposta in attesa';
    case 'unknown_nation': return 'Nazione sconosciuta';
    case 'same_nation': return 'Nazione non valida';
    case 'no_economy': return 'Economia non inizializzata';
    default: return `Azione rifiutata (${reason})`;
  }
}

/** Situazione tra `player` e `target`. */
export function pairView(state, player, target, cfg, nationName) {
  const d = state.diplomacy;
  const rel = relationOf(d, player, target);
  const war = atWar(state.war, player, target);
  const allied = areAllied(d, player, target);
  return {
    id: target, name: nationName(target), relation: rel, label: relationLabel(rel, cfg), war, allied,
    myAccess: hasAccess(d, player, target), theirAccess: hasAccess(d, target, player),
    agreedAccess: Boolean(d?.access?.[`${player}>${target}`]), grantedAccess: Boolean(d?.access?.[`${target}>${player}`]),
    canTrade: !war && rel >= cfg.trade.minRelation,
  };
}

/** Le relazioni che contano (guerre, alleati, accessi, rapporti marcati), in ordine di nome. */
export function notableRows(state, player, cfg, nationName) {
  const ids = new Set();
  const d = state.diplomacy;
  for (const k of Object.keys(d?.relations ?? {})) { const [a, b] = k.split('|'); if (a === player) ids.add(b); else if (b === player) ids.add(a); }
  for (const k of Object.keys(d?.alliances ?? {})) { const [a, b] = k.split('|'); if (a === player) ids.add(b); else if (b === player) ids.add(a); }
  for (const k of Object.keys(d?.access ?? {})) { const [a, b] = k.split('>'); if (a === player) ids.add(b); else if (b === player) ids.add(a); }
  for (const k of Object.keys(state.war?.pairs ?? {})) { const [a, b] = k.split('|'); if (a === player) ids.add(b); else if (b === player) ids.add(a); }
  return [...ids].filter((id) => state.nations?.[id]).map((id) => pairView(state, player, id, cfg, nationName)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
