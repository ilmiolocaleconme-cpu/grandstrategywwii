// Modelli di divisione del giocatore e riorganizzazione delle divisioni (editor a moduli, 18/11/2026). Funzioni PURE.
// Decisioni dell'utente (18/11/2026): limiti storici (src/data/modules.js → designProblems) e riorganizzazione GRADUALE: la divisione passa subito
// al nuovo modello, la dotazione che c'è si porta (anche con la mappa delle voci vecchie, data/units/equipment/upgrade_map.json), quello che manca
// lo portano i rinforzi dalle scorte e dalla produzione; quello che avanza torna alla scorta nazionale. Niente pezzi gratis, niente perso in silenzio.
// Stato (OPZIONALE, assente = nessun modello): state.designs = { schema, byId: { 'DSG-DEU-001': { id, nation, name, category, modules: [[id, n]], createdOn } } }.
import { designProblems, designCategory, designTemplate, sumComposition } from '../data/modules.js';
import { upgradeDivision } from '../rules/templateUpgrade.js';
import { applyUnitChange } from '../rules/unitRegistry.js';

export const DESIGNS_SCHEMA = 'division-designs-v1';
const ID_RE = /^DSG-[A-Z]{3,4}-\d{3}$/;
const r3 = (v) => Math.round(v * 1000) / 1000;

export const designsOf = (state, nation) => Object.values(state.designs?.byId ?? {}).filter((d) => d.nation === nation).sort((a, b) => (a.id < b.id ? -1 : 1));

/** Template di tutti i modelli dello stato (per le schede delle unità). */
export const designTemplates = (state, modules) => Object.values(state.designs?.byId ?? {}).map((d) => designTemplate(d, modules));

/** Divisioni (id) che usano un modello. */
export const divisionsUsing = (state, designId) => Object.entries(state.forces?.divisions ?? {}).filter(([, d]) => d.templateId === designId).map(([id]) => id).sort();

/**
 * Crea un modello. input: { nation, name, modules: [[id, n]] }; ctx: { modules, rules, researched (Set) }. Lancia un Error con i motivi se non è valido.
 * Ritorna { state, id }.
 */
export function createDesign(state, { nation, name, modules: list }, ctx) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('dai un nome al modello');
  if (clean.length > ctx.rules.nameMax) throw new Error(`nome troppo lungo (massimo ${ctx.rules.nameMax} caratteri)`);
  if (designsOf(state, nation).some((d) => d.name.toLowerCase() === clean.toLowerCase())) throw new Error(`esiste già un modello «${clean}»`);
  const compact = list.filter(([, n]) => n > 0);
  const problems = designProblems(compact, { modules: ctx.modules, rules: ctx.rules, nation, date: state.date, researched: ctx.researched });
  if (problems.length) throw new Error(problems.join('; '));
  const seq = Math.max(0, ...Object.keys(state.designs?.byId ?? {}).filter((k) => k.startsWith(`DSG-${nation}-`)).map((k) => Number(k.slice(-3)))) + 1;
  if (seq > 999) throw new Error('troppi modelli');
  const id = `DSG-${nation}-${String(seq).padStart(3, '0')}`;
  const design = { id, nation, name: clean, category: designCategory(compact, ctx.modules), modules: compact, createdOn: state.date };
  const cur = state.designs ?? { schema: DESIGNS_SCHEMA, byId: {} };
  return { state: { ...state, designs: { ...cur, byId: { ...cur.byId, [id]: design } } }, id };
}

/** Elimina un modello non usato da nessuna divisione. */
export function deleteDesign(state, designId) {
  if (!state.designs?.byId?.[designId]) throw new Error(`modello inesistente: ${designId}`);
  const used = divisionsUsing(state, designId);
  if (used.length) throw new Error(`il modello è usato da ${used.length} divisioni`);
  const { [designId]: _gone, ...rest } = state.designs.byId;
  return { ...state, designs: { ...state.designs, byId: rest } };
}

/**
 * Riorganizza una divisione sul modello (riorganizzazione graduale). ctx: { modules, unit (dell'anagrafe, già con i cambi), upgradeMap, isStockItem(percorso) → bool }.
 * isStockItem dice quali voci tolte possono tornare in magazzino (equipaggiamenti del catalogo, cavalli): le altre restano registrate in `dropped`.
 * Ritorna { state, surplus, dropped }.
 */
export function reorganizeDivision(state, divisionId, designId, ctx) {
  const design = state.designs?.byId?.[designId];
  if (!design) throw new Error(`modello inesistente: ${designId}`);
  const division = state.forces?.divisions?.[divisionId];
  if (!division) throw new Error(`divisione senza istanza: ${divisionId}`);
  const unit = ctx.unit;
  if (!unit || unit.nation !== design.nation) throw new Error('la divisione è di un\'altra nazione');
  if (unit.echelon !== 'division') throw new Error('solo le divisioni si riorganizzano con un modello');
  if (division.templateId === designId) throw new Error('la divisione usa già questo modello');
  const template = designTemplate(design, ctx.modules);
  const up = upgradeDivision(division, template, { nation: design.nation, map: ctx.upgradeMap ?? { entries: [] }, date: state.date });
  const back = { ...up.surplus };
  const dropped = {};
  for (const [path, q] of Object.entries(up.dropped)) { if (ctx.isStockItem?.(path)) back[path] = (back[path] ?? 0) + q; else dropped[path] = q; }
  const record = { from: division.templateId, on: state.date, design: designId, ...(Object.keys(back).length ? { surplus: back } : {}), ...(Object.keys(dropped).length ? { dropped } : {}) };
  // un quadro resta quadro; la divisione riceve rinforzi solo se li aveva già attivi
  let s = { ...state, forces: { ...state.forces, divisions: { ...state.forces.divisions, [divisionId]: { ...up.division, upgrade: record } } } };
  const nat = s.nations?.[design.nation];
  if (nat && Object.keys(back).length) {
    const stocks = { ...nat.stocks };
    for (const [p, q] of Object.entries(back)) stocks[p] = r3((stocks[p] ?? 0) + q);
    s = { ...s, nations: { ...s.nations, [design.nation]: { ...nat, stocks } } };
  }
  if (unit.category !== design.category) s = applyUnitChange(s, divisionId, { category: design.category }, { date: state.date, event: `riorganizzazione:${designId}` });
  return { state: s, surplus: back, dropped };
}

/** Anteprima di una riorganizzazione: per ogni voce del modello quanto c'è già e quanto manca (senza toccare lo stato). */
export function reorganizePreview(state, divisionId, designId, ctx) {
  const r = reorganizeDivision(state, divisionId, designId, ctx);
  const d = r.state.forces.divisions[divisionId];
  const missing = Object.fromEntries(Object.entries(d.items).filter(([, it]) => it.planned > it.effective).map(([k, it]) => [k, it.planned - it.effective]));
  return { missing, back: r.surplus, dropped: r.dropped };
}

/** Totali di un modello: { men, horses, equipment } (somma dei battaglioni). */
export const designTotals = (list, modules) => sumComposition(modules, list.filter(([, n]) => n > 0));

/** Errori di forma di state.designs (facoltativo). */
export function validateDesignsState(d) {
  if (d === undefined) return [];
  if (d === null || typeof d !== 'object' || d.schema !== DESIGNS_SCHEMA || d.byId === null || typeof d.byId !== 'object') return ['modelli di divisione: forma non valida'];
  const e = [];
  for (const [id, x] of Object.entries(d.byId)) {
    if (!ID_RE.test(id) || x?.id !== id) e.push(`modelli di divisione: id ${id} non valido`);
    if (typeof x?.name !== 'string' || !x.name) e.push(`modelli di divisione: ${id} senza nome`);
    if (id.split('-')[1] !== x?.nation) e.push(`modelli di divisione: ${id} nazione incoerente`);
    if (!['infantry', 'motorized', 'mechanized', 'armored'].includes(x?.category)) e.push(`modelli di divisione: ${id} categoria non valida`);
    if (!Array.isArray(x?.modules) || !x.modules.length || !x.modules.every((m) => Array.isArray(m) && typeof m[0] === 'string' && Number.isInteger(m[1]) && m[1] > 0)) e.push(`modelli di divisione: ${id} battaglioni non validi`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x?.createdOn ?? '')) e.push(`modelli di divisione: ${id} senza data`);
  }
  return e;
}
