// Costruzione dei template di divisione (unit-template-v2) e dei cataloghi equipaggiamenti da CSV (Fase 6, 03/11/2026). Funzioni PURE, nessun I/O.
// UNA sola procedura per tutte le nazioni: ogni nazione/anno si aggiunge con tre CSV (template, righe di organico, catalogo) e una riga del manifesto
// (data/units/source/templates_manifest.json). Niente codice per nazione. Colonne attese:
//  - template (1 riga): template_id, nation, category, echelon, series, division_name, reference_date, formation, infantry_regiments,
//    manpower_initial_estimate, manpower_organic_max, horses_organic, status, source_quality, note
//  - righe di organico: template_id, subunit_id, equipment_id, quantity, quantity_status, basis, effective_quantity, mechanics_profile_id, source_note
//  - catalogo: equipment_id, nation, designation, family, class, caliber_mm, role, quantity_planned, quantity_effective, quantity_basis,
//    reference_date, confidence, source_note
// Il template è PER CATEGORIA (id TPL-<NAZ>-<CAT>-<ANNO>): l'id del CSV (anche di una divisione precisa) resta in metadata.sourceTemplateId.
// Non si inventa nulla: dati mancanti = null con reliability MISSING_DATA; le varianti DATED_VARIANT restano nel solo catalogo.
import { parseCsv } from './csv.js';
import { RELIABILITY, SCHEMA_V2 } from './templates.js';
import { CLASS_TO_CATEGORY, ID_PREFIX, EQUIPMENT_SCHEMA } from './equipmentCatalog.js';

export const MANIFEST_SCHEMA = 'template-sources-v1';
/** Codice di categoria nell'id del template. Estendere qui quando compare una nuova categoria di divisione. */
export const CATEGORY_CODE = { infantry: 'INF' };

const blank = (s) => String(s ?? '').trim() === '';
const intOf = (s, what) => {
  if (!/^\d+$/.test(String(s).trim())) throw new Error(`${what}: intero atteso, trovato ${JSON.stringify(s)}`);
  return Number(s);
};
const optInt = (s, what) => (blank(s) ? null : intOf(s, what));
const optNum = (s, what) => {
  if (blank(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${what}: numero positivo atteso, trovato ${JSON.stringify(s)}`);
  return n;
};
const monthStart = (d, what) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`; // la fonte dà solo il mese: si usa il primo giorno
  throw new Error(`${what}: data AAAA-MM o AAAA-MM-GG attesa, trovata ${JSON.stringify(d)}`);
};

/** Voci di catalogo e alias da un CSV di catalogo. Ritorna { entries, aliases, bySource: Map(id del CSV → voce) }. */
export function buildCatalogRows(rows, { overrides = {} } = {}) {
  const entries = []; const aliases = []; const bySource = new Map();
  for (const r of rows) {
    const sid = r.equipment_id;
    const p = `catalogo ${sid}`;
    if (bySource.has(sid)) throw new Error(`${p}: id duplicato nel CSV`);
    const category = CLASS_TO_CATEGORY[r.class];
    if (!category) throw new Error(`${p}: classe sconosciuta ${JSON.stringify(r.class)} (aggiungerla a CLASS_TO_CATEGORY)`);
    if (!/^[A-Z]{2,4}$/.test(r.nation)) throw new Error(`${p}: nazione non valida ${JSON.stringify(r.nation)}`);
    const slug = sid.startsWith(`${r.nation}-`) ? sid.slice(r.nation.length + 1) : sid;
    if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(slug)) throw new Error(`${p}: nome non convertibile in un id (${slug})`);
    if (blank(r.designation)) throw new Error(`${p}: designazione mancante`);
    if (!RELIABILITY.includes(r.confidence)) throw new Error(`${p}: confidence ${JSON.stringify(r.confidence)}`);
    const equipment_id = `${ID_PREFIX[category]}-${r.nation}-${slug}`;
    const entry = {
      equipment_id, nation: r.nation, category, granularity: overrides[sid] ?? 'model', designation: r.designation, family: r.family || null, role: r.role || null,
      caliber_mm: optNum(r.caliber_mm, `${p}: calibro`), name_it: r.designation, durable: true, models: [],
      reliability: r.confidence, reference_date: r.reference_date || null, source_id: sid, source_note: r.source_note || null,
    };
    entries.push(entry); bySource.set(sid, entry);
    aliases.push({ nation: r.nation, templateKey: equipment_id, equipment_id });
  }
  return { entries, aliases, bySource };
}

/**
 * Template + voci di catalogo di un set. input: { template: righe, lines: righe, catalog: righe, overrides, sourceFiles: [{ file, sha256 }] }.
 * Ritorna { template, entries, aliases }. Lancia un Error con il motivo se i CSV sono incoerenti (mai dati troncati o inventati).
 */
export function buildDivisionSet({ template: tRows, lines: lRows, catalog: cRows, overrides = {}, sourceFiles = [] }) {
  if (tRows.length !== 1) throw new Error(`template: una riga attesa, trovate ${tRows.length}`);
  const t = tRows[0];
  const code = CATEGORY_CODE[t.category];
  if (!code) throw new Error(`template ${t.template_id}: categoria sconosciuta ${JSON.stringify(t.category)} (aggiungerla a CATEGORY_CODE)`);
  const validFrom = monthStart(t.reference_date, `template ${t.template_id}: reference_date`);
  const id = `TPL-${t.nation}-${code}-${validFrom.slice(0, 4)}`;
  const { entries, aliases, bySource } = buildCatalogRows(cRows, { overrides });
  for (const e of entries) if (e.nation !== t.nation) throw new Error(`catalogo ${e.source_id}: nazione ${e.nation} diversa dal template (${t.nation})`);

  const lineBy = new Map();
  for (const l of lRows) {
    const p = `riga ${l.equipment_id}`;
    if (l.template_id !== t.template_id) throw new Error(`${p}: template_id ${l.template_id} diverso da ${t.template_id}`);
    const e = bySource.get(l.equipment_id);
    if (!e) throw new Error(`${p}: equipaggiamento assente dal catalogo`);
    if (e.reliability === 'DATED_VARIANT') throw new Error(`${p}: variante datata (DATED_VARIANT), non entra nel template di questa data`);
    if (lineBy.has(l.equipment_id)) throw new Error(`${p}: più righe per lo stesso equipaggiamento (non supportato)`);
    if (!RELIABILITY.includes(l.quantity_status)) throw new Error(`${p}: quantity_status ${JSON.stringify(l.quantity_status)}`);
    lineBy.set(l.equipment_id, l);
  }
  const equipment = {};
  for (const r of cRows) {
    const e = bySource.get(r.equipment_id);
    if (e.reliability === 'DATED_VARIANT') continue; // solo catalogo
    const l = lineBy.get(r.equipment_id);
    const planned = optInt(r.quantity_planned, `catalogo ${r.equipment_id}: quantity_planned`);
    if (!l) {
      if (planned !== null) throw new Error(`catalogo ${r.equipment_id}: quantità ${planned} ma nessuna riga di organico`);
      equipment[e.equipment_id] = { value: null, reliability: 'MISSING_DATA', note: `Nessuna quantità nelle righe di organico. ${r.source_note}`.trim() };
      continue;
    }
    const qty = intOf(l.quantity, `riga ${l.equipment_id}: quantity`);
    if (planned !== null && planned !== qty) throw new Error(`riga ${l.equipment_id}: quantità ${qty} diversa da quella del catalogo (${planned})`);
    equipment[e.equipment_id] = {
      value: qty, reliability: l.quantity_status, unit: l.subunit_id, note: l.source_note || null,
      ...(blank(l.mechanics_profile_id) ? {} : { mechanicsProfileId: l.mechanics_profile_id }),
      effective: { value: optInt(l.effective_quantity, `riga ${l.equipment_id}: effective_quantity`) },
    };
  }
  const max = intOf(t.manpower_organic_max, `template ${t.template_id}: manpower_organic_max`);
  const initial = optInt(t.manpower_initial_estimate, `template ${t.template_id}: manpower_initial_estimate`);
  if (initial !== null && initial > max) throw new Error(`template ${t.template_id}: l'organico iniziale (${initial}) supera il massimo (${max})`);
  const template = {
    schema: SCHEMA_V2,
    id,
    status: t.status,
    note: `Generato da CSV (${sourceFiles.map((f) => f.file).join(', ')}) con scripts/build-templates.js: non modificare a mano, rigenerare con npm run build:templates. Template PER CATEGORIA (${t.nation} ${t.category} ${t.echelon}, serie ${t.series}); ${t.division_name} è il caso di riferimento. Il giorno della data di inizio è il primo del mese (la fonte dà solo il mese). organico massimo → manpower.war.value, iniziale stimato → manpower.war.effective.value.`,
    appliesTo: { nation: t.nation, category: t.category, echelon: t.echelon, validFrom },
    formation: { value: t.formation },
    regimentsInfantry: { value: intOf(t.infantry_regiments, `template ${t.template_id}: infantry_regiments`) },
    manpower: { war: { value: max, effective: { value: initial } } },
    horses: { value: optInt(t.horses_organic, `template ${t.template_id}: horses_organic`), effective: { value: null } },
    equipment,
    metadata: {
      sourceTemplateId: t.template_id, series: t.series, referenceDivision: t.division_name, referenceDate: t.reference_date,
      sourceQuality: t.source_quality, sourceNote: t.note || null, sourceFiles,
    },
  };
  return { template, entries, aliases };
}

/** Catalogo di una nazione da più set: stesso id con contenuto identico = una voce; contenuto diverso = errore. */
export function buildNationCatalog(nation, sets, sourceFiles) {
  const byId = new Map(); const aliases = new Map();
  for (const s of sets) {
    for (const e of s.entries) {
      const old = byId.get(e.equipment_id);
      if (old && JSON.stringify(old) !== JSON.stringify(e)) throw new Error(`catalogo ${nation}: ${e.equipment_id} definito due volte con contenuto diverso`);
      byId.set(e.equipment_id, e);
    }
    for (const a of s.aliases) aliases.set(`${a.nation}|${a.templateKey}`, a);
  }
  return {
    schema: EQUIPMENT_SCHEMA,
    status: 'BOZZA_DA_CONFERMARE',
    note: `Catalogo ${nation} generato da CSV con scripts/build-templates.js: non modificare a mano. Stesso schema e stessa forma di id di tutte le nazioni; ogni voce con attendibilità (reliability) e nota di fonte. Le varianti datate (DATED_VARIANT) restano qui e non entrano nei template della data.`,
    source: { files: sourceFiles },
    entries: [...byId.values()],
    aliases: [...aliases.values()],
  };
}

/** Righe di un CSV (UTF-8, virgola) con messaggi d'errore che nominano il file. */
export const csvRows = (text, name) => parseCsv(text, { name });
