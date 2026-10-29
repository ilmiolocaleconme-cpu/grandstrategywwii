// Condizione delle divisioni: esperienza, morale e prontezza (valori DISTINTI, 0–100) e stato operativo DERIVATO.
// Funzioni PURE e deterministiche. Parametri in data/units/condition_config.json (decisioni dell'utente del 29/10/2026).
// MODELLO (fusione scelta dall'utente il 29/10/2026): esperienza, morale e PRONTEZZA (= organizzazione/preparazione) sono valori memorizzati
// 0–100; la forza materiale (uomini, dotazione) NON è prontezza ma componente dello STATO OPERATIVO, derivato come il peggiore tra le componenti.
// REGOLE ATTIVE: valori iniziali; addestramento delle sole unità nuove (+perMonth al mese fino al tetto).
// NON MODELLATI (mancano combattimento, rifornimenti, fronti, prestigio, sanità collegata): esperienza sul campo, variazioni di morale e
// prontezza (riposo, vittorie, perdite, ufficiali catturati o uccisi), munizioni/carburante/rifornimenti nello stato operativo, effetti della politica d'impiego, rimpiazzi che abbassano l'esperienza.

export const CONDITION_SCHEMA = 'conditions-v1'; // campo state.conditions
export const CONDITION_CONFIG_SCHEMA = 'condition-v1'; // data/units/condition_config.json
export const POLICIES = Object.freeze(['conservative', 'normal', 'aggressive']);

export function createConditionState() {
  return { schema: CONDITION_SCHEMA, byUnit: {} };
}

export const clamp = (v, min = 0, max = 100) => Math.min(max, Math.max(min, v));

export function validateConditionConfig(cfg) {
  const errors = [];
  if (cfg?.schema !== CONDITION_CONFIG_SCHEMA) errors.push(`condizione: schema ${JSON.stringify(cfg?.schema)}`);
  const lv = cfg?.levels ?? [];
  let expect = cfg?.range?.min ?? 0;
  for (const l of lv) {
    if (l.from !== expect) errors.push(`condizione: il livello ${l.level} inizia a ${l.from}, atteso ${expect}`);
    if (l.to < l.from) errors.push(`condizione: livello ${l.level} con intervallo vuoto`);
    expect = l.to + 1;
  }
  if (lv.length && expect !== (cfg.range?.max ?? 100) + 1) errors.push('condizione: i livelli non coprono tutto l\'intervallo');
  for (const k of ['existing1936', 'newUnit']) {
    for (const f of ['experience', 'morale', 'readiness']) {
      const v = cfg?.initial?.[k]?.[f];
      if (!(v >= 0 && v <= 100)) errors.push(`condizione: iniziale ${k}.${f} fuori da 0–100`);
    }
  }
  if (!(cfg?.training?.perMonth > 0) || !(cfg?.training?.newUnitCap >= 0 && cfg.training.newUnitCap <= 100)) errors.push('condizione: addestramento non valido');
  if (cfg?.initial?.newUnit?.experience > cfg?.training?.newUnitCap) errors.push('condizione: le unità nuove partono sopra il tetto di addestramento');
  const mt = cfg?.training?.morale;
  if (mt && (mt.from > mt.cap || !(mt.cap <= 100) || !(mt.months > 0))) errors.push('condizione: morale del reclutamento non valido');
  const b = cfg?.operationalStates?.bands ?? {};
  for (const c of ['manpower', 'equipment', 'morale', 'readiness']) {
    const x = b[c];
    if (!x || !(x.ready > x.reduced && x.reduced > x.inefficient && x.inefficient > 0)) errors.push(`condizione: soglie di ${c} non decrescenti`);
  }
  if (!POLICIES.includes(cfg?.policy?.default)) errors.push('condizione: politica predefinita non valida');
  return errors;
}

/** Livello di esperienza { level, name } per un valore 0–100. */
export function experienceLevel(value, cfg) {
  const v = Math.round(clamp(value));
  return cfg.levels.find((l) => v >= l.from && v <= l.to);
}

/** Condizione di un'unità: valori memorizzati, altrimenti iniziali (il morale iniziale del 1936 dipende dalla nazione `nation`). Ritorna { experience, morale, policy, isNew, stored }. */
export function conditionOf(conditions, unitId, cfg, nation = null) {
  const e = conditions?.byUnit?.[unitId];
  const base = e?.isNew ? cfg.initial.newUnit : { ...cfg.initial.existing1936, morale: cfg.initial.existing1936.moraleByNation?.[nation] ?? cfg.initial.existing1936.morale };
  return {
    experience: clamp(e?.experience ?? base.experience), morale: clamp(e?.morale ?? base.morale), readiness: clamp(e?.readiness ?? base.readiness),
    policy: e?.policy ?? cfg.policy.default, isNew: e?.isNew === true, trainedThrough: e?.trainedThrough ?? null, stored: e !== undefined,
  };
}

/** Segna unità come NUOVE (da usare alla mobilitazione/creazione): partono dai valori delle unità nuove. */
export function markNew(conditions, unitIds, cfg, date) {
  const byUnit = { ...conditions.byUnit };
  for (const id of unitIds) byUnit[id] = { experience: cfg.initial.newUnit.experience, morale: cfg.initial.newUnit.morale, readiness: cfg.initial.newUnit.readiness, policy: byUnit[id]?.policy ?? cfg.policy.default, isNew: true, trainedThrough: date.slice(0, 7) };
  return { ...conditions, byUnit };
}

export function setPolicy(conditions, unitId, policy, cfg, nation = null) {
  if (!POLICIES.includes(policy)) throw new RangeError(`politica non valida: ${policy}`);
  const cur = conditionOf(conditions, unitId, cfg, nation);
  return { ...conditions, byUnit: { ...conditions.byUnit, [unitId]: { experience: cur.experience, morale: cur.morale, readiness: cur.readiness, policy, isNew: cur.isNew, trainedThrough: cur.trainedThrough } } };
}

const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));

/**
 * Addestramento fino alla data: per ogni mese NUOVO trascorso dall'ultimo conteggio (trainedThrough) le unità nuove guadagnano
 * perMonth fino al tetto. Idempotente: richiamarlo due volte con la stessa data non cambia nulla. Le altre unità non si toccano.
 */
export function trainUntil(conditions, date, cfg) {
  const now = date.slice(0, 7);
  let changed = false;
  const byUnit = {};
  for (const [id, e] of Object.entries(conditions.byUnit)) {
    if (!e.isNew || !e.trainedThrough || monthIndex(now) <= monthIndex(e.trainedThrough)) { byUnit[id] = e; continue; }
    const months = monthIndex(now) - monthIndex(e.trainedThrough);
    const cap = cfg.training.newUnitCap;
    const experience = e.experience >= cap ? e.experience : clamp(Math.min(cap, e.experience + months * cfg.training.perMonth));
    // morale del reclutamento: sale in modo lineare da `from` a `cap` in `months` mesi (poi si ferma)
    const mt = cfg.training.morale;
    const step = mt && mt.months > 0 ? (mt.cap - mt.from) / mt.months : 0;
    const morale = step > 0 && e.morale < mt.cap ? Math.round(clamp(Math.min(mt.cap, e.morale + months * step)) * 100) / 100 : e.morale;
    byUnit[id] = { ...e, experience, morale, trainedThrough: now };
    changed = true;
  }
  return changed ? { ...conditions, byUnit } : conditions;
}

/** Forza materiale 0–100: il rapporto più basso tra uomini e voci di dotazione, con la causa. NON è la prontezza: è una componente dello stato operativo. */
export function materialStrength({ manpowerRatio, equipment }) {
  const parts = [];
  if (manpowerRatio !== null && manpowerRatio !== undefined) parts.push({ cause: 'uomini', ratio: manpowerRatio });
  for (const e of equipment ?? []) parts.push({ cause: e.item, ratio: e.ratio });
  if (!parts.length) return { value: null, cause: null };
  const worst = [...parts].sort((a, b) => (a.ratio - b.ratio) || (a.cause < b.cause ? -1 : 1))[0];
  return { value: Math.round(clamp(worst.ratio * 100)), cause: worst.cause };
}

/** Fascia descrittiva (Eccellente…Collasso) di un valore di morale o prontezza. */
export function valueBand(value, cfg) {
  const v = Math.round(clamp(value));
  return cfg.valueBands.bands.find((b) => v >= b.from && v <= b.to);
}

function bandOf(value, band) {
  if (value >= band.ready) return 0;
  if (value >= band.reduced) return 1;
  if (value >= band.inefficient) return 2;
  return 3;
}

/**
 * Stato operativo DERIVATO (mai memorizzato): il peggiore tra organico, equipaggiamento, morale, prontezza.
 * input: { manpowerRatio, equipmentWorstRatio, morale, readiness, cadre }. Ritorna { id, name, cause }.
 * Componenti sconosciute (null) non entrano nel calcolo. Un quadro è sempre «Non operativa» (non pronto al combattimento).
 */
export function operationalState(input, cfg) {
  const labels = cfg.operationalStates.labels;
  if (input.cadre && cfg.operationalStates.cadreIsNotOperational) return { ...labels[3], cause: 'quadro (non pronto al combattimento)' };
  const bands = cfg.operationalStates.bands;
  const comps = [
    ['organico', input.manpowerRatio === null || input.manpowerRatio === undefined ? null : input.manpowerRatio * 100, bands.manpower],
    ['equipaggiamento', input.equipmentWorstRatio === null || input.equipmentWorstRatio === undefined ? null : input.equipmentWorstRatio * 100, bands.equipment],
    ['morale', input.morale, bands.morale],
    ['prontezza', input.readiness, bands.readiness],
  ].filter((c) => c[1] !== null && c[1] !== undefined);
  let worst = { idx: -1, cause: null };
  for (const [name, v, band] of comps) {
    const idx = bandOf(v, band);
    if (idx > worst.idx) worst = { idx, cause: `${name} ${Math.round(v)}` };
  }
  return worst.idx < 0 ? { id: 'unknown', name: 'Sconosciuto', cause: 'nessun dato' } : { ...labels[worst.idx], cause: worst.idx === 0 ? null : worst.cause };
}

/** Errori di forma del campo `state.conditions` (opzionale). */
export function validateConditionState(c) {
  if (c === undefined) return [];
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return ['condizione: non è un oggetto'];
  const errors = [];
  if (c.schema !== CONDITION_SCHEMA) errors.push(`condizione: schema ${JSON.stringify(c.schema)}`);
  if (c.byUnit === null || typeof c.byUnit !== 'object') return [...errors, 'condizione: byUnit mancante'];
  for (const [id, e] of Object.entries(c.byUnit)) {
    for (const f of ['experience', 'morale', 'readiness']) if (!(e?.[f] >= 0 && e[f] <= 100)) errors.push(`condizione: ${id} ${f} fuori da 0–100`);
    if (!POLICIES.includes(e?.policy)) errors.push(`condizione: ${id} politica non valida`);
    if (typeof e?.isNew !== 'boolean') errors.push(`condizione: ${id} isNew non booleano`);
  }
  return errors;
}
