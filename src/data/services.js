// Servizi dei reparti (20/11/2026): Waffen-SS, Guardie sovietiche, Guardia imperiale giapponese… con uno schema comune a tutte le nazioni.
// Dati: data/units/services.json. Funzioni PURE. Effetti solo su meccaniche esistenti: esperienza iniziale e precedenza nei rinforzi.
export const SERVICES_SCHEMA = 'unit-services-v1';
const ORIGINS = ['formation', 'promotion', 'event'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Errori del file (vuoto = valido). unitsById (facoltativo): Map id → unità del catalogo. */
export function validateServices(doc, { unitsById = null } = {}) {
  if (doc?.schema !== SERVICES_SCHEMA) return [`servizi: schema ${JSON.stringify(doc?.schema)}`];
  const e = []; const ids = new Set(); const defaults = new Map(); const owner = new Map();
  for (const s of doc.services ?? []) {
    const p = `servizio ${s?.id ?? '?'}`;
    if (!/^[A-Z]{3,4}-[A-Z0-9-]+$/.test(s?.id ?? '') || s.id.split('-')[0] !== s.nation) { e.push(`${p}: id non valido o di un'altra nazione`); continue; }
    if (ids.has(s.id)) e.push(`${p}: duplicato`);
    ids.add(s.id);
    if (!s.name_native || !s.name_it) e.push(`${p}: nomi mancanti`);
    if (!(Number.isInteger(s.experienceBonus) && s.experienceBonus >= 0 && s.experienceBonus <= 30)) e.push(`${p}: experienceBonus fuori da 0–30`);
    if (typeof s.reinforcementPriority !== 'boolean') e.push(`${p}: reinforcementPriority non booleano`);
    if (!ORIGINS.includes(s.origin)) e.push(`${p}: origin ${JSON.stringify(s.origin)}`);
    if (s.availableFrom !== undefined && !DATE_RE.test(s.availableFrom)) e.push(`${p}: availableFrom non valido`);
    if (s.origin === 'promotion') { // promozione in partita (20/11/2026)
      const pr = s.promotion;
      if (!pr || !Number.isInteger(pr.wins) || pr.wins < 1 || typeof pr.from !== 'string' || !pr.names || typeof pr.names !== 'object') e.push(`${p}: promozione senza from, wins o names`);
      else for (const [k, v] of Object.entries(pr.names)) if (!/^(division|brigade)(:[a-z]+)?$/.test(k) || typeof v !== 'string' || !v.includes('{k}')) e.push(`${p}: nome di promozione ${k} non valido`);
    }
    if (s.default) { if (defaults.has(s.nation)) e.push(`${p}: secondo servizio di default per ${s.nation}`); defaults.set(s.nation, s.id); if (s.units?.length) e.push(`${p}: il servizio di default non elenca reparti`); }
    for (const u of s.units ?? []) {
      if (owner.has(u)) e.push(`${p}: il reparto ${u} è già di ${owner.get(u)}`);
      owner.set(u, s.id);
      const unit = unitsById?.get(u);
      if (unitsById && !unit) e.push(`${p}: reparto ${u} inesistente`);
      else if (unit && unit.nation !== s.nation) e.push(`${p}: il reparto ${u} è di ${unit.nation}`);
    }
  }
  for (const s of doc.services ?? []) if (s.promotion?.from && !ids.has(s.promotion.from)) e.push(`servizio ${s.id}: promozione da ${s.promotion.from}, servizio inesistente`);
  return e;
}

/** Servizio di un reparto: quello che lo elenca, altrimenti il default della sua nazione, altrimenti null. */
export function serviceOf(doc, unit) {
  if (!unit) return null;
  const list = doc?.services ?? [];
  return list.find((s) => s.units?.includes(unit.id)) ?? list.find((s) => s.default && s.nation === unit.nation) ?? null;
}

/**
 * Configurazione della condizione con l'esperienza iniziale per reparto (base della nazione + bonus del servizio), in `existing1936.experienceByUnit`.
 * Così tutte le regole che leggono la condizione (battaglia, schede, comandi) vedono il servizio senza modifiche.
 */
export function withServiceExperience(cfg, doc, units) {
  const ex = cfg.initial.existing1936;
  const byUnit = {};
  for (const u of units) {
    const s = serviceOf(doc, u);
    if (!s?.experienceBonus) continue;
    byUnit[u.id] = Math.min(100, (ex.experienceByNation?.[u.nation] ?? ex.experience) + s.experienceBonus);
  }
  return { ...cfg, initial: { ...cfg.initial, existing1936: { ...ex, experienceByUnit: byUnit } } };
}

/** { id: true } dei reparti di una nazione con precedenza nei rinforzi per servizio (stessa forma delle richieste del giocatore). */
export function servicePriority(doc, units, nation, state = null) {
  const out = {};
  for (const u of units) {
    if (u.nation !== nation) continue;
    const p = state?.honors?.services?.[u.id]; // promosso in partita (src/game/honorsState.js)
    const svc = (p && (doc?.services ?? []).find((x) => x.id === p.service)) ?? serviceOf(doc, u);
    if (svc?.reinforcementPriority) out[u.id] = true;
  }
  return out;
}
