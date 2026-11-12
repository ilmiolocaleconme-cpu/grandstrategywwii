// Qualità dei fucili di una nazione e bonus in battaglia (fase 2, 12/11/2026, scelta A dell'utente). Funzioni PURE.
// Modello (DESIGN_DEFAULT, valori in data/units/models/fucili_1930_1945.json → rifleQuality):
//  - ogni fucile prodotto aggiunge alla nazione la qualità del MIGLIOR modello producibile quel giorno (0 = ripetizione manuale, 1 = semiautomatico…);
//  - qualità media = punti accumulati / uomini PREVISTI delle divisioni della nazione (non gli effettivi: le perdite non la fanno salire), al massimo maxQuality;
//  - bonus = bonusPerQuality × qualità media, sommato al bonus di trinceramento, solo per le categorie elencate.
// Stato (campo OPZIONALE, assente = 0 punti, nessuna migrazione): nation.rifles = { points }.
// NON MODELLATO: fucili persi in battaglia, distribuzione divisione per divisione (da fare quando produzione e voci delle divisioni saranno collegate).
import { producibleModels } from '../data/smallArmsModels.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Qualità di un modello: `quality` del modello o quella del suo tipo. */
export const modelQuality = (doc, m) => m.quality ?? doc?.rifleQuality?.byType?.[m.type] ?? 0;

/** Qualità del miglior fucile che la nazione può produrre nell'anno con le tecnologie date (0 se nessun modello). */
export function bestRifleQuality(doc, nationId, year, techs) {
  return producibleModels(doc, nationId, year, techs).reduce((best, m) => Math.max(best, modelQuality(doc, m)), 0);
}

/** Aggiunge alla nazione i punti dei fucili prodotti oggi (count = pezzi). Ritorna la nazione (stesso oggetto se nulla cambia). */
export function addRiflePoints(nation, count, quality) {
  const add = count * quality;
  if (!(add > 0)) return nation;
  return { ...nation, rifles: { points: r3((nation.rifles?.points ?? 0) + add) } };
}

/** Qualità media (0..maxQuality) dati i punti e gli uomini previsti. */
export function averageQuality(doc, points, plannedMen) {
  if (!(plannedMen > 0) || !(points > 0)) return 0;
  return Math.min(doc?.rifleQuality?.maxQuality ?? 1, points / plannedMen);
}

/** Bonus in battaglia per una divisione della categoria data (0 se la categoria non usa i fucili come arma principale). */
export function rifleBonus(doc, category, avgQuality) {
  const q = doc?.rifleQuality;
  if (!q || !q.categories.includes(category)) return 0;
  return r3(q.bonusPerQuality * avgQuality);
}

/** Errori della configurazione (vuoto = valida). */
export function validateRifleQuality(doc) {
  const q = doc?.rifleQuality;
  if (!q) return ['fucili: rifleQuality mancante'];
  const errors = [];
  for (const t of ['bolt', 'sniper', 'semi', 'selective']) if (!(q.byType?.[t] >= 0)) errors.push(`fucili: qualità del tipo ${t} non valida`);
  if (!(q.maxQuality > 0)) errors.push('fucili: maxQuality non valida');
  if (!(q.bonusPerQuality >= 0 && q.bonusPerQuality * q.maxQuality <= 0.5)) errors.push('fucili: bonusPerQuality non valido (bonus massimo oltre il 50%)');
  if (!Array.isArray(q.categories)) errors.push('fucili: categorie mancanti');
  for (const m of doc.models ?? []) if ('quality' in m && !(m.quality >= 0 && m.quality <= q.maxQuality)) errors.push(`fucili: ${m.id}: qualità non valida`);
  return errors;
}

/** Uomini previsti delle divisioni di ogni nazione: { [nazione]: uomini }. nationOf(divisionId) → nazione. */
export function plannedMenByNation(forces, nationOf) {
  const out = {};
  for (const [id, d] of Object.entries(forces?.divisions ?? {})) {
    const n = nationOf(id);
    const men = d.items?.['manpower.war']?.planned ?? 0;
    if (n && men > 0) out[n] = (out[n] ?? 0) + men;
  }
  return out;
}
