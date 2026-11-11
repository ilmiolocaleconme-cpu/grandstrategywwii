// Regole pure dei pulsanti «i» e catena (Inquadra) sul segnalino e nell'elenco unità (decisioni dell'utente 10–11/11/2026).
// - La catena inquadra UNA unità alla volta: sul segnalino è attiva solo con una sola unità della propria nazione.
// - Con più unità si inquadra dall'elenco, con la catena su ogni scheda (variante A: nessun pulsante «Inquadra spuntate»).
// - Nessuna regola nuova di gioco: la catena apre l'elenco «Inquadra in…» che esisteva già nella scheda.

/** Stato della catena sul segnalino. `ids`: unità su cui agirebbe il menu; `own`: unità della nostra nazione. */
export function chainAction({ ids, own }) {
  if (!own) return { enabled: false, reason: 'Unità di un’altra nazione: non puoi inquadrarla.' };
  if (!ids || ids.length !== 1) return { enabled: false, reason: 'Inquadra una unità alla volta: usa la catena sulla sua scheda nell’elenco.' };
  return { enabled: true, unitId: ids[0], reason: null };
}

/**
 * Cosa mostra la scheda completa. `sheet`: false (chiusa), true (unità del segnalino) o { unitId, attach } (una unità sola,
 * con l'elenco «Inquadra in…» già aperto se `attach`). `ids`: unità del segnalino o spuntate.
 */
export function sheetTarget(sheet, ids) {
  if (!sheet) return null;
  if (sheet === true) return { ids: [...ids], attach: false };
  return { ids: [sheet.unitId], attach: Boolean(sheet.attach) };
}

/** Testo d'aiuto in cima all'elenco unità. null = nessun testo (richiesta dell'utente 10/11/2026: via quello iniziale). */
export function panelHint({ canMove, moveMode, n, orderCount }) {
  if (!canMove) return 'Unità di un’altra nazione: puoi vederle, non dare ordini.';
  if (moveMode) return `${n} ${n === 1 ? 'unità scelta' : 'unità scelte'}: tocca sulla mappa la destinazione: territorio tuo = marcia, nemico (in guerra) = attacco.`;
  if (n === 0) return null;
  return `${n} ${n === 1 ? 'unità scelta' : 'unità scelte'}${orderCount > n ? ` (${orderCount} con le forze agli ordini)` : ''}: usa il menu sul segnalino.`;
}
