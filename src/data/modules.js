// Battaglioni (moduli) delle divisioni (18/11/2026): base dell'editor a moduli scelto dall'utente. Funzioni PURE, nessun I/O.
// Un modulo = { id, nation, type, name_it, men, horses, equipment: { equipment_id: pezzi }, mobility, requiresTech?, availableFrom? }.
// Una composizione = { templateId, file, category, activeFrom, formation, modules: [[idModulo, quanti], ...] }: il template della divisione è la
// SOMMA dei suoi moduli, nello stesso formato degli altri template (data/units/templates), così forze, rinforzi e battaglia non cambiano.
export const MODULES_SCHEMA = 'battalion-modules-v1';
export const MODULE_TYPES = Object.freeze(['infantry', 'motorized_infantry', 'mechanized_infantry', 'artillery', 'anti_tank', 'tank', 'support']);
export const MOBILITY = Object.freeze(['foot', 'motorized', 'mechanized', 'armored']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Errori del file dei moduli (lista vuota = valido). catalogIds / techIds (facoltativi): insiemi degli id esistenti. */
export function validateModules(doc, { catalogIds = null, techIds = null } = {}) {
  if (doc?.schema !== MODULES_SCHEMA) return [`moduli: schema ${JSON.stringify(doc?.schema)}`];
  const e = [];
  const ids = new Set();
  for (const m of doc.modules ?? []) {
    const p = `modulo ${m?.id ?? '?'}`;
    if (!/^MOD-[A-Z]{3,4}-[A-Z0-9-]+$/.test(m?.id ?? '')) { e.push(`${p}: id non valido`); continue; }
    if (ids.has(m.id)) e.push(`${p}: id duplicato`);
    ids.add(m.id);
    if (m.id.split('-')[1] !== m.nation) e.push(`${p}: la nazione dell'id differisce da ${m.nation}`);
    if (!MODULE_TYPES.includes(m.type)) e.push(`${p}: tipo ${JSON.stringify(m.type)}`);
    if (!MOBILITY.includes(m.mobility)) e.push(`${p}: mobilità ${JSON.stringify(m.mobility)}`);
    if (!(Number.isInteger(m.men) && m.men > 0)) e.push(`${p}: uomini non validi`);
    if (!(Number.isInteger(m.horses) && m.horses >= 0)) e.push(`${p}: cavalli non validi`);
    if (!m.name_it) e.push(`${p}: nome mancante`);
    for (const [k, v] of Object.entries(m.equipment ?? {})) {
      if (!(Number.isInteger(v) && v > 0)) e.push(`${p}: ${k} con quantità non valida`);
      if (catalogIds && !catalogIds.has(k)) e.push(`${p}: ${k} non è nel catalogo`);
      if (k.split('-')[1] !== m.nation) e.push(`${p}: ${k} è di un'altra nazione`);
    }
    if (m.requiresTech !== undefined && techIds && !techIds.has(m.requiresTech)) e.push(`${p}: tecnologia ${m.requiresTech} inesistente`);
    if (m.availableFrom !== undefined && !DATE_RE.test(m.availableFrom)) e.push(`${p}: availableFrom non valido`);
    if (m.mobility === 'motorized' && !Object.keys(m.equipment ?? {}).some((k) => k.startsWith('VEH-'))) e.push(`${p}: motorizzato senza veicoli`);
  }
  const tpl = new Set();
  for (const c of doc.compositions ?? []) {
    const p = `composizione ${c?.templateId ?? '?'}`;
    if (!/^TPL-[A-Z]+-[A-Z]+-\d{4}$/.test(c?.templateId ?? '')) e.push(`${p}: id del template non valido`);
    if (tpl.has(c.templateId)) e.push(`${p}: duplicata`);
    tpl.add(c.templateId);
    if (!DATE_RE.test(c.activeFrom ?? '')) e.push(`${p}: activeFrom non valido`);
    if (!/^divisione_[a-z_]+_\d{4}\.json$/.test(c.file ?? '')) e.push(`${p}: nome del file non valido`);
    if (!(c.modules ?? []).length) e.push(`${p}: nessun modulo`);
    for (const [id, n] of c.modules ?? []) {
      const m = (doc.modules ?? []).find((x) => x.id === id);
      if (!m) e.push(`${p}: modulo ${id} inesistente`);
      else if (m.availableFrom && m.availableFrom > c.activeFrom) e.push(`${p}: il modulo ${id} esiste solo dal ${m.availableFrom}`);
      if (!(Number.isInteger(n) && n > 0)) e.push(`${p}: quantità di ${id} non valida`);
    }
  }
  return e;
}

/** Somma di una composizione: { men, horses, equipment: { id: pezzi } } (chiavi ordinate). */
export function sumComposition(modules, list) {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const out = { men: 0, horses: 0, equipment: {} };
  for (const [id, n] of list) {
    const m = byId.get(id);
    if (!m) throw new Error(`modulo ${id} inesistente`);
    out.men += m.men * n; out.horses += m.horses * n;
    for (const [k, v] of Object.entries(m.equipment)) out.equipment[k] = (out.equipment[k] ?? 0) + v * n;
  }
  out.equipment = Object.fromEntries(Object.entries(out.equipment).sort(([a], [b]) => (a < b ? -1 : 1)));
  return out;
}

/** Template di divisione (stesso formato di data/units/templates) da una composizione. */
export function templateFromComposition(doc, comp) {
  const sum = sumComposition(doc.modules, comp.modules);
  const nation = comp.templateId.split('-')[1];
  const src = `Somma dei battaglioni di data/units/modules (${comp.modules.map(([id, n]) => `${n}× ${id}`).join(', ')}). Organici stimati da Claude, NON verificati.`;
  const leaf = (value) => ({ value, basis: 'ipotesi', referenceYear: comp.activeFrom.slice(0, 4), source: src, reliability: 'ESTIMATED', effective: { value: null, asOf: null, basis: 'da_definire', source: null } });
  const plain = (value) => ({ value, basis: 'ipotesi', referenceYear: comp.activeFrom.slice(0, 4), source: src, reliability: 'ESTIMATED' });
  return {
    schema: 'unit-template-v1', id: comp.templateId, status: 'RECONSTRUCTED_TEMPLATE',
    appliesTo: { nation, category: comp.category, echelon: 'division', activeFrom: comp.activeFrom },
    orgLevel: 'war',
    note: `Template generato dai battaglioni (scripts/build-module-templates.js, 18/11/2026): non modificare a mano, cambiare data/units/modules/. ${comp.formation}.`,
    formation: plain(comp.formation),
    modules: comp.modules.map(([id, count]) => ({ id, count })),
    manpower: { war: leaf(sum.men), peace: { value: null, basis: 'da_definire', referenceYear: null, source: null } },
    horses: leaf(sum.horses),
    equipment: Object.fromEntries(Object.entries(sum.equipment).map(([k, v]) => [k, leaf(v)])),
    effectiveSupply: { value: null, basis: 'da_definire', note: 'Dotazione effettiva per data: non definita.' },
    costs: { resources: null, manpower: null, buildDays: null, upkeep: null, note: 'Da definire con l\'editor a moduli.' },
  };
}

/**
 * Velocità di marcia (km/giorno) di una divisione secondo i veicoli che ha davvero (18/11/2026): se il template prevede veicoli (VEH-*),
 * va da `foot` (nessun veicolo) a `motor` (tutti i veicoli previsti) in proporzione ai veicoli effettivi; senza veicoli previsti → null
 * (vale la velocità della categoria, come prima). items: voci della divisione.
 */
export function vehicleMarchSpeed(items, foot, motor) {
  let planned = 0; let effective = 0;
  for (const [k, v] of Object.entries(items ?? {})) {
    if (!k.startsWith('equipment.VEH-') || !(v?.planned > 0)) continue;
    planned += v.planned; effective += Math.min(v.planned, Math.max(0, v.effective ?? 0));
  }
  if (!(planned > 0) || !(motor > foot)) return null;
  return Math.round(foot + (motor - foot) * (effective / planned));
}
