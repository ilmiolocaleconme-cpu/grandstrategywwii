// Stima della guarnigione al 1/1/1936 dalle divisioni e brigate schierate. DESIGN_DEFAULT, non un dato storico. Funzioni PURE.
import { entityOfProvinceId } from './provinceOwner.js';

export const GARRISON_SCHEMA = 'garrison-estimate-v1';

/** Livelli per luogo: { [provinciaMadre]: 0-3, [entità]: 0-2 }. Solo i luoghi con almeno 1 unità compaiono. */
export function buildGarrisonEstimate({ deployment, units, config, entityIds }) {
  const est = config?.garrison?.estimate;
  if (!est) throw new Error('garrison.estimate mancante in security.json');
  const echelon = new Map((units ?? []).map((u) => [u.id, u.echelon]));
  const perProvince = new Map(); const perEntity = new Map();
  for (const e of deployment?.entries ?? []) {
    if (!est.echelons.includes(echelon.get(e.unit))) continue;
    perProvince.set(e.province, (perProvince.get(e.province) ?? 0) + 1);
    const ent = entityOfProvinceId(e.province, entityIds);
    if (ent) perEntity.set(ent, (perEntity.get(ent) ?? 0) + 1);
  }
  const byProvince = {}; const byEntity = {};
  for (const [p, n] of [...perProvince].sort()) byProvince[p] = { units: n, garrison: Math.min(est.provinceMax, n) };
  for (const [x, n] of [...perEntity].sort()) byEntity[x] = { units: n, garrison: est.entityThresholds.filter((t) => n >= t).length };
  return { schema: GARRISON_SCHEMA, quality: 'DESIGN_DEFAULT', note: est.note, byProvince, byEntity };
}

/** Presenza nel formato letto da createSecurity ({ byProvince: { luogo: { garrison } } }): province madri ed entità. */
export function presenceFromEstimate(file) {
  const byProvince = {};
  for (const [k, v] of Object.entries(file?.byEntity ?? {})) byProvince[k] = { garrison: v.garrison };
  for (const [k, v] of Object.entries(file?.byProvince ?? {})) byProvince[k] = { garrison: v.garrison };
  return { schema: 'province-military-v1', quality: file?.quality ?? 'DESIGN_DEFAULT', byProvince };
}

export function validateGarrisonEstimate(file) {
  if (file?.schema !== GARRISON_SCHEMA) return [`guarnigioni: schema ${file?.schema}, atteso ${GARRISON_SCHEMA}`];
  const errors = [];
  for (const [kind, max] of [['byProvince', 3], ['byEntity', 2]]) for (const [k, v] of Object.entries(file[kind] ?? {})) if (!Number.isInteger(v.garrison) || v.garrison < 0 || v.garrison > max) errors.push(`guarnigioni: livello non valido in ${k}`);
  return errors;
}
