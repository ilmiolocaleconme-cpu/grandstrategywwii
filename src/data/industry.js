// Catalogo industriale dal Data Pack (data/industry/factories.csv, data/infrastructure/structures.csv, production_categories.csv)
// e tabella provvisoria di potenziale/capacità delle province. Funzioni PURE: ricevono il testo dei CSV, non leggono file.
// Il Pack resta la fonte canonica di tipi di fabbrica, ECV e giorni: qui non si copiano i valori in codice.
import { parseCsv } from './csv.js';

export const FACTORY_CLASSES = Object.freeze(['industry', 'energy', 'agriculture']);
/** Unica classe di fabbrica che OCCUPA uno slot industriale (decisione concordata 22/10/2026, specifica sezione 2). */
export const SLOT_FACTORY_CLASS = 'industry';
export const UNIT_KINDS = Object.freeze(['province', 'city_part']);
export const BASIS_PROVISIONAL_UNIFORM = 'provisional_uniform';
const NUMERIC = ['construction_ecv', 'construction_days', 'base_capacity_per_day', 'energy_consumption', 'workers'];

/** Carica il catalogo: { factories (con numeri), byId, structures (set di id), categories (id → nome) }. */
export function loadIndustryCatalog({ factoriesCsv, structuresCsv, categoriesCsv }) {
  const factories = parseCsv(factoriesCsv, { name: 'factories.csv' }).map((f) => ({ ...f, ...Object.fromEntries(NUMERIC.map((k) => [k, Number(f[k])])) }));
  const structures = new Set(parseCsv(structuresCsv, { name: 'structures.csv' }).map((s) => s.structure_id));
  const categories = new Map(parseCsv(categoriesCsv, { name: 'production_categories.csv' }).map((c) => [c.category_id, c.name_it]));
  return { factories, byId: new Map(factories.map((f) => [f.factory_id, f])), structures, categories };
}

/** La fabbrica occupa uno slot industriale? Solo la classe `industry`; energia e agricoltura no. */
export function occupiesSlot(factory) {
  return factory.factory_class === SLOT_FACTORY_CLASS;
}

/** Una delle 5 categorie canoniche di produzione (WEAPONS, VEHICLES, ARTILLERY, AIRCRAFT, NAVAL) se la categoria della fabbrica coincide, altrimenti null. */
export function productionCategoryOf(factory, catalog) {
  const id = String(factory.category).toUpperCase();
  return catalog.categories.has(id) ? id : null;
}

export function validateIndustryCatalog(cat) {
  const errors = [];
  const seen = new Set();
  for (const f of cat.factories) {
    if (!f.factory_id) errors.push('industria: fabbrica senza factory_id');
    if (seen.has(f.factory_id)) errors.push(`industria: factory_id duplicato ${f.factory_id}`);
    seen.add(f.factory_id);
    if (!FACTORY_CLASSES.includes(f.factory_class)) errors.push(`industria: ${f.factory_id} con classe sconosciuta "${f.factory_class}"`);
    if (!cat.structures.has(f.structure_id)) errors.push(`industria: ${f.factory_id} punta a una struttura inesistente (${f.structure_id})`);
    for (const k of NUMERIC) if (!Number.isFinite(f[k]) || f[k] < 0) errors.push(`industria: ${f.factory_id} con ${k} non valido`);
    if (!f.balance_status) errors.push(`industria: ${f.factory_id} senza balance_status`);
  }
  if (!cat.factories.some(occupiesSlot)) errors.push('industria: nessuna fabbrica di classe industry');
  return errors;
}

/** Tabella potenziale/capacità: righe { unit_id, unit_kind, potential_slots, capacity_slots, basis, status }. */
export const PROVINCE_INDUSTRY_HEADER = Object.freeze(['unit_id', 'unit_kind', 'potential_slots', 'capacity_slots', 'basis', 'status']);

export function validateProvinceIndustry(rows, { motherIds, cityPartIds }) {
  const errors = [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.unit_id)) errors.push(`industria: unit_id duplicato ${r.unit_id}`);
    seen.add(r.unit_id);
    if (!UNIT_KINDS.includes(r.unit_kind)) errors.push(`industria: ${r.unit_id} con unit_kind sconosciuto "${r.unit_kind}"`);
    const known = r.unit_kind === 'province' ? motherIds : cityPartIds;
    if (!known.has(r.unit_id)) errors.push(`industria: ${r.unit_id} non esiste fra ${r.unit_kind === 'province' ? 'le province' : 'le parti di città'}`);
    const pot = Number(r.potential_slots); const cap = Number(r.capacity_slots);
    if (!Number.isInteger(pot) || pot < 0) errors.push(`industria: ${r.unit_id} con potential_slots non valido`);
    if (!Number.isInteger(cap) || cap < 0) errors.push(`industria: ${r.unit_id} con capacity_slots non valido`);
    else if (Number.isInteger(pot) && cap > pot) errors.push(`industria: ${r.unit_id} con capacità ${cap} sopra il potenziale ${pot}`);
    if (!r.basis) errors.push(`industria: ${r.unit_id} senza basis`);
    if (!r.status) errors.push(`industria: ${r.unit_id} senza status`);
  }
  return errors;
}
