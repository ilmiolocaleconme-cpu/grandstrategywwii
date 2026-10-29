// Dati di agricoltura e allevamento: effetto dei fertilizzanti (data/agriculture/fertilizer_effect.json) e pool dei cavalli
// (data/agriculture/horse_breeding.json). Solo validatori e letture PURE: ricevono i file già letti.
// Qualità DESIGN_DEFAULT: valori di progetto, non storici. I cavalli iniziali sono MISSING_DATA finché l'utente non fornisce i numeri.
import { HORSE_STOCK } from '../rules/horsePool.js';

export const FERTILIZER_EFFECT_SCHEMA = 'fertilizer-effect-v1';
export const HORSE_BREEDING_SCHEMA = 'horse-breeding-v1';
export const HORSE_POOL_STATUSES = Object.freeze(['MISSING_DATA', 'USER_DATA', 'USER_ESTIMATE']);
export const HORSE_BASES = Object.freeze(['utente', 'ipotesi']);

const isProduct = (resources, id) => resources.some((r) => r.id === id && r.tipo === 'prodotto');
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');

/** Errori dell'effetto dei fertilizzanti (lista vuota = valido). ctx: { resources: [{id, tipo?}] } */
export function validateFertilizerEffect(file, { resources }) {
  if (file?.schema !== FERTILIZER_EFFECT_SCHEMA) return [`fertilizzanti: schema ${file?.schema}, atteso ${FERTILIZER_EFFECT_SCHEMA}`];
  const errors = [];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('fertilizzanti: qualità attesa DESIGN_DEFAULT');
  if (!resources.some((r) => r.id === file.crop)) errors.push(`fertilizzanti: la coltura ${file.crop} non esiste in resources.json`);
  else if (isProduct(resources, file.crop)) errors.push(`fertilizzanti: la coltura ${file.crop} è un prodotto, deve essere una materia prima`);
  if (!isProduct(resources, file.input)) errors.push(`fertilizzanti: ${file.input} non è un prodotto di resources.json`);
  if (!(file.yieldBonusMax > 0 && file.yieldBonusMax <= 1)) errors.push('fertilizzanti: yieldBonusMax deve essere in (0, 1]');
  if (!(file.fertilizerPerWheatTon > 0)) errors.push('fertilizzanti: fertilizerPerWheatTon deve essere positivo');
  if (!String(file.rationale ?? '').trim()) errors.push('fertilizzanti: senza motivazione');
  return errors;
}

/**
 * Errori del pool dei cavalli (lista vuota = valido).
 * ctx: { resources, recipes (file ricette), entityIds: Set (entità politiche del 1936) }
 */
export function validateHorseBreeding(file, { resources, recipes, entityIds }) {
  if (file?.schema !== HORSE_BREEDING_SCHEMA) return [`cavalli: schema ${file?.schema}, atteso ${HORSE_BREEDING_SCHEMA}`];
  const errors = [];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('cavalli: qualità attesa DESIGN_DEFAULT');
  if (file.stock !== HORSE_STOCK) errors.push(`cavalli: la scorta deve chiamarsi ${HORSE_STOCK}`);
  if (!isProduct(resources, file.stock)) errors.push(`cavalli: ${file.stock} non è un prodotto di resources.json`);
  const breeding = (recipes?.recipes ?? []).filter((r) => r.output?.product === file.stock);
  if (breeding.length === 0) errors.push(`cavalli: nessuna ricetta produce ${file.stock}`);
  for (const r of breeding) if (r.outputUnit !== 'head/day') errors.push(`cavalli: ${r.id} deve avere outputUnit head/day (capi, non tonnellate)`);
  const u = file.upkeep ?? {};
  if (!(u.feedPerHorsePerDay > 0)) errors.push('cavalli: upkeep.feedPerHorsePerDay deve essere positivo');
  if (!(u.starvationLossPerDay > 0 && u.starvationLossPerDay <= 1)) errors.push('cavalli: upkeep.starvationLossPerDay deve essere in (0, 1]');
  if (!String(u.rationale ?? '').trim()) errors.push('cavalli: upkeep senza motivazione');
  const p = file.initialPool ?? {};
  if (!isDate(p.asOf)) errors.push('cavalli: initialPool.asOf non è una data');
  if (!HORSE_POOL_STATUSES.includes(p.status)) errors.push(`cavalli: initialPool.status sconosciuto "${p.status}"`);
  const entries = Object.entries(p.byNation ?? {});
  if (entries.length === 0 && p.status !== 'MISSING_DATA') errors.push('cavalli: tabella iniziale vuota ma lo stato non è MISSING_DATA');
  if (entries.length > 0 && p.status === 'MISSING_DATA') errors.push('cavalli: tabella iniziale con voci ma lo stato è ancora MISSING_DATA');
  for (const [id, e] of entries) {
    if (!entityIds.has(id)) errors.push(`cavalli: ${id} non è un'entità politica del 1936`);
    if (!Number.isInteger(e.horses) || e.horses < 0) errors.push(`cavalli: ${id} con numero di capi non valido`);
    if (!HORSE_BASES.includes(e.basis)) errors.push(`cavalli: ${id} con basis sconosciuta "${e.basis}"`);
    if (!/^\d{4}$/.test(e.referenceYear ?? '')) errors.push(`cavalli: ${id} senza anno di riferimento`);
    if (!String(e.source ?? '').trim()) errors.push(`cavalli: ${id} senza fonte`);
  }
  return errors;
}

/** Cavalli iniziali per nazione: { idEntità: capi }. Vuoto finché la tabella è MISSING_DATA: non si inventano numeri. */
export function initialHorseStocks(file) {
  return Object.fromEntries(Object.entries(file?.initialPool?.byNation ?? {}).map(([id, e]) => [id, e.horses]));
}
