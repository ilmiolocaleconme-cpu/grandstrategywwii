// Funzioni pure sugli attraversamenti (ponti, ponti di barche, guadi, traghetti).
// Nessun I/O e nessuno stato di partita: lavorano sul catalogo data/crossings.json.
// Lo stato operativo in partita (danni, distruzione, riparazione) NON è ancora implementato.

/**
 * L'attraversamento esiste alla data? validFrom incluso, validTo escluso (la data di fine è il
 * primo giorno in cui non c'è più). Date in formato ISO AAAA-MM-GG: il confronto tra stringhe
 * coincide con quello cronologico.
 */
export function crossingExistsAt(crossing, isoDate) {
  return crossing.validFrom <= isoDate && isoDate < crossing.validTo;
}

/** Attraversamenti esistenti alla data, eventualmente filtrati per fiume. */
export function crossingsAt(crossings, isoDate, { riverId } = {}) {
  return crossings.filter(
    (c) => crossingExistsAt(c, isoDate) && (riverId === undefined || c.riverId === riverId),
  );
}

/**
 * Province raggiunte da un attraversamento: [sideA, sideB] oppure [sideA] se le due rive
 * stanno nella stessa provincia (ponte dentro una provincia: non crea adiacenze nuove,
 * ma resta un punto di passaggio che può essere danneggiato o distrutto).
 */
export function crossingProvinces(crossing) {
  return crossing.sideA === crossing.sideB ? [crossing.sideA] : [crossing.sideA, crossing.sideB];
}
