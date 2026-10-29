// Pool dei cavalli di una nazione (data/agriculture/horse_breeding.json). Funzioni PURE e deterministiche.
// Il pool è la scorta `horses` (capi) di `state.nations[id].stocks`: gli allevamenti (FCT-STUD, REC-HORSES-001) la riempiono tramite produceDay;
// i rinforzi delle divisioni la svuotano (planReinforcements con stocks.horses = horsePoolAvailable(...), poi si applica remaining con setHorses).
// Mantenimento: ogni cavallo del pool mangia ogni giorno; il mangime che manca fa morire una quota dei cavalli rimasti senza cibo.
// NON modellato: cavalli già assegnati alle divisioni (il loro foraggio dipende dalla logistica, non ancora presente), età, fertilità, stagioni.

export const HORSE_STOCK = 'horses';
export const FEED_STOCK = 'feed';

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Mantenimento giornaliero del pool. horses: capi nel pool; feed: t di mangime in scorta; upkeep: sezione `upkeep` di horse_breeding.json.
 * Ritorna { need, feedUsed, unfedShare, lost, horses }: need (t/giorno a pieno), feedUsed (t consumate), unfedShare (0..1, quota non nutrita),
 * lost (capi morti per fame), horses (capi rimasti). Mai più mangime di quello in scorta, mai capi negativi.
 */
export function horseUpkeep({ horses, feed }, upkeep) {
  if (!Number.isFinite(horses) || horses < 0) throw new RangeError(`cavalli non validi: ${horses}`);
  if (!Number.isFinite(feed) || feed < 0) throw new RangeError(`mangime non valido: ${feed}`);
  const need = horses * upkeep.feedPerHorsePerDay;
  const fed = Math.min(feed, need);
  const unfedShare = need > 0 ? (need - fed) / need : 0;
  const lost = Math.min(horses, horses * unfedShare * upkeep.starvationLossPerDay);
  return { need: r3(need), feedUsed: r3(fed), unfedShare: r3(unfedShare), lost: r3(lost), horses: r3(horses - lost) };
}

/** Capi INTERI disponibili per i rinforzi: la produzione degli allevamenti è frazionaria, un rinforzo no (validateReinforcementFields vuole quantità intere). */
export function horsePoolAvailable(stocks) {
  return Math.floor((stocks?.[HORSE_STOCK] ?? 0) + 1e-9);
}

/** Copia delle scorte con i cavalli rimasti dopo i rinforzi (remaining.stocks.horses di planReinforcements): la parte frazionaria resta nel pool. */
export function setHorses(stocks, remainingAvailable) {
  if (!Number.isInteger(remainingAvailable) || remainingAvailable < 0) throw new RangeError(`cavalli rimasti non validi: ${remainingAvailable}`);
  const have = stocks?.[HORSE_STOCK] ?? 0;
  const fraction = have - Math.floor(have + 1e-9);
  return { ...stocks, [HORSE_STOCK]: r3(remainingAvailable + Math.max(0, fraction)) };
}

/** Quadro del pool per la schermata: { horses, available, feedNeedPerDay, feedDays }. feedDays = giorni di mangime in scorta (null se il pool è vuoto). */
export function horsePoolSummary(stocks, upkeep) {
  const horses = stocks?.[HORSE_STOCK] ?? 0;
  const need = horses * upkeep.feedPerHorsePerDay;
  const feed = stocks?.[FEED_STOCK] ?? 0;
  return { horses: r3(horses), available: horsePoolAvailable(stocks), feedNeedPerDay: r3(need), feedDays: need > 0 ? r3(feed / need) : null };
}
