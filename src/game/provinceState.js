// Stato DINAMICO delle province, separato dai dati storici (data/). Vive in `state.provinces`: mappa SPARSA
// { [id provincia madre]: { ...solo i campi diversi dal default } }. Assente = tutto al valore di default, quindi
// un salvataggio vecchio senza `provinces` resta valido (nessuna migrazione dello schema).
// Funzioni PURE: stesso ingresso, stesso risultato; non modificano lo stato ricevuto.

export const OCCUPATION_STATUSES = Object.freeze(['none', 'occupied', 'contested']);

const level = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const ratio = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const flag = (v) => typeof v === 'boolean';

/** Campi ammessi, con default e controllo. `controller: null` = segue il controllo della nazione proprietaria. */
export const PROVINCE_STATE_FIELDS = Object.freeze({
  controller: { default: null, check: (v) => v === null || (typeof v === 'string' && v !== '') },
  occupation: { default: 'none', check: (v) => OCCUPATION_STATUSES.includes(v) },
  stability: { default: null, check: (v) => v === null || level(v) },
  resistance: { default: 0, check: level },
  damage: { default: 0, check: ratio },
  bombing: { default: 0, check: ratio },
  infrastructureDamage: { default: 0, check: ratio },
  powerShortage: { default: false, check: flag },
  workforceShortage: { default: false, check: flag },
  resourceShortage: { default: false, check: flag },
  isolated: { default: false, check: flag },
  logisticProblems: { default: false, check: flag },
  weatherEffects: { default: [], check: (v) => Array.isArray(v) && v.every((e) => typeof e === 'string' && e !== '') },
  combatEffects: { default: [], check: (v) => Array.isArray(v) && v.every((e) => typeof e === 'string' && e !== '') },
  events: { default: [], check: (v) => Array.isArray(v) && v.every((e) => e && typeof e.id === 'string' && typeof e.date === 'string') },
});

/** Stato completo di una provincia: i default più quanto salvato. */
export function provinceStateOf(state, id) {
  const defaults = Object.fromEntries(Object.entries(PROVINCE_STATE_FIELDS).map(([k, f]) => [k, f.default]));
  return { ...defaults, ...(state?.provinces?.[id] ?? {}) };
}

/**
 * Nuovo stato con `patch` applicato alla provincia `id`. Lancia RangeError su campo sconosciuto o valore non valido
 * (mai un dato a caso). I campi riportati al default escono dalla mappa sparsa.
 */
export function patchProvinceState(state, id, patch) {
  if (typeof id !== 'string' || id === '') throw new RangeError('patchProvinceState: id mancante');
  for (const [k, v] of Object.entries(patch)) {
    const f = PROVINCE_STATE_FIELDS[k];
    if (!f) throw new RangeError(`patchProvinceState: campo sconosciuto "${k}"`);
    if (!f.check(v)) throw new RangeError(`patchProvinceState: valore non valido per ${k}`);
  }
  const merged = { ...(state.provinces?.[id] ?? {}), ...patch };
  for (const [k, f] of Object.entries(PROVINCE_STATE_FIELDS)) {
    if (k in merged && JSON.stringify(merged[k]) === JSON.stringify(f.default)) delete merged[k];
  }
  const provinces = { ...(state.provinces ?? {}) };
  if (Object.keys(merged).length === 0) delete provinces[id];
  else provinces[id] = merged;
  return { ...state, provinces };
}

/** Errori di coerenza della mappa `provinces` di uno stato (lista vuota = valido). `motherIds` facoltativo. */
export function validateProvinceStates(provinces, { motherIds = null } = {}) {
  if (provinces === undefined) return [];
  if (provinces === null || typeof provinces !== 'object' || Array.isArray(provinces)) return ['stato: provinces non è un oggetto'];
  const errors = [];
  const known = motherIds ? new Set(motherIds) : null;
  for (const [id, entry] of Object.entries(provinces)) {
    if (known && !known.has(id)) errors.push(`stato: provinces["${id}"] non è una provincia madre`);
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`stato: provinces["${id}"] non è un oggetto`); continue; }
    for (const [k, v] of Object.entries(entry)) {
      const f = PROVINCE_STATE_FIELDS[k];
      if (!f) errors.push(`stato: provinces["${id}"] ha il campo sconosciuto "${k}"`);
      else if (!f.check(v)) errors.push(`stato: provinces["${id}"].${k} non valido`);
    }
  }
  return errors;
}
