// Scelta della ricetta di una fabbrica (Fase 4, 03/11/2026): il giocatore decide cosa produce un impianto (es. FCT-ARTILLERY: obice 155 mm invece del pezzo generico).
// Funzione PURA: ritorna il nuovo stato o lancia un Error col motivo (mai un cambio silenzioso).
// Regole: la ricetta deve essere della stessa fabbrica; se è un equipaggiamento il suo gruppo deve essere sbloccato (groupUnlocked); i lotti già chiusi non si perdono,
// quindi il cambio è rifiutato finché l'impianto ha lotti in consegna; i pezzi in lavorazione (wip) non finiti si perdono, e l'impianto riparte da zero.
import { groupUnlocked } from '../data/equipmentProduction.js';

/**
 * ctx: { catalog: { recipes: Map, factories: Map }, table (equipment_production.json), researched?: Set(id tecnologie della nazione) }
 */
export function setFacilityRecipe(state, nation, facilityId, recipeId, { catalog, table, researched = new Set() }) {
  const n = state.nations?.[nation];
  if (!n) throw new Error(`nazione sconosciuta: ${nation}`);
  const f = n.facilities.find((x) => x.id === facilityId);
  if (!f) throw new Error(`impianto sconosciuto: ${facilityId}`);
  const recipe = catalog.recipes.get(recipeId);
  if (!recipe) throw new Error(`ricetta sconosciuta: ${recipeId}`);
  if (recipe.factory !== f.type) throw new Error(`la ricetta ${recipeId} è di ${recipe.factory}, non di ${f.type}`);
  if (recipe.equipmentId) {
    if (recipe.equipmentId.split('-')[1] !== nation) throw new Error(`${recipeId} è di un'altra nazione`);
    if (!groupUnlocked(table, recipe.group, researched)) throw new Error(`${recipeId}: gruppo ${recipe.group} non ancora sbloccato`);
  }
  if (f.recipeId === recipeId) return state;
  if ((f.batches ?? []).length > 0) throw new Error(`${facilityId} ha lotti in consegna: aspettare la consegna prima di cambiare ricetta`);
  const { wip, runDays, batches, ...rest } = f;
  return { ...state, nations: { ...state.nations, [nation]: { ...n, facilities: n.facilities.map((x) => (x.id === facilityId ? { ...rest, recipeId } : x)) } } };
}
