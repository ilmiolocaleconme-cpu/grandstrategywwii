// Produzione degli equipaggiamenti (Fase 4, 03/11/2026): dalla tabella per categoria (data/units/equipment/equipment_production.json) e dal catalogo si
// GENERANO le ricette, una per equipaggiamento, con prodotto `equipment.<equipment_id>` (la stessa chiave dei template e delle istanze delle divisioni).
// Nessun codice per nazione: una nazione nuova entra solo aggiungendo voci al catalogo. Funzioni PURE.
import { EQUIPMENT_PREFIX } from './recipes.js';
import { CATEGORIES } from './equipmentCatalog.js';

export const PRODUCTION_SCHEMA = 'equipment-production-v1';
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/** Errori della tabella (lista vuota = valida). ctx: { factoriesById?: Map, techIds?: Set, catalog?: catalogo unito }. */
export function validateEquipmentProduction(file, { factoriesById = null, techIds = null, catalog = null } = {}) {
  if (file?.schema !== PRODUCTION_SCHEMA) return [`produzione equipaggiamenti: schema ${file?.schema}, atteso ${PRODUCTION_SCHEMA}`];
  const errors = [];
  if (!['DESIGN_DEFAULT', 'MISSING_DATA', 'verified'].includes(file.quality)) errors.push('produzione equipaggiamenti: qualità sconosciuta');
  if (!(file.priceFactor >= 1)) errors.push('produzione equipaggiamenti: priceFactor deve essere >= 1 (un pezzo non vale meno dei suoi materiali)');
  for (const k of ['steel', 'components']) if (!(file.inputsPerTonne?.[k] > 0)) errors.push(`produzione equipaggiamenti: inputsPerTonne.${k} non valido`);
  for (const [g, def] of Object.entries(file.groups ?? {})) {
    if (!def.name_it) errors.push(`produzione equipaggiamenti: gruppo ${g} senza nome`);
    if (def.requires !== null && typeof def.requires !== 'string') errors.push(`produzione equipaggiamenti: gruppo ${g} con requires non valido (stringa o null)`);
    else if (def.requires && techIds && !techIds.has(def.requires)) errors.push(`produzione equipaggiamenti: gruppo ${g} richiede ${def.requires}, che non esiste`);
  }
  for (const [c, def] of Object.entries(file.categories ?? {})) {
    if (!CATEGORIES.includes(c)) errors.push(`produzione equipaggiamenti: categoria sconosciuta ${c}`);
    if (!(def.massTonnes > 0)) errors.push(`produzione equipaggiamenti: ${c} senza peso valido`);
    if ('capacityShare' in def && !(def.capacityShare > 0 && def.capacityShare <= 1)) errors.push(`produzione equipaggiamenti: ${c} con capacityShare non valido (0 < quota <= 1)`);
    if (!Number.isInteger(def.releaseEveryDays) || def.releaseEveryDays < 1) errors.push(`produzione equipaggiamenti: ${c} con releaseEveryDays non valido`);
    else if (!Number.isInteger(def.buildDays) || def.buildDays < def.releaseEveryDays) errors.push(`produzione equipaggiamenti: ${c} con buildDays non valido (intero >= releaseEveryDays)`);
    if (!(def.group in (file.groups ?? {}))) errors.push(`produzione equipaggiamenti: ${c} con gruppo sconosciuto ${def.group}`);
    if (factoriesById && !factoriesById.has(def.factory)) errors.push(`produzione equipaggiamenti: ${c} con fabbrica inesistente ${def.factory}`);
  }
  const ids = new Set((catalog?.entries ?? []).map((e) => e.equipment_id));
  for (const [id, o] of Object.entries(file.overrides ?? {})) {
    if (catalog && !ids.has(id)) errors.push(`produzione equipaggiamenti: override per ${id}, assente dal catalogo`);
    if (o.massTonnes !== undefined && !(o.massTonnes > 0)) errors.push(`produzione equipaggiamenti: override ${id} con peso non valido`);
    if (o.capacityShare !== undefined && !(o.capacityShare > 0 && o.capacityShare <= 1)) errors.push(`produzione equipaggiamenti: override ${id} con capacityShare non valido`);
    for (const k of ['buildDays', 'releaseEveryDays']) if (o[k] !== undefined && !(Number.isInteger(o[k]) && o[k] >= 1)) errors.push(`produzione equipaggiamenti: override ${id} con ${k} non valido`);
  }
  return errors;
}

/** La voce di catalogo ha una ricetta con questa tabella? (varianti datate e categorie non in tabella: no). */
export const isProducible = (entry, table) => entry.reliability !== 'DATED_VARIANT' && entry.category in (table.categories ?? {});

/** Ricette generate: una per voce producibile del catalogo, in ordine di equipment_id. */
export function buildEquipmentRecipes(catalog, table) {
  const out = [];
  for (const e of [...catalog.entries].sort((a, b) => (a.equipment_id < b.equipment_id ? -1 : 1))) {
    if (!isProducible(e, table)) continue;
    const cat = table.categories[e.category];
    const mass = table.overrides?.[e.equipment_id]?.massTonnes ?? cat.massTonnes;
    const ov = table.overrides?.[e.equipment_id] ?? {};
    out.push({
      id: `REC-${e.equipment_id}`, factory: cat.factory, massTonnes: mass, outputUnit: 'pieces/day',
      buildDays: ov.buildDays ?? cat.buildDays, releaseEveryDays: ov.releaseEveryDays ?? cat.releaseEveryDays,
      ...((ov.capacityShare ?? cat.capacityShare ?? 1) < 1 ? { capacityShare: ov.capacityShare ?? cat.capacityShare } : {}),
      inputs: [{ resource: 'steel', perUnit: r6(table.inputsPerTonne.steel * mass) }, { resource: 'components', perUnit: r6(table.inputsPerTonne.components * mass) }],
      output: { product: `${EQUIPMENT_PREFIX}${e.equipment_id}`, perUnit: 1 },
      quality: 'DESIGN_DEFAULT', equipmentId: e.equipment_id, group: cat.group, ...(e.role ? { role: e.role } : {}),
      rationale: `Generata dalla tabella per categoria ${e.category} (${table.quality}): peso ${mass} t, tempi di lotto e ingressi per t di peso sono valori di bilanciamento, non dati storici su ${e.designation ?? e.equipment_id}.`,
    });
  }
  return out;
}

/** Insieme di tutte le ricette del motore: quelle scritte a mano più le generate (nessuna duplicazione dei dati). */
export const withEquipmentRecipes = (recipesDoc, generated) => ({ ...recipesDoc, recipes: [...(recipesDoc.recipes ?? []), ...generated] });

/** Il gruppo è noto alla nazione? Gruppo senza `requires` = noto a tutti dal 1936; altrimenti serve la tecnologia (insieme `researched`). */
export function groupUnlocked(table, group, researched = new Set()) {
  const def = table.groups?.[group];
  if (!def) return false;
  return def.requires === null || researched.has(def.requires);
}

/** Ricette che una nazione può usare ora (equipaggiamenti della sua nazione, gruppo sbloccato). */
export function recipesAvailable(generated, table, nation, researched = new Set()) {
  return generated.filter((r) => r.equipmentId.split('-')[1] === nation && groupUnlocked(table, r.group, researched));
}

/**
 * Prezzi dei pezzi (opzione D, 03/11/2026): priceFactor × costo dei materiali della ricetta ai prezzi di `prices`. Chiave `equipment.<id>`, 6 decimali.
 * Una materia senza prezzo è un errore (mai un prezzo che ignora un ingresso).
 */
export function equipmentPrices(recipes, prices, factor) {
  const out = {};
  for (const r of recipes) {
    let cost = 0;
    for (const i of r.inputs) {
      if (typeof prices[i.resource] !== 'number') throw new Error(`prezzo: ${r.id} usa ${i.resource}, senza prezzo in economy.json`);
      cost += i.perUnit * prices[i.resource];
    }
    out[r.output.product] = Math.round(cost * factor * 1e6) / 1e6;
  }
  return out;
}

/** economy.json con i prezzi dei pezzi aggiunti (non sovrascrive prezzi già presenti). */
export function withEquipmentPrices(economy, recipes, factor) {
  return { ...economy, prices: { ...equipmentPrices(recipes, economy.prices, factor), ...economy.prices } };
}
