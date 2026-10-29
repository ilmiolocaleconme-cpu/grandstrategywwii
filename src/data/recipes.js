// Ricette di trasformazione (data/industry/recipes.json) e scala di estrazione (data/resources/extraction_scale.json).
// Gli ingressi di una ricetta sono materie prime o altri prodotti (senza cicli); l'energia non è mai un ingresso materiale.
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
      else if (i.resource === 'hydro' || i.resource === 'electricity') errors.push(`ricette: ${r.id} usa ${i.resource} come ingresso: l'energia è un flusso, non un materiale`);
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
    // prodotti a PEZZI (carri, artiglieria): capacità in pezzi al giorno = capacità della fabbrica (t di lavorazione) / peso del pezzo
    const resDef = resources.find((x) => x.id === r.output?.product);
    const pieces = resDef?.unit === 'pezzi';
    if (pieces !== (r.outputUnit === 'pieces/day')) errors.push(`ricette: ${r.id} ${pieces ? 'produce un prodotto a pezzi: serve outputUnit "pieces/day"' : 'usa outputUnit "pieces/day" ma il prodotto non è a pezzi'}`);
    if (pieces) {
      if (!(r.massTonnes > 0)) errors.push(`ricette: ${r.id} produce pezzi ma non ha un peso del pezzo (massTonnes) valido`);
      if (r.output?.perUnit !== 1) errors.push(`ricette: ${r.id} produce pezzi: perUnit di uscita deve essere 1`);
    } else if ('massTonnes' in r) errors.push(`ricette: ${r.id} ha massTonnes ma non produce pezzi`);
    const cap = r.nominalOutputMw ?? f.base_capacity_per_day;
    if (!(cap > 0)) errors.push(`ricette: ${r.id} senza capacità giornaliera (${r.factory} ha base_capacity_per_day = ${f.base_capacity_per_day}: serve nominalOutputMw)`);
    if (r.nominalOutputMw !== undefined && f.base_capacity_per_day > 0) errors.push(`ricette: ${r.id} ridefinisce la capacità di ${r.factory}, già nel catalogo`);
  };
  for (const r of file.recipes ?? []) check(r, 'ricetta', false);
  for (const r of file.flows ?? []) check(r, 'flusso', true);
  // niente cicli tra prodotti (un prodotto non può, direttamente o no, servire a produrre se stesso)
  const deps = new Map();
  for (const r of file.recipes ?? []) { const o = r.output?.product; if (!o) continue; if (!deps.has(o)) deps.set(o, new Set()); for (const i of r.inputs ?? []) if (derived.has(i.resource)) deps.get(o).add(i.resource); }
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { errors.push(`ricette: ciclo tra prodotti (${[...path, id].join(' → ')})`); return; }
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) visit(d, [...path, id]);
    state.set(id, 2);
  };
  for (const id of deps.keys()) visit(id, []);
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

/**
 * Flussi di una ricetta a pieno regime: { outputPerDay, outputUnit, inputsPerDay: {risorsa: t/giorno}, energyMw }.
 * Per un prodotto `outputPerDay` è in t al giorno (in pezzi al giorno se la ricetta ha outputUnit "pieces/day": capacità / massTonnes, ingressi in t per pezzo); per la centrale (outputUnit = MW) è la potenza in MW e gli ingressi sono t/giorno per MW in funzione.
 * `energyMw` = MW assorbiti dalla fabbrica (energy_consumption del Pack letto come MW).
 */
export function fullCapacityFlows(recipe, factory) {
  const pieceRecipe = recipe.outputUnit === 'pieces/day';
  const outputPerDay = pieceRecipe ? round(factory.base_capacity_per_day / recipe.massTonnes) : (recipe.nominalOutputMw ?? factory.base_capacity_per_day);
  const inputsPerDay = Object.fromEntries(recipe.inputs.map((i) => [i.resource, round(i.perUnit * outputPerDay / recipe.output.perUnit)]));
  // noSelfConsumption: la centrale non consuma energia propria (il Pack le assegna un consumo che qui si ignora)
  return { outputPerDay, outputUnit: recipe.outputUnit ?? 't/day', inputsPerDay, energyMw: recipe.noSelfConsumption ? 0 : factory.energy_consumption };
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
  const consumed = new Set((recipes.recipes ?? []).flatMap((r) => r.inputs.map((i) => i.resource)).filter((id) => !derived.has(id)));
  for (const id of consumed) if (!(scale[id] > 0)) errors.push(`scala di estrazione: ${id} è consumata da una ricetta ma senza scala`);
  return errors;
}

/** Quantità giornaliera di una risorsa data una quantità di punti; null se la scala non è definita (mai zero silenzioso). */
export function pointsToUnits(points, resourceId, scaleFile) {
  const k = scaleFile.unitsPerPoint?.[resourceId];
  return typeof k === 'number' ? round(points * k) : null;
}
