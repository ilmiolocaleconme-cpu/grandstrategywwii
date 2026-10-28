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

// ---- Stoccaggio: la scorta di carburante è limitata dalla capacità dei depositi costruiti (deciso in chat 26/10/2026) ----
export const FUEL_STORAGE_SCHEMA = 'fuel-storage-v1';

/** Errori (lista vuota = valido). ctx: { structureIds: Set degli structure_id del Pack, buildingIds: Set degli id di data/buildings.json } */
export function validateFuelStorage(file, { structureIds, buildingIds } = {}) {
  const errors = [];
  if (file?.schema !== FUEL_STORAGE_SCHEMA) return [`scorte: schema ${file?.schema}, atteso ${FUEL_STORAGE_SCHEMA}`];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('scorte: qualità attesa DESIGN_DEFAULT');
  if (!(file.baseCapacity >= 0)) errors.push('scorte: baseCapacity non valida');
  if (file.overflow !== 'lost') errors.push('scorte: overflow deve essere "lost" (l\'eccesso si perde, nessuno stoccaggio gratuito)');
  const seen = new Set(); let prev = 0;
  for (const d of file.depots ?? []) {
    if (seen.has(d.structure_id)) errors.push(`scorte: ${d.structure_id} duplicato`);
    seen.add(d.structure_id);
    if (structureIds && !structureIds.has(d.structure_id)) errors.push(`scorte: ${d.structure_id} non esiste nel Pack`);
    if (buildingIds && !buildingIds.has(d.building)) errors.push(`scorte: edificio ${d.building} inesistente`);
    if (!(d.capacity > 0)) errors.push(`scorte: ${d.structure_id} con capacità non valida`);
    else if (d.capacity <= prev) errors.push(`scorte: ${d.structure_id} deve avere capacità maggiore del livello precedente`);
    prev = Math.max(prev, d.capacity);
  }
  if ((file.depots ?? []).length === 0) errors.push('scorte: nessun deposito');
  return errors;
}

/** Capacità totale di stoccaggio: baseCapacity + depositi costruiti. built = { 'INF-010': n, ... }. Struttura sconosciuta = errore, non zero silenzioso. */
export function storageCapacity(file, built = {}) {
  let total = file.baseCapacity ?? 0;
  for (const [id, n] of Object.entries(built)) {
    const d = (file.depots ?? []).find((x) => x.structure_id === id);
    if (!d) throw new Error(`scorte: struttura sconosciuta ${id}`);
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`scorte: numero di depositi non valido per ${id}`);
    total += d.capacity * n;
  }
  return total;
}

/** Scorta dopo un giorno: stock + produzione − consumo, limitata a [0, capacità]. Ritorna { stock, lost (eccesso perso), shortfall (consumo non coperto) }. */
export function stockAfterDay(stock, produced, consumed, capacity) {
  const raw = stock + produced - consumed;
  if (raw < 0) return { stock: 0, lost: 0, shortfall: -raw };
  if (raw > capacity) return { stock: capacity, lost: raw - capacity, shortfall: 0 };
  return { stock: raw, lost: 0, shortfall: 0 };
}
