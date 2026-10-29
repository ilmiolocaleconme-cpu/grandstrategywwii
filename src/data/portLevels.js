// Livelli dei porti (data/ports/port_levels.json): validazione e costo di costruzione/miglioramento. Funzioni PURE.
import { difficulty } from './economy.js';

export const PORT_LEVELS_SCHEMA = 'port-levels-v1';

export function validatePortLevels(file, { techIds = null } = {}) {
  if (file?.schema !== PORT_LEVELS_SCHEMA) return [`porti: livelli, schema ${file?.schema}, atteso ${PORT_LEVELS_SCHEMA}`];
  const errors = [];
  if (!['DESIGN_DEFAULT', 'verified'].includes(file.quality)) errors.push('porti: livelli, qualità sconosciuta');
  const ls = file.levels ?? [];
  if (ls.length !== 3) errors.push('porti: servono esattamente 3 livelli (locale, regionale, grande)');
  ls.forEach((l, i) => {
    if (l.level !== i + 1) errors.push(`porti: livelli non consecutivi (atteso ${i + 1})`);
    if (!l.name_it) errors.push(`porti: L${l.level} senza nome`);
    if (!(l.ecv > 0) || !Number.isInteger(l.days) || l.days < 1 || !(l.workers >= 0)) errors.push(`porti: L${l.level} con costo, durata o lavoratori non validi`);
    if (i > 0 && !(l.ecv >= ls[i - 1].ecv && l.days >= ls[i - 1].days)) errors.push(`porti: L${l.level} costa meno o dura meno del livello precedente`);
    if (l.requires && techIds && !techIds.has(l.requires)) errors.push(`porti: L${l.level} richiede ${l.requires}, che non esiste`);
  });
  return errors;
}

export const maxPortLevel = (file) => file.levels.length;
export const portLevelDef = (file, level) => (file?.levels ?? []).find((l) => l.level === level) ?? null;

const round = (v) => Math.round(v * 1000) / 1000;

/** Costo per portare un porto da `fromLevel` (0 = nessuno) a `fromLevel + 1`: { ecv, steel, workers, days } oppure null. */
export function portCost(file, economy, fromLevel, difficultyId) {
  const to = portLevelDef(file, fromLevel + 1);
  const d = difficulty(economy, difficultyId);
  const k = economy.construction?.steelPerEcv;
  if (!to || !d || !(k > 0)) return null;
  return { ecv: round(to.ecv * d.costMul), steel: round(to.ecv * k * d.costMul), workers: to.workers, days: Math.ceil(to.days * d.timeMul) };
}
