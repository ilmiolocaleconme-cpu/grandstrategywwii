// Economia di base (data/economy/economy.json): prezzi, quota territoriale, difficoltà e miniere. Solo dati e funzioni PURE.
// Valuta di gioco unica (ECV, stessa unità dei costi di costruzione del Pack). Qualità DESIGN_DEFAULT: bilanciamento da rivedere.
export const ECONOMY_SCHEMA = 'economy-v1';

const round = (v) => Math.round(v * 1000) / 1000;

/** Errori (lista vuota = valido). ctx: { resources: [{id,tipo?}], recipes: file ricette } */
export function validateEconomy(file, { resources, recipes }) {
  const errors = [];
  if (file?.schema !== ECONOMY_SCHEMA) return [`economia: schema ${file?.schema}, atteso ${ECONOMY_SCHEMA}`];
  if (file.quality !== 'DESIGN_DEFAULT') errors.push('economia: qualità attesa DESIGN_DEFAULT');
  if (!file.currency?.id) errors.push('economia: manca la valuta');
  const known = new Set(resources.map((r) => r.id));
  const prices = file.prices ?? {};
  for (const [id, v] of Object.entries(prices)) {
    if (!known.has(id)) errors.push(`economia: prezzo di ${id}, che non esiste in resources.json`);
    if (v !== null && !(v > 0)) errors.push(`economia: prezzo non valido per ${id}`);
  }
  for (const id of known) if (!(id in prices) && id !== 'hydro' && id !== 'food' && id !== 'manpower') errors.push(`economia: manca il prezzo di ${id} (usare null se non commerciabile)`);
  // ogni merce che una ricetta consuma o produce (esclusa l'elettricità) deve avere un prezzo
  const traded = new Set();
  for (const r of recipes?.recipes ?? []) { traded.add(r.output.product); for (const i of r.inputs) traded.add(i.resource); }
  for (const id of traded) if (id !== 'electricity' && !(prices[id] > 0)) errors.push(`economia: ${id} è usata da una ricetta ma senza prezzo`);
  if (prices.electricity !== null && prices.electricity !== undefined) errors.push('economia: l\'elettricità è un servizio, il prezzo deve essere null');
  const t = file.territory ?? {};
  for (const k of ['perProvince', 'perCity', 'perCapital']) if (!(t[k] >= 0)) errors.push(`economia: territorio.${k} non valido`);
  const levels = file.difficulty?.levels ?? [];
  const ids = new Set();
  for (const l of levels) {
    if (!l.id || ids.has(l.id)) errors.push(`economia: difficoltà senza id o duplicata (${l.id})`);
    ids.add(l.id);
    for (const k of ['costMul', 'timeMul', 'stockMul', 'incomeMul']) if (!(l[k] > 0)) errors.push(`economia: ${l.id}.${k} non valido`);
  }
  if (!ids.has(file.difficulty?.default)) errors.push('economia: difficoltà predefinita inesistente');
  const def = levels.find((l) => l.id === file.difficulty?.default);
  if (def && ['costMul', 'timeMul', 'stockMul', 'incomeMul'].some((k) => def[k] !== 1)) errors.push('economia: la difficoltà predefinita deve avere tutti i moltiplicatori a 1');
  const m = file.mines ?? {};
  if (!(Number.isInteger(m.gapParts) && m.gapParts >= 1)) errors.push('economia: miniere.gapParts non valido');
  const ml = m.levels ?? [];
  if (ml.length !== m.gapParts) errors.push('economia: i livelli delle miniere devono essere gapParts');
  ml.forEach((l, i) => {
    if (l.level !== i + 1) errors.push(`economia: livello miniera ${l.level} fuori ordine`);
    for (const k of ['ecv', 'days', 'steel', 'workers']) if (!(l[k] > 0)) errors.push(`economia: miniera L${l.level} con ${k} non valido`);
    if (i > 0 && !(l.ecv >= ml[i - 1].ecv)) errors.push(`economia: miniera L${l.level} costa meno del livello precedente`);
  });
  return errors;
}

/** Moltiplicatori della difficoltà scelta. Id sconosciuto = null (mai un valore a caso). */
export function difficulty(file, id) {
  return (file.difficulty?.levels ?? []).find((l) => l.id === (id ?? file.difficulty.default)) ?? null;
}

/** Costo di costruire il livello `level` di una miniera con la difficoltà data; null se il livello non esiste. */
export function mineCost(file, level, difficultyId) {
  const l = (file.mines?.levels ?? []).find((x) => x.level === level);
  const d = difficulty(file, difficultyId);
  if (!l || !d) return null;
  return { ecv: round(l.ecv * d.costMul), days: Math.ceil(l.days * d.timeMul), steel: round(l.steel * d.costMul), workers: l.workers };
}

/** Punti attivi di una provincia e risorsa a un dato livello di miniera (0 = nessuna miniera = base). Mai oltre max. */
export function minePoints(file, base, max, level) {
  const parts = file.mines.gapParts;
  const lv = Math.min(Math.max(level, 0), parts);
  return round(base + (max - base) * lv / parts);
}
