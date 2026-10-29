// Cura dei feriti negli ospedali (data/medical/hospital_care.json). Funzione PURA e deterministica, un giorno alla volta.
// Ingressi: feriti in attesa, medicina in scorta (t), numero di ospedali per tipo. Ricovera fino alla capacità; la medicina disponibile
// copre una quota dei ricoverati (copertura): chi è coperto guarisce a pieno ritmo, chi no alla metà e con un po' di morti.
// I feriti che non trovano posto muoiono più in fretta. Guariti = uomini che tornano al pool della nazione (collegamento non ancora fatto).
// NON collegata al ciclo di partita: non esistono ancora combattimenti, perdite né ospedali nello stato delle nazioni.

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Posti totali: somma dei posti di ogni tipo × numero di ospedali (interi non negativi). */
export function hospitalCapacity(counts, params) {
  let total = 0;
  for (const [kind, n] of Object.entries(counts ?? {})) {
    const def = params.kinds[kind];
    if (!def) throw new RangeError(`tipo di ospedale sconosciuto: ${kind}`);
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`numero di ospedali non valido per ${kind}: ${n}`);
    total += n * def.capacityPatients;
  }
  return total;
}

/**
 * wounded: feriti in attesa; medicine: t in scorta; counts: { field_hospital: n, hospital: m }; params: hospital_care.json.
 * Ritorna { treated, waiting, medicineNeed, medicineUsed, coverage, recovered, died, wounded }.
 * Mai più medicina di quella in scorta, mai feriti negativi, guariti + morti + rimasti = feriti iniziali.
 */
export function hospitalDay({ wounded, medicine, counts }, params) {
  if (!Number.isFinite(wounded) || wounded < 0) throw new RangeError(`feriti non validi: ${wounded}`);
  if (!Number.isFinite(medicine) || medicine < 0) throw new RangeError(`medicina non valida: ${medicine}`);
  const capacity = hospitalCapacity(counts, params);
  const treated = Math.min(wounded, capacity);
  const waiting = wounded - treated;
  const need = treated * params.medicinePerPatientPerDay;
  const used = Math.min(medicine, need);
  const coverage = need > 0 ? used / need : 0;
  // ritmo di guarigione medio dei posti occupati (i tipi si riempiono in proporzione ai posti)
  let rate = 0;
  if (capacity > 0) for (const [kind, n] of Object.entries(counts)) rate += (n * params.kinds[kind].capacityPatients / capacity) * params.kinds[kind].recoveryPerDay;
  const recovered = treated * rate * (params.unsuppliedRecoveryFactor + (1 - params.unsuppliedRecoveryFactor) * coverage);
  const diedTreated = treated * params.deathPerDayTreatedUnsupplied * (1 - coverage);
  const diedWaiting = waiting * params.deathPerDayWaiting;
  const died = Math.min(wounded - recovered, diedTreated + diedWaiting);
  return { treated: r3(treated), waiting: r3(waiting), medicineNeed: r3(need), medicineUsed: r3(used), coverage: r3(coverage), recovered: r3(recovered), died: r3(died), wounded: r3(wounded - recovered - died) };
}
