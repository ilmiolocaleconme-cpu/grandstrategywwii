// Consumo di carburante delle unità per categoria (data/military/fuel_consumption.json). Fase 0: solo dati e funzioni pure.
// Il carburante è il prodotto `fuel` di data/resources.json (un solo carburante). Unità: tonnellate al giorno.
export const FUEL_SCHEMA = 'fuel-consumption-v1';

export function validateFuelConsumption(file, { resources } = {}) {
  const errors = [];
  if (file?.schema !== FUEL_SCHEMA) return [`carburante: schema ${file?.schema}, atteso ${FUEL_SCHEMA}`];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('carburante: qualità attesa DESIGN_DEFAULT');
  if (!(file.idleFactor >= 0 && file.idleFactor <= 1)) errors.push('carburante: idleFactor deve stare tra 0 e 1');
  if (resources && !resources.some((r) => r.id === 'fuel')) errors.push('carburante: manca il prodotto fuel in resources.json');
  const seen = new Set();
  for (const c of file.categories ?? []) {
    if (!c.id || seen.has(c.id)) errors.push(`carburante: categoria senza id o duplicata (${c.id})`);
    seen.add(c.id);
    if (!(c.operational > 0)) errors.push(`carburante: ${c.id} con consumo non valido`);
    if (!String(c.name_it ?? '').trim()) errors.push(`carburante: ${c.id} senza nome`);
  }
  if ((file.categories ?? []).length === 0) errors.push('carburante: nessuna categoria');
  return errors;
}

/** Consumo giornaliero di UNA unità della categoria: operativa = 100%, ferma = idleFactor. Categoria sconosciuta = null (mai zero silenzioso). */
export function dailyFuel(file, categoryId, operational) {
  const c = (file.categories ?? []).find((x) => x.id === categoryId);
  if (!c) return null;
  return Math.round(c.operational * (operational ? 1 : file.idleFactor) * 1000) / 1000;
}

/** Quante unità di una categoria regge una produzione di carburante (t/giorno), in operazione continua. */
export function unitsSupported(file, categoryId, fuelPerDay) {
  const c = dailyFuel(file, categoryId, true);
  return c === null ? null : fuelPerDay / c;
}
