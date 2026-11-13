// Qualità dei fucili di una nazione e bonus in battaglia (fase 2, 12/11/2026, scelta A dell'utente). Funzioni PURE.
// Modello (DESIGN_DEFAULT, valori in data/units/models/fucili_1930_1945.json → rifleQuality):
//  - ogni fucile prodotto aggiunge alla nazione la qualità del MIGLIOR modello producibile quel giorno (0 = ripetizione manuale, 1 = semiautomatico…);
//  - qualità media = punti accumulati / uomini PREVISTI delle divisioni della nazione (non gli effettivi: le perdite non la fanno salire), al massimo maxQuality;
//  - bonus = bonusPerQuality × qualità media, sommato al bonus di trinceramento, solo per le categorie elencate.
// Stato (campo OPZIONALE, assente = 0 punti, nessuna migrazione): nation.rifles = { points, count } (count dal 13/11/2026, facoltativo).
// Fucili persi in battaglia (12/11/2026): tolgono punti alla qualità media attuale (removeRiflePoints, chiamata dal combattimento).
// NON MODELLATO: distribuzione divisione per divisione (da fare quando produzione e voci delle divisioni saranno collegate).
import { producibleModels } from '../data/smallArmsModels.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Qualità di un modello: `quality` del modello o quella del suo tipo. */
export const modelQuality = (doc, m) => m.quality ?? doc?.rifleQuality?.byType?.[m.type] ?? 0;

/**
 * Qualità di un fucile prodotto oggi dalla nazione (0 se nessun modello): miglior modello standard (o straniero) + limitedShare × l'eccedenza del
 * miglior modello a produzione limitata (13/11/2026: un modello limitato non diventa l'arma di tutta la produzione).
 */
export function bestRifleQuality(doc, nationId, year, techs) {
  const list = producibleModels(doc, nationId, year, techs);
  const best = (ms) => ms.reduce((b, m) => Math.max(b, modelQuality(doc, m)), 0);
  const std = best(list.filter((m) => m.status !== 'limited'));
  const lim = best(list.filter((m) => m.status === 'limited'));
  return r3(std + (doc?.rifleQuality?.limitedShare ?? 1) * Math.max(0, lim - std));
}

/** Aggiunge alla nazione i punti dei fucili prodotti oggi (count = pezzi). Ritorna la nazione (stesso oggetto se nulla cambia). */
// 13/11/2026 (simulazione di 3 anni): si contano anche i fucili (count), così la qualità media non supera mai quella dei fucili prodotti
// (prima 870.000 Garand per 46.000 uomini davano 1,25 invece di 1) e i fucili a ripetizione prodotti diluiscono quelli migliori.
export function addRiflePoints(nation, count, quality) {
  if (!(count > 0)) return nation;
  if (!(quality > 0) && !nation.rifles) return nation; // finché la nazione produce solo fucili a ripetizione non serve tenere il conto
  const prev = nation.rifles ?? { points: 0 };
  return { ...nation, rifles: { points: r3(prev.points + count * Math.max(0, quality)), count: Math.round((prev.count ?? prev.points) + count) } };
}

/** Toglie i punti dei fucili persi in battaglia: count pezzi alla qualità media attuale (mai sotto zero). */
export function removeRiflePoints(nation, count, avgQuality) {
  if (!(count > 0) || !nation.rifles) return nation;
  const out = { points: r3(Math.max(0, nation.rifles.points - count * Math.max(0, avgQuality))) };
  if (nation.rifles.count !== undefined) out.count = Math.max(0, nation.rifles.count - count);
  return { ...nation, rifles: out };
}

/** Qualità media (0..maxQuality) dati i punti e gli uomini previsti. */
// count (facoltativo) = fucili contati: la media si fa sul maggiore fra uomini previsti e fucili contati.
export function averageQuality(doc, points, plannedMen, count = 0) {
  if (!(plannedMen > 0) || !(points > 0)) return 0;
  return Math.min(doc?.rifleQuality?.maxQuality ?? 1, points / Math.max(plannedMen, count || 0));
}

/** Bonus in battaglia per una divisione della categoria data (0 se la categoria non usa i fucili come arma principale). */
export function rifleBonus(doc, category, avgQuality) {
  const q = doc?.rifleQuality;
  if (!q || !q.categories.includes(category)) return 0;
  return r3(q.bonusPerQuality * avgQuality);
}

/** Bonus delle tecnologie ricercate (techBonus): vale appena la ricerca è finita, per le stesse categorie. techs = Set degli id. */
export function rifleTechBonus(doc, category, techs) {
  const q = doc?.rifleQuality;
  if (!q?.techBonus || !q.categories.includes(category)) return 0;
  return r3(Object.entries(q.techBonus).reduce((s, [id, b]) => (techs.has(id) ? s + b : s), 0));
}

/** Errori della configurazione (vuoto = valida). techIds (facoltativo) = id delle tecnologie esistenti. */
export function validateRifleQuality(doc, { techIds = null } = {}) {
  const q = doc?.rifleQuality;
  if (!q) return ['fucili: rifleQuality mancante'];
  const errors = [];
  for (const t of ['bolt', 'sniper', 'semi', 'selective']) if (!(q.byType?.[t] >= 0)) errors.push(`fucili: qualità del tipo ${t} non valida`);
  if (!(q.maxQuality > 0)) errors.push('fucili: maxQuality non valida');
  if ('limitedShare' in q && !(q.limitedShare >= 0 && q.limitedShare <= 1)) errors.push('fucili: limitedShare fuori da 0..1');
  if (!(q.bonusPerQuality >= 0 && q.bonusPerQuality * q.maxQuality <= 0.5)) errors.push('fucili: bonusPerQuality non valido (bonus massimo oltre il 50%)');
  if (!Array.isArray(q.categories)) errors.push('fucili: categorie mancanti');
  const tb = q.techBonus ?? {};
  for (const [id, b] of Object.entries(tb)) {
    if (!(b >= 0)) errors.push(`fucili: bonus della tecnologia ${id} non valido`);
    if (techIds && !techIds.has(id)) errors.push(`fucili: bonus per la tecnologia inesistente ${id}`);
  }
  if (Object.values(tb).reduce((s, b) => s + b, 0) > 0.2) errors.push('fucili: bonus delle tecnologie oltre il 20% in totale');
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
