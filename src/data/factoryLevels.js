// Livelli delle fabbriche industriali (data/industry/factory_levels.json): fabbrica → complesso industriale → grande complesso industriale.
// Funzioni PURE. Il livello è il campo facoltativo `level` (1-3, assente = 1) di un impianto di state.nations[id].facilities.
import { difficulty } from './economy.js';

export const FACTORY_LEVELS_SCHEMA = 'factory-levels-v1';
const round = (v) => Math.round(v * 1000) / 1000;

/** Errori del file (lista vuota = valido). */
export function validateFactoryLevels(file) {
  const errors = [];
  if (file?.schema !== FACTORY_LEVELS_SCHEMA) return [`livelli fabbriche: schema ${file?.schema}, atteso ${FACTORY_LEVELS_SCHEMA}`];
  if (!['DESIGN_DEFAULT', 'MISSING_DATA'].includes(file.quality)) errors.push('livelli fabbriche: qualità sconosciuta');
  const ls = file.levels ?? [];
  if (ls.length < 2) errors.push('livelli fabbriche: servono almeno due livelli');
  const ids = new Set();
  ls.forEach((l, i) => {
    if (l.level !== i + 1) errors.push(`livelli fabbriche: livello ${l.level} fuori ordine`);
    if (ids.has(l.id)) errors.push(`livelli fabbriche: id duplicato ${l.id}`);
    ids.add(l.id);
    if (!l.name_it) errors.push(`livelli fabbriche: L${l.level} senza nome`);
    for (const k of ['capacity', 'energy', 'workers']) if (!(l[k] > 0)) errors.push(`livelli fabbriche: L${l.level} con ${k} non valido`);
    if (i === 0) {
      if (['capacity', 'energy', 'workers'].some((k) => l[k] !== 1)) errors.push('livelli fabbriche: il livello 1 deve avere tutti i moltiplicatori a 1');
    } else {
      const p = ls[i - 1];
      for (const k of ['costMul', 'timeMul']) if (!(l[k] > 0)) errors.push(`livelli fabbriche: L${l.level} con ${k} non valido`);
      if (!(l.capacity > p.capacity)) errors.push(`livelli fabbriche: L${l.level} non aumenta la capacità`);
      if (!(l.workers >= p.workers)) errors.push(`livelli fabbriche: L${l.level} ha meno lavoratori del livello precedente`);
      if (l.workers > l.capacity) errors.push(`livelli fabbriche: L${l.level} ha più lavoratori che capacità (nessuna economia di scala)`);
      if (!(l.costMul >= p.costMul || p.costMul === null)) errors.push(`livelli fabbriche: L${l.level} costa meno del livello precedente`);
    }
  });
  return errors;
}

export const maxFactoryLevel = (file) => file.levels.length;

/** Definizione del livello (riga del file) o null. */
export function levelDef(file, level) {
  return (file?.levels ?? []).find((l) => l.level === level) ?? null;
}

/** Moltiplicatori { capacity, energy, workers } del livello di un impianto. Senza file: solo il livello 1 (1,1,1); livello non valido = errore, mai un valore a caso. */
export function levelMult(file, level = 1) {
  if (level === 1 || level === undefined || level === null) return ONE;
  const d = levelDef(file, level);
  if (!d) throw new RangeError(`livello di fabbrica ${level} non valido o file dei livelli mancante`);
  return { capacity: d.capacity, energy: d.energy, workers: d.workers };
}
const ONE = Object.freeze({ capacity: 1, energy: 1, workers: 1 });

/** Lavoratori occupati da un impianto (interi) al livello dato. */
export function workersAt(factory, file, level) {
  return Math.round(factory.workers * levelMult(file, level).workers);
}

/**
 * Costo per passare da `fromLevel` a `fromLevel + 1`: { ecv, days, steel, workers (in più), energyFactor (MW in più = energia della ricetta × energyFactor) }.
 * Null se il livello non esiste. economy = economy.json, factory = riga di factories.csv.
 */
export function upgradeCost(economy, factory, fromLevel, levelsFile, difficultyId) {
  const to = levelDef(levelsFile, fromLevel + 1);
  const d = difficulty(economy, difficultyId);
  const k = economy.construction?.steelPerEcv;
  if (!to || !d || !(k > 0) || !factory) return null;
  const a = levelMult(levelsFile, fromLevel); const b = levelMult(levelsFile, fromLevel + 1);
  return {
    ecv: round(factory.construction_ecv * to.costMul * d.costMul),
    days: Math.ceil(factory.construction_days * to.timeMul * d.timeMul),
    steel: round(factory.construction_ecv * k * to.costMul * d.costMul),
    workers: workersAt(factory, levelsFile, fromLevel + 1) - workersAt(factory, levelsFile, fromLevel),
    energyFactor: round(b.energy - a.energy),
  };
}
