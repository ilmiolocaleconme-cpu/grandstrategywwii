// Opzioni di costruzione e riepilogo economico per l'interfaccia. Funzioni PURE (nessun React): testabili da sole.
import { mineCost, factoryBuildCost } from '../data/economy.js';
import { workersState } from '../rules/workers.js';
import { entityOfProvinceId } from '../data/provinceOwner.js';

const num = (v) => Math.round(v * 10) / 10;
const WHAT = { ecv: 'Denaro', steel: 'Acciaio', workers: 'Lavoratori', energyMw: 'Energia (MW)', tech: 'Tecnologia' };

/** Frase in italiano per un ordine rifiutato (risultato di build.start con ok:false). */
export function describeBuildFailure(r) {
  if (r.ok) return '';
  switch (r.reason) {
    case 'missing': return `Mancano: ${r.missing.map((m) => `${(WHAT[m.what] ?? m.what).toLowerCase()} (servono ${num(m.need)}, hai ${num(m.have ?? 0)})`).join('; ')}`;
    case 'not_controlled': return 'La provincia non è sotto il tuo controllo';
    case 'no_slot': return `Slot esauriti in questa provincia (${r.used} su ${r.capacity})`;
    case 'no_site': return 'Qui non c\'è un giacimento di questa risorsa';
    case 'no_gain': return 'Qui la miniera non produrrebbe di più (base uguale al massimo)';
    case 'already_building': return 'C\'è già una miniera in costruzione qui';
    case 'max_level': return 'Miniera al livello massimo';
    case 'unknown_province': case 'invalid_province': return 'Provincia non valida';
    case 'unknown_nation': return 'Nazione sconosciuta';
    case 'unknown_factory': case 'recipe_mismatch': case 'unknown_kind': return 'Ordine non valido';
    default: return `Ordine rifiutato (${r.reason})`;
  }
}

/**
 * Cosa può costruire `nationId` in una provincia madre. ctx: { build (createConstruction), catalog, sites, economy, resourceLabel(id) }.
 * Ogni voce: { order, label, cost, ok, message } — `ok` dice se l'ordine sarebbe accettato ORA (prova a secco, lo stato non cambia).
 */
export function provinceBuildOptions(state, nationId, provinceId, { build, catalog, sites, economy, resourceLabel = (id) => id }) {
  const nation = state.nations?.[nationId];
  const out = { mines: [], factories: [] };
  if (!nation) return out;
  if (state.control[entityOfProvinceId(provinceId, Object.keys(state.control))] !== nationId) return { ...out, reason: 'not_controlled' };
  for (const [resource, site] of Object.entries(sites.byProvince[provinceId] ?? {})) {
    const current = nation.mines.find((m) => m.provinceId === provinceId && m.resource === resource)?.level ?? 0;
    const level = current + 1;
    if (level > economy.mines.gapParts) continue;
    const order = { kind: 'mine', provinceId, resource };
    const r = build.start(state, nationId, order);
    const gain = Math.round((site.extraPerDay[level - 1] - (site.extraPerDay[level - 2] ?? 0)) * 10) / 10;
    if (!r.ok && r.reason === 'no_gain') continue; // non mostrare miniere inutili
    out.mines.push({ order, label: `${resourceLabel(resource)}: miniera livello ${level}`, detail: `+${gain} t/giorno`, cost: mineCost(economy, level, state.difficulty), ok: r.ok, message: describeBuildFailure(r) });
  }
  const seen = new Set();
  for (const recipe of catalog.recipes.values()) {
    const key = `${recipe.factory}/${recipe.id}`;
    const factory = catalog.factories.get(recipe.factory);
    if (!factory || seen.has(key)) continue;
    seen.add(key);
    const order = { kind: 'factory', factoryId: recipe.factory, recipeId: recipe.id, provinceId };
    const r = build.start(state, nationId, order);
    out.factories.push({ order, label: `${factory.name_it}`, detail: recipe.id, cost: factoryBuildCost(economy, factory, state.difficulty), ok: r.ok, message: describeBuildFailure(r) });
  }
  return out;
}

/** Riepilogo economico di una nazione per la schermata Economia. ctx: { build, catalog, workersShare, resourceLabel(id), provinceName(id) } */
export function economySummary(state, nationId, { build, catalog, workersShare, resourceLabel = (id) => id, provinceName = (id) => id }) {
  const n = state.nations?.[nationId];
  if (!n) return null;
  const counts = new Map();
  for (const f of n.facilities) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  const label = (kind, c) => (kind === 'mine' ? `Miniera ${resourceLabel(c.resource)} L${c.level}` : (catalog.factories.get(c.factoryId)?.name_it ?? c.factoryId));
  return {
    balance: n.balance,
    population: n.population,
    workers: workersState(n, { factoriesById: catalog.factories, share: workersShare }),
    power: build.powerBalance(state, n, nationId),
    stocks: Object.entries(n.stocks).filter(([, t]) => t > 0).map(([id, t]) => ({ id, label: resourceLabel(id), tons: Math.round(t) })).sort((a, b) => b.tons - a.tons),
    plants: [...counts].map(([type, count]) => ({ type, name: catalog.factories.get(type)?.name_it ?? type, count })).sort((a, b) => b.count - a.count),
    queue: n.construction.map((c) => ({ id: c.id, label: label(c.kind, c), daysLeft: c.daysLeft, totalDays: c.totalDays, where: provinceName(c.provinceId) })),
    mines: n.mines.map((m) => ({ id: m.id, label: `${resourceLabel(m.resource)} L${m.level}`, where: provinceName(m.provinceId) })),
  };
}
