// Ricette di trasformazione (data/industry/recipes.json) e scala di estrazione (data/resources/extraction_scale.json).
// Fase 0: SOLO DATI e validazione, nessuna regola di gioco. Funzioni PURE: ricevono i file già letti.
// Riusano il catalogo esistente: la capacità e l'energia di una fabbrica restano in data/industry/factories.csv (non si duplicano qui);
// il legame prodotto → ingressi → fabbrica per acciaio e alluminio è già in PRODUCT_META (provinceResources.js): qui si controlla che coincida.
import { PRODUCT_META, RESOURCE_ORDER } from './provinceResources.js';

export const RECIPES_SCHEMA = 'recipes-v1';
export const EXTRACTION_SCALE_SCHEMA = 'extraction-scale-v1';
export const QUALITIES = Object.freeze(['DESIGN_DEFAULT', 'MISSING_DATA']);

/** Prodotti e flussi del catalogo risorse (`tipo`): ciò che si ottiene da una ricetta, non si estrae. */
export function derivedIds(resources) {
  return new Set(resources.filter((r) => r.tipo === 'prodotto' || r.tipo === 'flusso').map((r) => r.id));
}

/**
 * Errori delle ricette (lista vuota = valide).
 * ctx: { factoriesById: Map(factory_id → fabbrica con numeri), resources: [{id, tipo?}] }
 */
export function validateRecipes(file, { factoriesById, resources }) {
  const errors = [];
  if (file?.schema !== RECIPES_SCHEMA) return [`ricette: schema ${file?.schema}, atteso ${RECIPES_SCHEMA}`];
  const known = new Set(resources.map((r) => r.id));
  const derived = derivedIds(resources);
  const raw = new Set([...known].filter((id) => !derived.has(id)));
  const ids = new Set();
  const producedBy = new Map(); // prodotto → [recipe id]
  const check = (r, label, isFlow) => {
    if (typeof r.id !== 'string' || !r.id) { errors.push(`ricette: ${label} senza id`); return; }
    if (ids.has(r.id)) errors.push(`ricette: id duplicato ${r.id}`);
    ids.add(r.id);
    if (!QUALITIES.includes(r.quality)) errors.push(`ricette: ${r.id} con qualità sconosciuta "${r.quality}"`);
    if (!String(r.rationale ?? '').trim()) errors.push(`ricette: ${r.id} senza motivazione`);
    const out = r.output;
    if (!out || !derived.has(out.product)) errors.push(`ricette: ${r.id} produce "${out?.product}", che non è un prodotto o flusso del catalogo`);
    else if (!(out.perUnit > 0)) errors.push(`ricette: ${r.id} con perUnit di uscita non valido`);
    else { if (!producedBy.has(out.product)) producedBy.set(out.product, []); producedBy.get(out.product).push(r.id); }
    if (!Array.isArray(r.inputs)) { errors.push(`ricette: ${r.id} senza elenco ingressi`); return; }
    const seen = new Set();
    for (const i of r.inputs) {
      if (!known.has(i.resource)) errors.push(`ricette: ${r.id} usa ${i.resource}, che non esiste in resources.json`);
      else if (!raw.has(i.resource)) errors.push(`ricette: ${r.id} usa ${i.resource}, che non è una materia prima (niente catene tra prodotti in questa fase)`);
      if (seen.has(i.resource)) errors.push(`ricette: ${r.id} con ingresso duplicato ${i.resource}`);
      seen.add(i.resource);
      if (!(i.perUnit > 0)) errors.push(`ricette: ${r.id} con perUnit non valido per ${i.resource}`);
    }
    if (isFlow) {
      if (!known.has(r.source)) errors.push(`ricette: ${r.id} con fonte ${r.source} inesistente`);
      if (r.inputs.length > 0) errors.push(`ricette: ${r.id} è un flusso, non può consumare ingressi`);
      if (r.factory !== undefined) errors.push(`ricette: ${r.id} è un flusso, non ha una fabbrica`);
      return;
    }
    const f = factoriesById.get(r.factory);
    if (!f) { errors.push(`ricette: ${r.id} punta a una fabbrica inesistente (${r.factory})`); return; }
    if (r.inputs.length === 0) errors.push(`ricette: ${r.id} senza ingressi`);
    const cap = r.nominalOutputPerDay ?? f.base_capacity_per_day;
    if (!(cap > 0)) errors.push(`ricette: ${r.id} senza capacità giornaliera (${r.factory} ha base_capacity_per_day = ${f.base_capacity_per_day}: serve nominalOutputPerDay)`);
    if (r.nominalOutputPerDay !== undefined && f.base_capacity_per_day > 0) errors.push(`ricette: ${r.id} ridefinisce la capacità di ${r.factory}, già nel catalogo`);
  };
  for (const r of file.recipes ?? []) check(r, 'ricetta', false);
  for (const r of file.flows ?? []) check(r, 'flusso', true);
  // ogni prodotto/flusso del catalogo ha almeno una ricetta (o un flusso)
  for (const id of derived) if (!producedBy.has(id)) errors.push(`ricette: il ${id} del catalogo non ha nessuna ricetta`);
  // coerenza con il legame prodotto → fabbrica già presente (PRODUCT_META)
  for (const [pid, meta] of Object.entries(PRODUCT_META)) {
    const rec = (file.recipes ?? []).find((r) => r.output?.product === pid);
    if (!rec) continue;
    if (rec.factory !== meta.factory) errors.push(`ricette: ${rec.id} usa ${rec.factory}, PRODUCT_META di ${pid} dice ${meta.factory}`);
    const a = rec.inputs.map((i) => i.resource).sort().join('+');
    const b = [...meta.inputs].sort().join('+');
    if (a !== b) errors.push(`ricette: ${rec.id} consuma ${a}, PRODUCT_META di ${pid} dice ${b}`);
  }
  return errors;
}

/** Flussi giornalieri di una ricetta a pieno regime: { outputPerDay, inputsPerDay: {risorsa: t}, energyPerDay }. */
export function fullCapacityFlows(recipe, factory) {
  const outputPerDay = recipe.nominalOutputPerDay ?? factory.base_capacity_per_day;
  const inputsPerDay = Object.fromEntries(recipe.inputs.map((i) => [i.resource, round(i.perUnit * outputPerDay / recipe.output.perUnit)]));
  // noSelfConsumption: la centrale non consuma energia propria (il Pack le assegna un consumo che qui si ignora)
  return { outputPerDay, inputsPerDay, energyPerDay: recipe.noSelfConsumption ? 0 : factory.energy_consumption };
}

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Errori della scala di estrazione. Ogni materia prima consumata da una ricetta DEVE avere una scala;
 * una scala può essere null solo per risorse che non sono prodotti.
 */
export function validateExtractionScale(file, { recipes, resources }) {
  const errors = [];
  if (file?.schema !== EXTRACTION_SCALE_SCHEMA) return [`scala di estrazione: schema ${file?.schema}, atteso ${EXTRACTION_SCALE_SCHEMA}`];
  if (!QUALITIES.includes(file.quality)) errors.push('scala di estrazione: qualità sconosciuta');
  const derived = derivedIds(resources);
  const scale = file.unitsPerPoint ?? {};
  for (const [id, v] of Object.entries(scale)) {
    if (!resources.some((r) => r.id === id)) errors.push(`scala di estrazione: ${id} non esiste in resources.json`);
    else if (derived.has(id)) errors.push(`scala di estrazione: ${id} è un prodotto o flusso, non si estrae`);
    if (v !== null && !(v > 0)) errors.push(`scala di estrazione: ${id} con valore non valido ${JSON.stringify(v)}`);
  }
  for (const id of RESOURCE_ORDER) if (!(id in scale)) errors.push(`scala di estrazione: manca ${id} (usare null se nessuna ricetta lo consuma)`);
  const consumed = new Set((recipes.recipes ?? []).flatMap((r) => r.inputs.map((i) => i.resource)));
  for (const id of consumed) if (!(scale[id] > 0)) errors.push(`scala di estrazione: ${id} è consumata da una ricetta ma senza scala`);
  return errors;
}

/** Quantità giornaliera di una risorsa data una quantità di punti; null se la scala non è definita (mai zero silenzioso). */
export function pointsToUnits(points, resourceId, scaleFile) {
  const k = scaleFile.unitsPerPoint?.[resourceId];
  return typeof k === 'number' ? round(points * k) : null;
}
