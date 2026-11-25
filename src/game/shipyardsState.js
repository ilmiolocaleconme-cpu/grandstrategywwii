// Scali dei cantieri navali in partita (25/11/2026). Campo facoltativo state.shipyards: assente = livelli del 1936 di data/naval/shipyards_1936.json.
// state.shipyards = { slipways: { [cittaId]: livello } } contiene solo gli scali POTENZIATI; i lavori in corso stanno nella coda delle costruzioni (kind 'slipway').
// Lo scalo sta sulla città costiera, come il porto: alla conquista passa con il suo livello. Funzioni PURE.
const SHIPYARD_ID = 'FCT-SHIPYARD'; // come src/map/portIcons.js

export function validateShipyardsShape(yards) {
  if (yards === undefined) return [];
  if (yards === null || typeof yards !== 'object' || yards.slipways === null || typeof yards.slipways !== 'object' || Array.isArray(yards.slipways)) return ['stato: shipyards non valida'];
  const errors = [];
  for (const [id, v] of Object.entries(yards.slipways)) if (!Number.isInteger(v) || v < 1 || v > 4) errors.push(`stato: shipyards, livello di scalo ${v} non valido per ${id}`);
  return errors;
}

/** Indice dei cantieri storici per città: cittaId → voce di shipyards_1936.json. */
export const historicYardsByCity = (doc) => new Map((doc?.shipyards ?? []).map((y) => [y.cittaId, y]));

/**
 * Le città costiere della provincia madre `motherId` che hanno uno scalo: quelle con un cantiere storico e, se nella provincia c'è un cantiere
 * costruito in partita (FCT-SHIPYARD) e nessuna città storica, la prima città costiera in ordine di id (stessa scelta del segnalino sulla mappa).
 * ctx: { coastal (cittaId → { parentProvince }), historic (historicYardsByCity), motherOf?(id) → provincia madre }.
 */
export function slipwayCitiesOf(state, motherId, { coastal, historic, motherOf = (id) => id }) {
  const cities = Object.keys(coastal).filter((id) => coastal[id].parentProvince === motherId).sort();
  const hist = cities.filter((id) => historic.has(id));
  if (hist.length) return hist;
  const built = Object.values(state?.nations ?? {}).some((n) => (n.facilities ?? []).some((f) => f.type === SHIPYARD_ID && typeof f.provinceId === 'string' && motherOf(f.provinceId) === motherId));
  return built && cities.length ? [cities[0]] : [];
}

/** Livello di scalo della città: stato di partita, altrimenti livello storico, altrimenti 1 se ha un cantiere costruito, altrimenti 0 (nessuno scalo). */
export function slipwayLevelIn(state, cittaId, ctx) {
  const v = state?.shipyards?.slipways?.[cittaId];
  if (v) return v;
  const h = ctx.historic.get(cittaId);
  if (h) return h.slipway;
  const mother = ctx.coastal[cittaId]?.parentProvince;
  return mother && slipwayCitiesOf(state, mother, ctx).includes(cittaId) ? 1 : 0;
}
