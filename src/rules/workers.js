// Riserva di lavoratori di una nazione: totale (quota della popolazione) meno gli occupati negli impianti e quelli impegnati nelle costruzioni.
// Funzione PURA. Gli impianti occupano lavoratori in modo permanente (campo `workers` del Pack, anche se danneggiati); le costruzioni li occupano finché durano.
import { workersPoolTotal } from '../data/nationPopulation.js';
import { workersAt } from '../data/factoryLevels.js';

/**
 * nation: { population, facilities: [{type}], construction?: [{workers}] }; factoriesById: Map(factory_id → { workers }); share: quota della popolazione; levels: factory_levels.json (necessario solo se un impianto ha livello > 1).
 * Ritorna { total, employed, building, free } (free può essere negativo se gli impianti iniziali superano la riserva: segnalato da `overdrawn`).
 */
export function workersState(nation, { factoriesById, share, levels = null }) {
  const total = workersPoolTotal(nation.population ?? 0, share);
  let employed = 0;
  for (const f of nation.facilities) {
    const factory = factoriesById.get(f.type);
    if (!factory) throw new Error(`lavoratori: fabbrica sconosciuta ${f.type}`);
    employed += workersAt(factory, levels, f.level ?? 1); // i livelli alti occupano più lavoratori (factory_levels.json)
  }
  const building = (nation.construction ?? []).reduce((s, c) => s + (c.workers ?? 0), 0);
  const free = total - employed - building;
  return { total, employed, building, free, overdrawn: free < 0 };
}
