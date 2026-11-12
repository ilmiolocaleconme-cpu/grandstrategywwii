// Modelli di fucili (data/units/models/fucili_1930_1945.json): solo dati e funzioni PURE (12/11/2026).
// Nell'economia il fucile è UN SOLO prodotto (categoria INDIVIDUAL_WEAPON): il modello dice quale versione una nazione può produrre.
// Regola di disponibilità (scelta di progetto, DESIGN_DEFAULT): un modello è producibile quando
//  1) la nazione ha la tecnologia richiesta (campo `requires` del modello o, se nullo, quella del modello padre, risalendo la catena);
//  2) l'anno di gioco è almeno `available` - earlyYears (la ricerca anticipata serve, ma non oltre il margine);
//  3) lo stato non è 'stock' (solo scorte esistenti) né 'experimental' (mai in serie).
export const SMALL_ARMS_SCHEMA = 'small-arms-models-v1';
const TYPES = ['bolt', 'semi', 'selective', 'sniper'];
const STATUSES = ['standard', 'limited', 'experimental', 'stock', 'foreign'];
const NOT_PRODUCIBLE = new Set(['stock', 'experimental']);

/** Errori del file (lista vuota = valido). techIds = id delle tecnologie esistenti; nationIds (facoltativo) = id delle nazioni. */
export function validateSmallArms(doc, { techIds = null, nationIds = null } = {}) {
  if (doc?.schema !== SMALL_ARMS_SCHEMA) return [`fucili: schema ${JSON.stringify(doc?.schema)}`];
  const errors = [];
  if (!Number.isInteger(doc.earlyYears) || doc.earlyYears < 0) errors.push('fucili: earlyYears non valido');
  const byId = new Map();
  for (const m of doc.models ?? []) {
    const p = `fucili: ${m?.id ?? '?'}`;
    if (!/^MDL-[A-Z]{3,4}-[A-Z0-9-]+$/.test(m?.id ?? '')) { errors.push(`${p}: id non valido`); continue; }
    if (byId.has(m.id)) errors.push(`${p}: id duplicato`);
    byId.set(m.id, m);
    if (!m.id.startsWith(`MDL-${m.nation}-`)) errors.push(`${p}: l'id non corrisponde alla nazione ${m.nation}`);
    if (nationIds && !nationIds.has(m.nation)) errors.push(`${p}: nazione ${m.nation} inesistente`);
    if (!String(m.designation ?? '').trim()) errors.push(`${p}: senza nome`);
    if (!TYPES.includes(m.type)) errors.push(`${p}: tipo ${JSON.stringify(m.type)}`);
    if (!String(m.caliber ?? '').trim()) errors.push(`${p}: senza calibro`);
    if (!Number.isInteger(m.magazine) || m.magazine < 1) errors.push(`${p}: capacità non valida`);
    if (!Number.isInteger(m.available)) errors.push(`${p}: anno di disponibilità non valido`);
    if (m.productionEnd !== null && (!Number.isInteger(m.productionEnd) || m.productionEnd < m.available)) errors.push(`${p}: fine produzione non valida`);
    if (!STATUSES.includes(m.status)) errors.push(`${p}: stato ${JSON.stringify(m.status)}`);
    if (m.status === 'foreign' && !m.origin) errors.push(`${p}: modello straniero senza origine`); // l'origine può esserci anche per le scorte (es. prede belliche)
    if (m.origin && (!/^[A-Z]{3,4}$/.test(m.origin) || m.origin === m.nation)) errors.push(`${p}: origine non valida`);
    if (!['utente', 'ipotesi'].includes(m.basis)) errors.push(`${p}: basis ${JSON.stringify(m.basis)}`);
    if (!String(m.note ?? '').trim()) errors.push(`${p}: senza nota`);
    if (m.requires !== null && typeof m.requires !== 'string') errors.push(`${p}: tecnologia non valida`);
    if (techIds && m.requires && !techIds.has(m.requires)) errors.push(`${p}: tecnologia ${m.requires} inesistente`);
  }
  for (const m of byId.values()) {
    if (m.parent === null || m.parent === undefined) continue;
    const par = byId.get(m.parent);
    if (!par) { errors.push(`fucili: ${m.id}: modello padre ${m.parent} inesistente`); continue; }
    if (par.nation !== m.nation) errors.push(`fucili: ${m.id}: modello padre di un'altra nazione`);
    const seen = new Set([m.id]);
    for (let c = par; c; c = byId.get(c.parent)) {
      if (seen.has(c.id)) { errors.push(`fucili: ${m.id}: ciclo nei modelli padre`); break; }
      seen.add(c.id);
    }
  }
  return errors;
}

const indexOf = (doc) => new Map((doc?.models ?? []).map((m) => [m.id, m]));

/** Tecnologie richieste da un modello: la sua più quelle della catena dei padri (senza duplicati). */
export function requiredTechs(doc, model, index = indexOf(doc)) {
  const out = [];
  const seen = new Set();
  for (let m = model; m && !seen.has(m.id); m = index.get(m.parent)) {
    seen.add(m.id);
    if (m.requires && !out.includes(m.requires)) out.push(m.requires);
  }
  return out;
}

/** Id delle tecnologie usate dai modelli: servono a validateTechnologies (ogni tecnologia deve avere un'utilità). */
export const smallArmsConsumers = (doc) => new Set((doc?.models ?? []).map((m) => m.requires).filter(Boolean));

/** Modelli producibili da una nazione nell'anno `year` con le tecnologie `techs` (Set). */
export function producibleModels(doc, nationId, year, techs) {
  const index = indexOf(doc);
  const early = doc?.earlyYears ?? 0;
  return (doc?.models ?? []).filter((m) => m.nation === nationId && !NOT_PRODUCIBLE.has(m.status)
    && year >= m.available - early && requiredTechs(doc, m, index).every((t) => techs.has(t)));
}

/** Modelli di una nazione che una tecnologia contribuisce a sbloccare (per il pannello Ricerca). */
export function modelsUnlockedBy(doc, techId, nationId) {
  const index = indexOf(doc);
  return (doc?.models ?? []).filter((m) => m.nation === nationId && !NOT_PRODUCIBLE.has(m.status) && requiredTechs(doc, m, index).includes(techId));
}
