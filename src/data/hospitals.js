// Validatore dei dati di cura negli ospedali (data/medical/hospital_care.json). Funzione PURA: riceve i file già letti.
export const HOSPITAL_CARE_SCHEMA = 'hospital-care-v1';
export const PLACEMENTS = Object.freeze(['anywhere', 'rear']);

/** ctx: { resources: [{id, tipo}], buildings: [{id}] }. Lista vuota = valido. */
export function validateHospitalCare(file, { resources, buildings }) {
  if (file?.schema !== HOSPITAL_CARE_SCHEMA) return [`ospedali: schema ${file?.schema}, atteso ${HOSPITAL_CARE_SCHEMA}`];
  const errors = [];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('ospedali: qualità attesa DESIGN_DEFAULT');
  if (!resources.some((r) => r.id === file.medicine && r.tipo === 'prodotto')) errors.push(`ospedali: ${file.medicine} non è un prodotto di resources.json`);
  if (!(file.medicinePerPatientPerDay > 0)) errors.push('ospedali: medicinePerPatientPerDay deve essere positivo');
  for (const k of ['unsuppliedRecoveryFactor', 'deathPerDayWaiting', 'deathPerDayTreatedUnsupplied']) if (!(file[k] >= 0 && file[k] <= 1)) errors.push(`ospedali: ${k} deve essere in [0, 1]`);
  const kinds = Object.entries(file.kinds ?? {});
  if (kinds.length === 0) errors.push('ospedali: nessun tipo di ospedale');
  for (const [id, k] of kinds) {
    if (!Number.isInteger(k.capacityPatients) || k.capacityPatients <= 0) errors.push(`ospedali: ${id} con capacità non valida`);
    if (!(k.recoveryPerDay > 0 && k.recoveryPerDay <= 1)) errors.push(`ospedali: ${id} con recoveryPerDay fuori da (0, 1]`);
    if (k.buildingId !== null && !buildings.some((b) => b.id === k.buildingId)) errors.push(`ospedali: ${id} punta all'edificio ${k.buildingId}, che non esiste in buildings.json`);
    if (!String(k.name ?? '').trim()) errors.push(`ospedali: ${id} senza nome`);
    if (!PLACEMENTS.includes(k.placement)) errors.push(`ospedali: ${id} con placement sconosciuto "${k.placement}"`);
    if (!Number.isInteger(k.coverageRadius) || k.coverageRadius < 0) errors.push(`ospedali: ${id} con coverageRadius non valido`);
    if (k.maxPerProvince !== null && !(Number.isInteger(k.maxPerProvince) && k.maxPerProvince > 0)) errors.push(`ospedali: ${id} con maxPerProvince non valido`);
    const b = k.build ?? {};
    if (!(b.ecv > 0)) errors.push(`ospedali: ${id} senza costo in ECV`);
    if (!(b.steel >= 0)) errors.push(`ospedali: ${id} con acciaio non valido`);
    if (!Number.isInteger(b.days) || b.days <= 0) errors.push(`ospedali: ${id} con giorni di costruzione non validi`);
    if (!Number.isInteger(b.staff) || b.staff <= 0) errors.push(`ospedali: ${id} senza personale (uomini dal pool)`);
  }
  if (!String(file.rationale ?? '').trim()) errors.push('ospedali: senza motivazione');
  return errors;
}
