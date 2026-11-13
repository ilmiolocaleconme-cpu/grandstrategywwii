// Vista dei ponti di un posto (provincia, sponda o zona): righe per il pannello. Funzioni PURE.
import { bridgeStatus } from '../rules/bridges.js';

const LABEL = { intact: 'Agibile', destroyed: 'Distrutto', repairing: 'In ripristino', mixed: 'Parziale' };

/**
 * Righe { key, other, otherName, ids, main, inferred, status, label, intact, total, blocked, canDestroy, canRepair, repairDays, doneDay }
 * per ogni coppia di posti con ponti che include `placeId`. Ordinate: prima fiumi principali, poi per nome.
 */
export function bridgeRows(index, bs, placeId, { nameOf = (x) => x, repairCfg = null, day = 0 } = {}) {
  if (!index || !placeId) return [];
  const rows = [];
  for (const [key, e] of index.byPair) {
    const [a, b] = key.split('|');
    if (a !== placeId && b !== placeId) continue;
    const other = a === placeId ? b : a;
    const st = e.ids.map((id) => bridgeStatus(bs, id));
    const intact = st.filter((s) => s === 'intact').length;
    const destroyed = st.filter((s) => s === 'destroyed').length;
    const repairing = st.filter((s) => s === 'repairing').length;
    const status = intact === st.length ? 'intact' : intact === 0 ? (repairing === st.length ? 'repairing' : 'destroyed') : 'mixed';
    const widest = e.ids.map((id) => index.byId.get(id)?.width ?? 'small').sort((x, y) => (['small', 'medium', 'large'].indexOf(y) - ['small', 'medium', 'large'].indexOf(x)))[0];
    const done = Math.max(0, ...e.ids.map((id) => bs?.repairing?.[id]?.done ?? 0));
    rows.push({
      key, other, otherName: nameOf(other), ids: e.ids, main: e.main, inferred: e.ids.every((id) => index.byId.get(id)?.inferred === true),
      status, label: LABEL[status], intact, total: e.ids.length, blocked: e.main && intact === 0,
      canDestroy: intact > 0, canRepair: destroyed > 0, repairDays: repairCfg?.repairDays?.[widest] ?? null, daysLeft: repairing > 0 ? Math.max(0, done - day) : null,
    });
  }
  return rows.sort((x, y) => Number(y.main) - Number(x.main) || (x.otherName < y.otherName ? -1 : 1));
}
