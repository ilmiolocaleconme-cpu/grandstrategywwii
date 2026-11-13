// Ponti del grafo dei collegamenti (data/links.json, ids LB_*) con STATO di partita: integro, distrutto, in ripristino. Funzioni PURE.
// Regola (utente, 13/11/2026): sui fiumi PRINCIPALI (class 'main'), se tutti i ponti fra due posti sono distrutti il passaggio è IMPOSSIBILE;
// sui fiumi minori un fiume senza ponte si forza (bonus ai difensori, vedi defenseModifiers.river). Dove i dati non hanno nessun ponte
// (rete moderna, ipotesi) il fiume si può forzare: è una lacuna dei dati, non una regola.
// Limite noto: un ponte distrutto blocca l'intera coppia di province adiacenti, anche se il loro confine non è tutto fiume.
export const BRIDGES_SCHEMA = 'bridges-v1';

export const bridgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function createBridgeState() {
  return { schema: BRIDGES_SCHEMA, destroyed: {}, repairing: {} };
}

/**
 * Indice dei ponti: { byPair: Map chiave → { ids, main }, byId: Map id → { key, riverId, width, main } }.
 * file: data/links.json; provinceIds: id delle province nell'ordine della collezione; riverOf(riverId) → { class, widthClass } o null.
 */
export function buildBridgeIndex(file, provinceIds, riverOf) {
  const links = new Map((file?.links ?? []).map((l) => [l.id, l]));
  const byPair = new Map(); const byId = new Map();
  for (const b of file?.bridges ?? []) {
    const l = links.get(b.link);
    const a = l && provinceIds[l.a]; const c = l && provinceIds[l.b];
    if (!a || !c || a === c) continue;
    const key = bridgeKey(a, c);
    const river = riverOf?.(b.riverId) ?? null;
    const main = river?.class === 'main';
    const e = byPair.get(key) ?? { ids: [], main: false };
    e.ids.push(b.id); e.main = e.main || main;
    byPair.set(key, e);
    byId.set(b.id, { key, riverId: b.riverId, width: river?.widthClass ?? 'small', main });
  }
  return { byPair, byId };
}

export function bridgeStatus(bs, id) {
  if (bs?.repairing?.[id] !== undefined) return 'repairing';
  return bs?.destroyed?.[id] !== undefined ? 'destroyed' : 'intact';
}

/** Stato del passaggio fra due posti: { bridges, intact, main, blocked }. blocked = fiume principale con ponti, tutti inagibili. */
export function pairState(index, bs, a, b) {
  const e = index?.byPair?.get(bridgeKey(a, b));
  if (!e) return { bridges: 0, intact: 0, main: false, blocked: false };
  const intact = e.ids.filter((id) => bridgeStatus(bs, id) === 'intact').length;
  return { bridges: e.ids.length, intact, main: e.main, blocked: e.main && intact === 0 };
}

/** Si può fare il passo a → b? (falso solo per un fiume principale senza ponti agibili). */
export function canStepOver(index, bs, a, b) {
  return !pairState(index, bs, a, b).blocked;
}

/** Distrugge tutti i ponti agibili fra due posti. Ritorna { bridges, destroyed: [ids] }; lancia se non c'è nessun ponte da distruggere. */
export function destroyPair(bs, index, a, b, { day }) {
  const e = index?.byPair?.get(bridgeKey(a, b));
  const ids = (e?.ids ?? []).filter((id) => bridgeStatus(bs, id) === 'intact');
  if (ids.length === 0) throw new Error('nessun ponte agibile da distruggere');
  const next = { ...bs, destroyed: { ...bs.destroyed } };
  for (const id of ids) next.destroyed[id] = { day };
  return { bridges: next, destroyed: ids };
}

/** Avvia il ripristino dei ponti distrutti fra due posti: finisce dopo i giorni della larghezza del fiume (cfg.repairDays; il più largo decide). */
export function startRepair(bs, index, a, b, { day, cfg }) {
  const e = index?.byPair?.get(bridgeKey(a, b));
  const ids = (e?.ids ?? []).filter((id) => bridgeStatus(bs, id) === 'destroyed');
  if (ids.length === 0) throw new Error('nessun ponte distrutto da ripristinare');
  const next = { ...bs, repairing: { ...bs.repairing } };
  for (const id of ids) {
    const days = cfg.repairDays[index.byId.get(id)?.width] ?? cfg.repairDays.small;
    next.repairing[id] = { done: day + days };
  }
  return { bridges: next, started: ids };
}

/** Un giorno: i ripristini arrivati a termine tornano integri. */
export function tickBridges(bs, day) {
  const due = Object.entries(bs?.repairing ?? {}).filter(([, r]) => r.done <= day).map(([id]) => id);
  if (due.length === 0) return bs;
  const destroyed = { ...bs.destroyed }; const repairing = { ...bs.repairing };
  for (const id of due) { delete destroyed[id]; delete repairing[id]; }
  return { ...bs, destroyed, repairing };
}

export function validateBridgeState(bs) {
  if (bs === undefined) return [];
  if (bs?.schema !== BRIDGES_SCHEMA) return [`ponti: schema ${JSON.stringify(bs?.schema)}`];
  const errors = [];
  for (const k of ['destroyed', 'repairing']) if (bs[k] === null || typeof bs[k] !== 'object' || Array.isArray(bs[k])) errors.push(`ponti: ${k} non è un oggetto`);
  if (errors.length) return errors;
  for (const [id, r] of Object.entries(bs.repairing)) {
    if (bs.destroyed[id] === undefined) errors.push(`ponti: ${id} in ripristino ma non distrutto`);
    if (!Number.isInteger(r?.done)) errors.push(`ponti: fine ripristino di ${id} non valida`);
  }
  return errors;
}

export function validateBridgeConfig(cfg) {
  if (cfg?.schema !== BRIDGES_SCHEMA) return ['ponti: schema del file non valido'];
  const errors = [];
  if (!['ipotesi', 'utente'].includes(cfg.basis)) errors.push('ponti: basis non valido');
  for (const w of ['small', 'medium', 'large']) if (!Number.isInteger(cfg.repairDays?.[w]) || cfg.repairDays[w] < 1) errors.push(`ponti: giorni di ripristino ${w} non validi`);
  if (cfg.repairDays?.small > cfg.repairDays?.medium || cfg.repairDays?.medium > cfg.repairDays?.large) errors.push('ponti: il ripristino non può costare meno su un fiume più largo');
  return errors;
}
