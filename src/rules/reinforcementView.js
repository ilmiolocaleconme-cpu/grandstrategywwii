// Vista di sola lettura dei rinforzi di una divisione: cosa manca, cosa è in viaggio, cosa c'è in scorta. Nessuna regola nuova: legge lo stato dei rinforzi automatici.
// Uomini dal pool della nazione; cavalli e mezzi (carri, artiglieria…) dalle scorte della nazione. Un dato assente è null, mai zero inventato.
import { MANPOWER_ITEM } from './reinforcements.js';
import { EQUIPMENT_GROUP, EQUIPMENT_GROUP_LABEL } from './unitSheet.js';

const KIND_ORDER = { uomini: 0, cavalli: 1, mezzi: 2 };

/**
 * forces: stato delle forze; stocks: scorte della nazione ({ voce: quantità }); divisionId.
 * Ritorna null senza istanza di forza, altrimenti { enabled, cadre, rows } con le sole voci che mancano o sono in viaggio.
 * Riga: { item, code, kind: 'uomini'|'cavalli'|'mezzi', planned, effective, inTransit, deficit (netto del viaggio), arrivesOn (primo arrivo), stock (null per gli uomini) }.
 */
// sourcesOf(item) (facoltativo) → voci di scorta equivalenti (src/data/equipmentEquivalence.js): la scorta mostrata è la loro somma.
export function reinforcementNeeds({ forces, stocks, divisionId, sourcesOf = null }) {
  const d = forces?.divisions?.[divisionId];
  if (!d) return null;
  const rows = [];
  for (const [item, v] of Object.entries(d.items ?? {})) {
    const kind = item === MANPOWER_ITEM ? 'uomini' : item === 'horses' ? 'cavalli' : item.startsWith('equipment.') ? 'mezzi' : null;
    if (!kind || !(v.planned > 0)) continue;
    const tr = (forces.transfers ?? []).filter((t) => t.divisionId === divisionId && t.item === item);
    const inTransit = tr.reduce((s, t) => s + t.qty, 0);
    const deficit = Math.max(0, v.planned - v.effective - inTransit);
    if (deficit <= 0 && inTransit <= 0) continue;
    const arrivals = tr.map((t) => t.arrivesOn).filter(Boolean).sort();
    rows.push({
      item, code: kind === 'mezzi' ? item.slice('equipment.'.length) : item, kind, planned: v.planned, effective: v.effective, inTransit, deficit,
      arrivesOn: arrivals[0] ?? null, stock: kind === 'uomini' ? null : Math.floor((sourcesOf ? sourcesOf(item) : [item]).reduce((s, k) => s + (stocks?.[k] ?? 0), 0) + 1e-9),
    });
  }
  rows.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (b.deficit - a.deficit) || (a.item < b.item ? -1 : 1));
  return { enabled: d.reinforce !== false, cadre: d.cadre === true, priority: d.priority === true, rows };
}

/** Raggruppa le righe: Uomini, Cavalli, poi i mezzi per categoria (stessa tabella esplicita dell'equipaggiamento; le voci ignote restano «Non classificati»). */
export function reinforcementGroups(rows) {
  const groups = [];
  const push = (id, label, row) => { let g = groups.find((x) => x.id === id); if (!g) { g = { id, label, rows: [] }; groups.push(g); } g.rows.push(row); };
  for (const r of rows ?? []) {
    if (r.kind === 'uomini') push('uomini', 'Uomini', r);
    else if (r.kind === 'cavalli') push('cavalli', 'Cavalli', r);
    else { const gid = EQUIPMENT_GROUP[r.code] ?? 'non_classificati'; push(gid, EQUIPMENT_GROUP_LABEL[gid], r); }
  }
  const order = ['uomini', 'cavalli', ...Object.keys(EQUIPMENT_GROUP_LABEL)];
  return groups.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Riga di testo per una voce: «mancano 12 · in viaggio 5 (arrivo 1936-01-09) · in scorta 0». */
export function needLine(r) {
  const parts = [];
  if (r.deficit > 0) parts.push(`mancano ${r.deficit}`);
  if (r.inTransit > 0) parts.push(`in viaggio ${r.inTransit}${r.arrivesOn ? ` (arrivo ${r.arrivesOn})` : ''}`);
  if (r.stock !== null) parts.push(`in scorta ${r.stock}`);
  return parts.join(' · ');
}
