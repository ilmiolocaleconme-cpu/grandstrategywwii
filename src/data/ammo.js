// Consumo di munizioni delle unità per categoria e fase (data/military/ammo_consumption.json). Fase 0: solo dati e funzioni pure.
// Le munizioni sono il prodotto `munitions` di data/resources.json. Unità: tonnellate al giorno; i «colpi» sono t × roundsPerTonne.
export const AMMO_SCHEMA = 'ammo-consumption-v1';
export const AMMO_PHASES = Object.freeze(['attack', 'defense']);

export function validateAmmoConsumption(file, { resources } = {}) {
  const errors = [];
  if (file?.schema !== AMMO_SCHEMA) return [`munizioni: schema ${file?.schema}, atteso ${AMMO_SCHEMA}`];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('munizioni: qualità attesa DESIGN_DEFAULT');
  if (!(file.roundsPerTonne > 0)) errors.push('munizioni: roundsPerTonne non valido');
  if (!(file.idleFactor >= 0 && file.idleFactor <= 1)) errors.push('munizioni: idleFactor deve stare tra 0 e 1');
  if (resources && !resources.some((r) => r.id === 'munitions')) errors.push('munizioni: manca il prodotto munitions in resources.json');
  const seen = new Set();
  for (const c of file.categories ?? []) {
    if (!c.id || seen.has(c.id)) errors.push(`munizioni: categoria senza id o duplicata (${c.id})`);
    seen.add(c.id);
    if (!String(c.name_it ?? '').trim()) errors.push(`munizioni: ${c.id} senza nome`);
    let any = false;
    for (const ph of AMMO_PHASES) {
      const v = c[ph];
      if (v === null) continue; // fase non applicabile (es. difesa aerea in attacco): null esplicito, mai zero silenzioso
      if (!(v > 0)) errors.push(`munizioni: ${c.id} con consumo non valido in fase ${ph}`);
      else any = true;
    }
    if (!any) errors.push(`munizioni: ${c.id} senza nessuna fase applicabile`);
  }
  if ((file.categories ?? []).length === 0) errors.push('munizioni: nessuna categoria');
  return errors;
}

/**
 * Consumo giornaliero (t) di UNA unità della categoria nella fase data ('attack' | 'defense'); `engaged = false` = non combatte
 * (consumo = idleFactor × il consumo di attacco, oggi 0). Categoria o fase sconosciuta, o fase non applicabile = null (mai zero silenzioso).
 */
export function dailyAmmo(file, categoryId, phase, engaged = true) {
  const c = (file.categories ?? []).find((x) => x.id === categoryId);
  if (!c || !AMMO_PHASES.includes(phase) || typeof c[phase] !== 'number') return null;
  return Math.round(c[phase] * (engaged ? 1 : file.idleFactor) * 1000) / 1000;
}

/** Colpi al giorno di una unità (consumo in t × colpi per tonnellata); null come dailyAmmo. */
export function dailyRounds(file, categoryId, phase, engaged = true) {
  const t = dailyAmmo(file, categoryId, phase, engaged);
  return t === null ? null : Math.round(t * file.roundsPerTonne);
}

/** Quante unità di una categoria regge una produzione di munizioni (t/giorno) in quella fase, in combattimento continuo. */
export function ammoUnitsSupported(file, categoryId, phase, tonsPerDay) {
  const c = dailyAmmo(file, categoryId, phase, true);
  return c === null ? null : tonsPerDay / c;
}
