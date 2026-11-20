// Catalogo degli equipaggiamenti (data/units/equipment/catalog.json, Fase 3, 03/11/2026): solo dati e funzioni PURE.
// Una voce = una classe funzionale per nazione (o una voce aggregata) con `equipment_id` univoco; `aliases` collega (nazione, chiave del template)
// all'equipment_id SENZA rinominare le chiavi dei template (usate come percorsi `equipment.<chiave>` da forces, readiness e reinforcements).
// Non si inventano modelli storici né caratteristiche tecniche: `models` resta vuoto finché non ci sono dati.
import { RELIABILITY } from './templates.js';

export const EQUIPMENT_SCHEMA = 'equipment-catalog-v1';

export const CATEGORIES = [
  'INDIVIDUAL_WEAPON', 'MACHINE_GUN', 'GRENADE_LAUNCHER', 'MORTAR', 'ANTI_TANK_GUN', 'FIELD_GUN', 'HOWITZER', 'ANTI_AIRCRAFT_GUN',
  'HEAVY_ARTILLERY', 'TRUCK', 'HALF_TRACK', 'ARTILLERY_TRACTOR', 'ARMORED_CAR', 'TANK', 'TANK_DESTROYER', 'SELF_PROPELLED_ARTILLERY', 'SPECIAL_VEHICLE', 'ROCKET_ARTILLERY',
  'LOGISTICS_EQUIPMENT',
];
// Granularità: 'class' = classe funzionale (nessun modello noto), 'model' = modello con designazione, 'aggregate' = voce aggregata non dettagliata.
// UNO schema e UNA forma di id per tutte le nazioni: <PREFISSO>-<NAZIONE>-<NOME> (es. ART-DEU-MOR-81, MG-FRA-FM2429). Campi facoltativi per i modelli:
// designation (obbligatoria per 'model'), family, role, reliability (RELIABILITY di templates.js), reference_date, source_id, source_note.
export const GRANULARITY = ['class', 'aggregate', 'model'];

/** Prefisso dell'id per categoria. Estendere qui, in un solo punto, quando compare una nuova categoria. */
export const ID_PREFIX = {
  INDIVIDUAL_WEAPON: 'INW', MACHINE_GUN: 'MG', GRENADE_LAUNCHER: 'GL', MORTAR: 'ART', ANTI_TANK_GUN: 'ART', FIELD_GUN: 'ART', HOWITZER: 'ART',
  ANTI_AIRCRAFT_GUN: 'ART', HEAVY_ARTILLERY: 'ART', ROCKET_ARTILLERY: 'ART', SELF_PROPELLED_ARTILLERY: 'ART', TANK: 'TNK', TANK_DESTROYER: 'TD', TRUCK: 'VEH', HALF_TRACK: 'VEH',
  ARTILLERY_TRACTOR: 'VEH', ARMORED_CAR: 'VEH', SPECIAL_VEHICLE: 'VEH', LOGISTICS_EQUIPMENT: 'LOG',
};

/** Classe dei CSV di catalogo → categoria. Solo le classi viste finora: una classe nuova è un errore esplicito, da aggiungere qui. */
export const CLASS_TO_CATEGORY = {
  rifle: 'INDIVIDUAL_WEAPON', pistol: 'INDIVIDUAL_WEAPON', light_machine_gun: 'MACHINE_GUN', heavy_machine_gun: 'MACHINE_GUN',
  rifle_grenade_launcher: 'GRENADE_LAUNCHER', light_mortar: 'MORTAR', medium_mortar: 'MORTAR', anti_tank_gun: 'ANTI_TANK_GUN',
  field_gun: 'FIELD_GUN', howitzer: 'HOWITZER',
  light_tank: 'TANK', medium_tank: 'TANK', heavy_tank: 'TANK', // 12/11/2026: template delle divisioni corazzate
};

const ID_RE = /^([A-Z]{2,4})-([A-Z]{2,4})-[A-Z0-9]+(-[A-Z0-9]+)*$/;

/** Unisce più cataloghi (uno per nazione o per fonte) in un solo documento da validare; gli id duplicati li segnala il validatore. */
export function mergeEquipmentCatalogs(docs) {
  return { schema: EQUIPMENT_SCHEMA, entries: docs.flatMap((d) => d.entries ?? []), aliases: docs.flatMap((d) => d.aliases ?? []) };
}

/**
 * Errori del catalogo (vuoto = valido). `templates` (facoltativo) = template di divisione: ogni chiave di `equipment` di un template con
 * nazione deve avere un alias per quella nazione (copertura completa, nessuna chiave orfana).
 */
export function validateEquipmentCatalog(doc, { templates } = {}) {
  const errors = [];
  if (doc?.schema !== EQUIPMENT_SCHEMA) return [`catalogo equipaggiamenti: schema ${JSON.stringify(doc?.schema)}`];
  const byId = new Map();
  for (const e of doc.entries ?? []) {
    const p = `equipaggiamento ${e?.equipment_id ?? '?'}`;
    const m = ID_RE.exec(e?.equipment_id ?? '');
    if (!m) { errors.push(`${p}: id non valido`); continue; }
    if (byId.has(e.equipment_id)) errors.push(`${p}: id duplicato`);
    byId.set(e.equipment_id, e);
    if (m[2] !== e.nation) errors.push(`${p}: la nazione dell'id (${m[2]}) differisce da ${JSON.stringify(e.nation)}`);
    if (!GRANULARITY.includes(e.granularity)) errors.push(`${p}: granularity ${JSON.stringify(e.granularity)}`);
    if (e.category === null) { if (e.granularity !== 'aggregate') errors.push(`${p}: categoria nulla ammessa solo per voci aggregate`); }
    else if (!CATEGORIES.includes(e.category)) errors.push(`${p}: categoria ${JSON.stringify(e.category)}`);
    if (e.caliber_mm !== null && !(typeof e.caliber_mm === 'number' && e.caliber_mm > 0)) errors.push(`${p}: calibro non valido`);
    if (e.durable !== true) errors.push(`${p}: le armi sono equipaggiamenti durevoli (durable: true); le munizioni stanno nel consumo munizioni`);
    if (!Array.isArray(e.models)) errors.push(`${p}: models non è un array`);
    if (!String(e.name_it ?? '').trim()) errors.push(`${p}: senza nome`);
    if (e.granularity === 'model' && !String(e.designation ?? '').trim()) errors.push(`${p}: un modello richiede la designazione`);
    if (e.reliability !== undefined && !RELIABILITY.includes(e.reliability)) errors.push(`${p}: reliability ${JSON.stringify(e.reliability)}`);
    if (e.modelCatalog !== undefined && !/^data\/units\/models\/.+\.json$/.test(e.modelCatalog)) errors.push(`${p}: modelCatalog non valido`);
  }
  const seen = new Set();
  for (const a of doc.aliases ?? []) {
    const k = `${a?.nation}|${a?.templateKey}`;
    const p = `alias ${k}`;
    if (seen.has(k)) errors.push(`${p}: duplicato`);
    seen.add(k);
    const e = byId.get(a?.equipment_id);
    if (!e) errors.push(`${p}: equipment_id inesistente ${a?.equipment_id}`);
    else if (e.nation !== a.nation) errors.push(`${p}: la voce ${e.equipment_id} è di un'altra nazione (${e.nation})`);
  }
  // sameAs (13/11/2026): un modello collegato alla voce di classe della stessa nazione e categoria (es. Pz.Kpfw. II → TNK-DEU-TANK) è collegato al template tramite essa
  for (const e of byId.values()) {
    if (e.sameAs === undefined) continue;
    const t = byId.get(e.sameAs);
    if (!t) errors.push(`equipaggiamento ${e.equipment_id}: sameAs inesistente ${e.sameAs}`);
    else if (t.nation !== e.nation || t.category !== e.category) errors.push(`equipaggiamento ${e.equipment_id}: sameAs ${e.sameAs} di altra nazione o categoria`);
  }
  const linked = (e) => (doc.aliases ?? []).some((a) => a.equipment_id === e.equipment_id);
  for (const e of byId.values()) if (!linked(e) && !(e.sameAs && byId.get(e.sameAs) && linked(byId.get(e.sameAs)))) errors.push(`equipaggiamento ${e.equipment_id}: nessun alias (voce non collegata a un template)`);
  // Le chiavi con value null ("da definire", es. fanteria francese 1936) non hanno quantità da risolvere: l'alias serve quando il dato arriva.
  for (const t of templates ?? []) {
    const nation = t?.appliesTo?.nation;
    if (!nation || !t.equipment || typeof t.equipment !== 'object') continue;
    for (const [key, leaf] of Object.entries(t.equipment)) if (leaf?.value !== null && !seen.has(`${nation}|${key}`)) errors.push(`template ${t.id}: la chiave equipment.${key} non ha un alias nel catalogo (${nation})`);
  }
  return errors;
}

/** Voce di catalogo per (nazione, chiave di template), oppure null. */
export function resolveEquipment(doc, nation, templateKey) {
  const a = (doc.aliases ?? []).find((x) => x.nation === nation && x.templateKey === templateKey);
  return a ? (doc.entries ?? []).find((e) => e.equipment_id === a.equipment_id) ?? null : null;
}

/** Percorso di una voce di template (`equipment.<chiave>`) → equipment_id, oppure null (percorsi non di equipaggiamento o senza alias). */
export function equipmentIdForPath(doc, nation, path) {
  const m = /^equipment\.([^.]+)/.exec(path);
  return m ? resolveEquipment(doc, nation, m[1])?.equipment_id ?? null : null;
}

export const REPLACEMENTS_SCHEMA = 'equipment-replacements-v1';

/**
 * Errori di data/units/equipment/replacements.json (21/11/2026, logica delle dotazioni, fase 1): ogni riga { id, replaces, basis } dice che il modello
 * `replaces` precede `id`. Stessa nazione e categoria, predecessore mai più recente del nuovo (production = equipment_production.json), un solo
 * predecessore per modello, nessun ciclo. catalog = catalogo unito.
 */
export function validateReplacements(doc, { catalog, production = null }) {
  const errors = [];
  if (doc?.schema !== REPLACEMENTS_SCHEMA) return [`sostituzioni: schema ${JSON.stringify(doc?.schema)}`];
  if (!Array.isArray(doc.entries)) return ['sostituzioni: entries non è un array'];
  const byId = new Map((catalog?.entries ?? []).map((e) => [e.equipment_id, e]));
  const fromOf = (id) => production?.overrides?.[id]?.availableFrom ?? null;
  const pred = new Map();
  for (const r of doc.entries) {
    const p = `sostituzione ${r?.id} → ${r?.replaces}`;
    const a = byId.get(r?.id); const b = byId.get(r?.replaces);
    if (!a) { errors.push(`${p}: modello nuovo inesistente`); continue; }
    if (!b) { errors.push(`${p}: predecessore inesistente`); continue; }
    if (!['utente', 'ipotesi', 'fonte'].includes(r.basis)) errors.push(`${p}: basis ${JSON.stringify(r.basis)}`);
    if (a.equipment_id === b.equipment_id) errors.push(`${p}: sé stesso`);
    else if (a.nation !== b.nation || a.category !== b.category) errors.push(`${p}: nazione o categoria diversa`);
    else if (fromOf(a.equipment_id) && fromOf(b.equipment_id) && fromOf(b.equipment_id) > fromOf(a.equipment_id)) errors.push(`${p}: il predecessore è più recente (${fromOf(b.equipment_id)})`);
    if (pred.has(a.equipment_id)) errors.push(`${p}: il modello ha già un predecessore`);
    pred.set(a.equipment_id, b.equipment_id);
  }
  for (const start of pred.keys()) {
    const seen = new Set([start]);
    for (let c = pred.get(start); c !== undefined; c = pred.get(c)) {
      if (seen.has(c)) { errors.push(`sostituzione ${start}: catena circolare`); break; }
      seen.add(c);
    }
  }
  return errors;
}

/**
 * Predecessori di una voce di divisione (21/11/2026, logica delle dotazioni, fase 1): (nazione, percorso `equipment.<chiave>`) → percorsi di scorta
 * dei modelli precedenti, dal più recente al più vecchio (catena di data/units/equipment/replacements.json). Servono ai rinforzi come ultima fonte: un pezzo vecchio
 * copre il posto finché il nuovo non c'è e combatte con i propri valori (src/rules/battleV2.js). Non entrano nelle equivalenze: il fabbisogno
 * delle fabbriche resta quello del modello nuovo.
 */
export function buildPredecessors(doc, replacements) {
  const byId = new Map((doc?.entries ?? []).map((e) => [e.equipment_id, e]));
  const alias = new Map((doc?.aliases ?? []).map((a) => [`${a.nation}|${a.templateKey}`, a.equipment_id]));
  const pred = new Map((replacements?.entries ?? []).map((r) => [r.id, r.replaces]));
  const cache = new Map();
  return function predecessorsOf(nation, path) {
    const k = `${nation}|${path}`;
    if (cache.has(k)) return cache.get(k);
    const m = /^equipment\.(.+)$/.exec(path ?? '');
    const out = [];
    if (m) {
      const seen = new Set();
      let e = byId.get(alias.get(`${nation}|${m[1]}`) ?? m[1]);
      while (e && pred.has(e.equipment_id) && !seen.has(pred.get(e.equipment_id))) {
        seen.add(pred.get(e.equipment_id));
        e = byId.get(pred.get(e.equipment_id));
        if (!e || e.nation !== nation) break;
        out.push(`equipment.${e.equipment_id}`);
      }
    }
    cache.set(k, out);
    return out;
  };
}
