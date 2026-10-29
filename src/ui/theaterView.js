// Vista pura degli incarichi di teatro: segni sulla mappa e schede per il pannello. Nessun React né DOM (testata in tests/theater_view.test.js).
import { activeAssignments } from '../rules/theater.js';

export const MARK_STYLES = Object.freeze({
  attack: { color: '#e0483b', fill: 'rgba(224,72,59,0.20)', width: 3, dash: [7, 4] },
  defend: { color: '#3d8bdc', fill: 'rgba(61,139,220,0.20)', width: 3, dash: [7, 4] },
  pick: { color: '#f2c14e', fill: 'rgba(242,193,78,0.32)', width: 3.5, dash: null },
});

/**
 * Segni da disegnare: { [provincia madre]: stile }. Priorità crescente: province occupate (contorno nel colore dell'occupante) <
 * obiettivi degli incarichi attivi del giocatore < province che si stanno scegliendo. `colorOf(nazione)` dà il colore politico.
 */
export function theaterMarks({ state, pick = [], pickKind = 'attack', colorOf }) {
  const marks = {};
  for (const [id, p] of Object.entries(state?.provinces ?? {})) {
    if (p.occupation === 'occupied' && p.controller) marks[id] = { color: colorOf(p.controller), fill: null, width: 3, dash: [2, 3] };
  }
  if (state?.theaters) {
    for (const a of activeAssignments(state.theaters)) {
      if (a.nation !== state.player) continue;
      for (const p of a.provinces) marks[p] = MARK_STYLES[a.kind];
    }
  }
  for (const p of pick) marks[p] = MARK_STYLES.pick;
  void pickKind;
  return marks;
}

const KIND_LABEL = { attack: 'Attacco', defend: 'Difesa' };

/** Scheda di un incarico per il pannello: nome, tipo, obiettivi con stato, unità e dove si trovano. */
export function describeAssignment(a, { net, positionOf, controllerOf, unitName, effectiveOf }) {
  const objectives = a.provinces.map((p) => {
    const c = controllerOf(p);
    return { id: p, name: net.name(p), controller: c, done: a.kind === 'attack' ? c === a.nation : true };
  });
  const units = a.units.map((u) => {
    const pos = positionOf(u);
    return { id: u, name: unitName(u), at: pos ? net.name(pos) : null, effective: effectiveOf(u) };
  });
  return { id: a.id, name: a.name, kind: a.kind, kindLabel: KIND_LABEL[a.kind], status: a.status, since: a.since, objectives, units,
    taken: objectives.filter((o) => o.done).length };
}
