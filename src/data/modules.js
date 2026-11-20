// Battaglioni (moduli) delle divisioni (18/11/2026): base dell'editor a moduli scelto dall'utente. Funzioni PURE, nessun I/O.
// Un modulo = { id, nation, type, name_it, men, horses, equipment: { equipment_id: pezzi }, mobility, requiresTech?, availableFrom? }.
// Una composizione = { templateId, file, category, activeFrom, formation, modules: [[idModulo, quanti], ...] }: il template della divisione è la
// SOMMA dei suoi moduli, nello stesso formato degli altri template (data/units/templates), così forze, rinforzi e battaglia non cambiano.
export const MODULES_SCHEMA = 'battalion-modules-v1';
export const MODULE_TYPES = Object.freeze(['infantry', 'motorized_infantry', 'mechanized_infantry', 'mountain_infantry', 'airborne_infantry', 'cavalry', 'artillery', 'anti_tank', 'anti_air', 'tank', 'recon', 'engineer', 'support']); // 19/11/2026: + montagna, paracadutisti, cavalleria, contraerea, esplorazione, genio
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
    if (m.requiresTech !== undefined && !(typeof m.requiresTech === 'string' || (Array.isArray(m.requiresTech) && m.requiresTech.length))) e.push(`${p}: requiresTech non valido`);
    else if (m.requiresTech !== undefined && techIds) for (const t of [m.requiresTech].flat()) if (!techIds.has(t)) e.push(`${p}: tecnologia ${t} inesistente`);
    if (m.availableFrom !== undefined && !DATE_RE.test(m.availableFrom)) e.push(`${p}: availableFrom non valido`);
    if (m.divisional !== undefined && m.divisional !== true) e.push(`${p}: divisional ammesso solo come true`);
    for (const k of ['name_de', 'name_ru']) if (m[k] !== undefined && (typeof m[k] !== 'string' || !m[k].trim())) e.push(`${p}: ${k} non valido`); // nome nella lingua della nazione (URSS: russo traslitterato, 19/11/2026)
    if (m.mobility === 'motorized' && !Object.keys(m.equipment ?? {}).some((k) => k.startsWith('VEH-'))) e.push(`${p}: motorizzato senza veicoli`);
  }
  for (const pr of doc.presets ?? []) { // punti di partenza dell'editor (18/11/2026)
    if (!/^PRE-[A-Z]{3,4}-[A-Z0-9-]+$/.test(pr?.id ?? '') || !pr.name) e.push(`modello di partenza ${pr?.id ?? '?'}: id o nome non validi`);
    for (const [id, n] of pr?.modules ?? []) if (!(doc.modules ?? []).some((m) => m.id === id) || !(Number.isInteger(n) && n > 0)) e.push(`modello di partenza ${pr.id}: ${id} non valido`);
  }
  const tpl = new Set();
  for (const c of doc.compositions ?? []) {
    const p = `composizione ${c?.templateId ?? '?'}`;
    if (!/^TPL-[A-Z]+-[A-Z]+-\d{4}$/.test(c?.templateId ?? '')) e.push(`${p}: id del template non valido`);
    if (tpl.has(c.templateId)) e.push(`${p}: duplicata`);
    tpl.add(c.templateId);
    if (!DATE_RE.test(c.activeFrom ?? '')) e.push(`${p}: activeFrom non valido`);
    if (!/^(divisione|brigata)_[a-z_]+_\d{4}\.json$/.test(c.file ?? '')) e.push(`${p}: nome del file non valido`);
    if (c.echelon !== undefined && c.echelon !== 'division' && c.echelon !== 'brigade') e.push(`${p}: echelon ${JSON.stringify(c.echelon)}`);
    if ((c.echelon === 'brigade') !== /^brigata_/.test(c.file ?? '')) e.push(`${p}: file e scaglione non concordano (brigata_ ↔ echelon brigade)`);
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
    appliesTo: { nation, category: comp.category, echelon: comp.echelon ?? 'division', activeFrom: comp.activeFrom }, // brigate composte da battaglioni (19/11/2026)
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

// ---- Editor a moduli (18/11/2026, decisioni dell'utente: limiti storici; riorganizzazione graduale) ----------------------------------------
export const EDITOR_RULES_SCHEMA = 'division-editor-rules-v1';
export const DESIGN_CATEGORIES = Object.freeze(['infantry', 'motorized', 'mechanized', 'armored', 'mountain', 'cavalry', 'airborne']);

/** Errori del file delle regole dell'editor (data/units/modules/editor_rules.json). */
export function validateEditorRules(r) {
  if (r?.schema !== EDITOR_RULES_SCHEMA) return [`editor: schema ${JSON.stringify(r?.schema)}`];
  const e = [];
  for (const k of ['maxMen', 'maxModules', 'minCombat', 'nameMax']) if (!(Number.isInteger(r[k]) && r[k] > 0)) e.push(`editor: ${k} non valido`);
  if (!(Number.isInteger(r.divisional) && r.divisional >= 0)) e.push('editor: divisional non valido');
  for (const [t, n] of Object.entries(r.maxPerType ?? {})) {
    if (!MODULE_TYPES.includes(t)) e.push(`editor: tipo ${t} sconosciuto`);
    if (!(Number.isInteger(n) && n > 0)) e.push(`editor: massimo di ${t} non valido`);
  }
  if (!Array.isArray(r.combatTypes) || !r.combatTypes.every((t) => MODULE_TYPES.includes(t))) e.push('editor: combatTypes non valido');
  return e;
}

/** Modulo disponibile per la nazione alla data con le tecnologie ricercate (Set). */
export function moduleAvailable(m, { nation, date, researched }) {
  if (m.nation !== nation) return false;
  if (m.availableFrom && date && date < m.availableFrom) return false;
  return [m.requiresTech ?? []].flat().every((t) => researched?.has(t));
}

/**
 * Categoria della divisione dai suoi battaglioni: carri → corazzata; fanteria su semicingolati → meccanizzata; almeno metà dei battaglioni
 * di fanteria paracadutisti, da montagna o di cavalleria → paracadutisti, montagna, cavalleria (19/11/2026); tutta motorizzata → motorizzata;
 * altrimenti fanteria. La categoria decide il terreno in battaglia (data/units/terrain_combat.json).
 */
export function designCategory(list, modules) {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const ms = list.map(([id]) => byId.get(id)).filter(Boolean);
  const n = (t) => list.reduce((s, [id, k]) => s + (byId.get(id)?.type === t ? k : 0), 0);
  const foot = ['infantry', 'motorized_infantry', 'mountain_infantry', 'airborne_infantry', 'cavalry'].reduce((s, t) => s + n(t), 0);
  // 20/11/2026: una divisione di cavalleria (o da montagna, paracadutisti) con qualche carro di appoggio resta di cavalleria, se i suoi reparti
  // speciali sono almeno metà della fanteria e più numerosi dei battaglioni carri (es. Kavalerijskaja divizija sovietica: 4 reggimenti e 1 battaglione BT)
  for (const [t, cat] of [['cavalry', 'cavalry'], ['mountain_infantry', 'mountain'], ['airborne_infantry', 'airborne']]) if (foot > 0 && n(t) * 2 >= foot && n(t) > n('tank')) return cat;
  if (ms.some((m) => m.type === 'tank')) return 'armored'; // con i carri resta corazzata (Panzer-Division 1940: 2 battaglioni carri e 4 di fanteria); i template storici usano la loro categoria dichiarata (App.jsx)
  if (ms.some((m) => m.type === 'mechanized_infantry')) return 'mechanized';
  for (const [t, cat] of [['airborne_infantry', 'airborne'], ['mountain_infantry', 'mountain'], ['cavalry', 'cavalry']]) if (foot > 0 && n(t) * 2 >= foot) return cat;
  if (ms.length && ms.every((m) => m.mobility !== 'foot')) return 'motorized';
  return 'infantry';
}

/**
 * Motivi per cui una composizione NON si può approvare (lista vuota = valida). list: [[idModulo, quanti]]; ctx: { modules, rules, nation, date, researched }.
 * Limiti storici: uomini e battaglioni massimi, massimo per tipo, battaglioni di combattimento minimi, esattamente `divisional` reparti divisionali
 * (servizi), solo battaglioni della nazione disponibili alla data e ricercati.
 */
export function designProblems(list, { modules, rules, nation, date, researched, techName = null }) {
  const out = [];
  const byId = new Map(modules.map((m) => [m.id, m]));
  const perType = {}; let total = 0; let men = 0; let combat = 0; let divisional = 0;
  const seen = new Set();
  for (const [id, n] of list) {
    const m = byId.get(id);
    if (!m) { out.push(`battaglione ${id} inesistente`); continue; }
    if (seen.has(id)) out.push(`${m.name_it}: elencato due volte`);
    seen.add(id);
    if (!(Number.isInteger(n) && n > 0)) { out.push(`${m.name_it}: quantità non valida`); continue; }
    if (!moduleAvailable(m, { nation, date, researched })) { // motivo preciso (20/11/2026): tecnologia da ricercare e/o data d'introduzione
      const why = [[m.requiresTech ?? []].flat().filter((t) => !researched?.has(t)).map((t) => `ricerca «${techName ? techName(t) : t}»`).join(' e '), m.availableFrom && date && date < m.availableFrom ? `disponibile dal ${m.availableFrom.split('-').reverse().join('/')}` : ''].filter(Boolean).join('; ');
      out.push(`${m.name_it}: ${why || 'non disponibile'}`);
    }
    perType[m.type] = (perType[m.type] ?? 0) + n; total += n; men += m.men * n;
    if (rules.combatTypes.includes(m.type)) combat += n;
    if (m.divisional) divisional += n;
  }
  if (total > rules.maxModules) out.push(`troppi battaglioni: ${total} (massimo ${rules.maxModules})`);
  if (men > rules.maxMen) out.push(`troppi uomini: ${men} (massimo ${rules.maxMen})`);
  for (const [t, n] of Object.entries(perType)) if (rules.maxPerType?.[t] && n > rules.maxPerType[t]) out.push(`troppi battaglioni di tipo ${t}: ${n} (massimo ${rules.maxPerType[t]})`);
  if (combat < rules.minCombat) out.push(`servono almeno ${rules.minCombat} battaglioni di combattimento`);
  if (divisional !== rules.divisional) out.push(`serve ${rules.divisional === 1 ? 'un reparto' : `${rules.divisional} reparti`} di servizi divisionali (ne hai ${divisional})`);
  return out;
}

/** Template di divisione (formato di data/units/templates) da un modello del giocatore: { id, nation, name, category, modules, createdOn }. */
export function designTemplate(design, modules) {
  const doc = { modules };
  const t = templateFromComposition(doc, { templateId: design.id.replace(/^DSG-([A-Z]+)-(\d+)$/, 'TPL-$1-DSG-$2'), category: design.category, activeFrom: design.createdOn, formation: design.name, modules: design.modules });
  return { ...t, id: design.id, status: 'PLAYER_DESIGN', note: `Modello di divisione creato dal giocatore il ${design.createdOn} con l'editor a moduli.` };
}
