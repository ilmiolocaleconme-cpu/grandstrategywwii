// Vista della produzione di equipaggiamenti: quali impianti possono cambiare ricetta, con quali scelte, e a che punto sono i lotti.
// Funzioni PURE (nessun React). I valori di lotto (giorni di costruzione e consegna) sono valori di gioco DESIGN_DEFAULT, non dati storici.
import { groupUnlocked } from '../data/equipmentProduction.js';
import { setFacilityRecipe } from '../game/facilityRecipe.js';

const nationOfEquipment = (equipmentId) => equipmentId.split('-')[1];

/** Ricette di equipaggiamento della nazione prodotte da quel tipo di fabbrica (tutte, anche non ancora sbloccate), ordinate per id. */
export function equipmentRecipesFor(recipes, nation, factoryType) {
  return [...recipes.values()].filter((r) => r.equipmentId && r.factory === factoryType && nationOfEquipment(r.equipmentId) === nation).sort((a, b) => (a.id < b.id ? -1 : 1));
}

// Ruoli di ripiego: un'arma da ufficiali/specialisti non è la scelta ovvia per una fabbrica nuova (una fabbrica di armi parte dal fucile, non dalla pistola).
const FALLBACK_ROLES = new Set(['officer_and_specialist_sidearm']);

/** Ricetta di default per una NUOVA fabbrica: la prima sbloccata per id, ma le armi di ripiego (pistole) passano per ultime. null se la nazione non ne ha. */
export function defaultEquipmentRecipe(recipes, nation, factoryType, table, researched = new Set()) {
  const unlocked = equipmentRecipesFor(recipes, nation, factoryType).filter((r) => groupUnlocked(table, r.group, researched));
  return unlocked.find((r) => !FALLBACK_ROLES.has(r.role)) ?? unlocked[0] ?? null;
}

/** Stato dei lotti di un impianto: pezzi in lavorazione, giorni al prossimo lotto, pezzi già chiusi in consegna. Tollera i campi assenti (salvataggi vecchi). */
export function batchView(facility, recipe) {
  if (!recipe?.releaseEveryDays) return null;
  const batches = facility.batches ?? [];
  const inDelivery = batches.reduce((s, b) => s + b.qty, 0);
  const next = batches.length ? batches.map((b) => b.readyOn).sort()[0] : null;
  const runDays = facility.runDays ?? 0;
  return {
    wip: Math.floor(facility.wip ?? 0), runDays, releaseEveryDays: recipe.releaseEveryDays, buildDays: recipe.buildDays,
    daysToBatch: Math.max(0, recipe.releaseEveryDays - runDays), progress: Math.min(1, runDays / recipe.releaseEveryDays),
    inDelivery: Math.round(inDelivery), nextDelivery: next, lastDelivery: batches.length ? batches.map((b) => b.readyOn).sort().at(-1) : null,
  };
}

/**
 * Righe degli impianti che producono equipaggiamenti (o che potrebbero, per tipo di fabbrica).
 * ctx: { catalog: { recipes: Map, factories: Map }, table, researched: Set, nameOf(equipmentId) → nome, groupName(group) → nome, techName(id) → nome }
 * Ogni riga: { facilityId, factory, current, batches, options: [{ recipeId, label, current, ok, message }], locked: [{ recipeId, label, requires }] }.
 * `ok`/`message` vengono dalla prova a secco di setFacilityRecipe: il motivo è quello vero della regola.
 */
export function facilityRecipeRows(state, nation, { catalog, table, researched = new Set(), nameOf = (x) => x, techName = (x) => x }) {
  const n = state.nations?.[nation];
  if (!n) return [];
  const rows = [];
  for (const f of n.facilities) {
    const candidates = equipmentRecipesFor(catalog.recipes, nation, f.type);
    if (candidates.length === 0) continue;
    const cur = catalog.recipes.get(f.recipeId) ?? null;
    const options = []; const locked = [];
    for (const r of candidates) {
      const label = nameOf(r.equipmentId);
      if (!groupUnlocked(table, r.group, researched)) { locked.push({ recipeId: r.id, label, requires: techName(table.groups?.[r.group]?.requires) }); continue; }
      let ok = true; let message = '';
      try { setFacilityRecipe(state, nation, f.id, r.id, { catalog, table, researched }); } catch (e) { ok = false; message = e.message; }
      options.push({ recipeId: r.id, label, current: r.id === f.recipeId, ok, message });
    }
    rows.push({
      facilityId: f.id, factory: catalog.factories.get(f.type)?.name_it ?? f.type, level: f.level ?? 1,
      current: cur ? { recipeId: cur.id, label: cur.equipmentId ? nameOf(cur.equipmentId) : cur.id, isEquipment: Boolean(cur.equipmentId) } : null,
      batches: batchView(f, cur), lostOnChange: Math.floor(f.wip ?? 0), options, locked,
    });
  }
  return rows;
}

/** Testo di una riga di lotto: "prossimo lotto tra 3 g · in consegna 24 pz (dal 1936-01-12)". */
export function batchLine(b) {
  if (!b) return '';
  const parts = [`in lavorazione ${b.wip} pz`, `prossimo lotto tra ${b.daysToBatch} g`];
  if (b.inDelivery > 0) parts.push(`in consegna ${b.inDelivery} pz (dal ${b.nextDelivery})`);
  return parts.join(' · ');
}

/** Separa le scorte in risorse (tonnellate) ed equipaggiamenti (pezzi). Una chiave equipment.<id> fuori dal catalogo resta visibile e segnalata. */
export function splitStocks(stocks, { resourceLabel = (x) => x, nameOf = () => null, prefix = 'equipment.' }) {
  const resources = []; const equipment = [];
  for (const [id, q] of Object.entries(stocks ?? {})) {
    if (!(q > 0)) continue;
    if (id.startsWith(prefix)) {
      const eid = id.slice(prefix.length); const name = nameOf(eid);
      equipment.push({ id, label: name ?? eid, pieces: Math.floor(q), unknown: name === null });
    } else resources.push({ id, label: resourceLabel(id), tons: Math.round(q) });
  }
  return { resources: resources.sort((a, b) => b.tons - a.tons), equipment: equipment.filter((e) => e.pieces > 0).sort((a, b) => b.pieces - a.pieces || (a.label < b.label ? -1 : 1)) };
}
