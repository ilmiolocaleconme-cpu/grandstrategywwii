// Aggiornamento del template di una divisione già in servizio (03/11/2026). Funzioni PURE.
// Problema: l'istanza nasce con il template valido alla data (es. TPL-DEU-INF-1936) e non cambiava mai versione, quindi i dati del 1939 non avevano effetto
// sulle divisioni già create. Le chiavi delle voci cambiano tra versioni (fucili → INW-DEU-RIFLE-1939), per questo serve la mappa data/units/equipment/upgrade_map.json.
// Regola (scelta di progetto, DA APPROVARE): la dotazione EFFETTIVA si porta dalla voce vecchia alla voce mappata, mai oltre il nuovo previsto; le voci senza
// corrispondenza partono da 0 (niente equipaggiamento gratis: la colma la produzione tramite i rinforzi). L'eccedenza oltre il nuovo previsto torna alla scorta
// nazionale, le voci vecchie senza corrispondenza sono registrate come "dropped" e NON accreditate. Uomini e cavalli (stessa chiave) si portano uguali.
// I quadri (es. fanteria francese 1936, al 30%) seguono la versione ma restano quadri. Tutto viene registrato nell'istanza (campo opzionale `upgrade`), niente si perde in silenzio.
import { initialEffective } from './readiness.js';
import { templateWindow } from '../data/templates.js';
import { resolveEquipment } from '../data/equipmentCatalog.js';

export const UPGRADE_MAP_SCHEMA = 'equipment-upgrade-map-v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BASES = ['utente', 'ipotesi'];

/** Errori della mappa (vuoto = valida). catalog = catalogo unito { entries, aliases }; templates (facoltativo) = template di divisione per controllare che `to` esista in qualche template della nazione. */
export function validateUpgradeMap(doc, { catalog, templates = null } = {}) {
  const errors = [];
  if (doc?.schema !== UPGRADE_MAP_SCHEMA) errors.push(`mappa aggiornamento: schema ${JSON.stringify(doc?.schema)}`);
  if (!Array.isArray(doc?.entries)) return [...errors, 'mappa aggiornamento: entries non è un array'];
  const seen = new Set();
  for (const e of doc.entries) {
    const p = `mappa aggiornamento ${e?.nation}|${e?.from}`;
    if (!/^[A-Z]{3,4}$/.test(e?.nation ?? '')) errors.push(`${p}: nazione non valida`);
    if (typeof e?.from !== 'string' || typeof e?.to !== 'string' || !e.from || !e.to) { errors.push(`${p}: from/to mancanti`); continue; }
    if (!BASES.includes(e.basis)) errors.push(`${p}: basis ${JSON.stringify(e.basis)}`);
    const k = `${e.nation}|${e.from}`;
    if (seen.has(k)) errors.push(`${p}: la stessa voce di partenza compare due volte (verrebbe contata due volte)`);
    seen.add(k);
    const a = resolveEquipment(catalog, e.nation, e.from);
    const b = resolveEquipment(catalog, e.nation, e.to);
    if (!a) errors.push(`${p}: la chiave di partenza non ha un alias nel catalogo`);
    if (!b) errors.push(`${p}: la chiave di arrivo ${e.to} non ha un alias nel catalogo`);
    if (a && b) {
      if (a.category !== b.category) errors.push(`${p}: categoria diversa (${a.category} → ${b.category})`);
      if (a.caliber_mm != null && b.caliber_mm != null && a.caliber_mm !== b.caliber_mm) errors.push(`${p}: calibro diverso (${a.caliber_mm} → ${b.caliber_mm} mm)`);
    }
    if (templates && !templates.some((t) => t?.appliesTo?.nation === e.nation && t.equipment && e.to in t.equipment)) errors.push(`${p}: la chiave di arrivo ${e.to} non compare in nessun template della nazione`);
  }
  return errors;
}

/**
 * Template più recente da applicare a una divisione, oppure null. `templates` = tutti i template; `templateFor` è passato dal chiamante (src/rules/forces.js) per non creare un ciclo di import.
 * Non cambia: istanze il cui template non è tra quelli noti, e mai a una versione più vecchia. I quadri SÌ: seguono la versione del template (cambia l'organico previsto, che è ciò
 * che la mobilitazione dovrà colmare) ma restano quadri, senza rinforzi, finché non vengono mobilitati; l'effettivo si porta uguale, non cresce.
 */
export function upgradeTarget(division, unit, templates, date, templateFor) {
  if (!division) return null;
  const current = templates.find((t) => t.id === division.templateId);
  if (!current) return null;
  const next = templateFor(unit, templates, date);
  if (!next || next.id === current.id) return null;
  return (templateWindow(next).from ?? '') > (templateWindow(current).from ?? '') ? next : null;
}

const isStockPath = (path) => path.startsWith('equipment.') || path === 'horses';

/**
 * Nuova istanza sul nuovo template. ctx: { nation, map (documento upgrade_map), date }.
 * Ritorna { division, surplus: { percorso: quantità } (da accreditare alla scorta: solo equipment.* e horses), dropped: { percorso: quantità } }.
 */
export function upgradeDivision(division, template, { nation, map = { entries: [] }, date }) {
  if (!DATE_RE.test(date ?? '')) throw new TypeError('data non valida');
  const fresh = initialEffective(template, 1); // solo per sapere quali voci esistono e il nuovo previsto
  const toPath = (key) => `equipment.${key}`;
  // da quale voce vecchia arriva ogni voce nuova
  const sources = new Map(); // percorso nuovo → [percorsi vecchi]
  const add = (to, from) => sources.set(to, [...(sources.get(to) ?? []), from]);
  for (const path of Object.keys(fresh)) if (path in division.items) add(path, path); // stessa chiave (uomini, cavalli, voci invariate)
  for (const e of map.entries ?? []) {
    if (e.nation !== nation) continue;
    const from = toPath(e.from); const to = toPath(e.to);
    if (from !== to && from in division.items && to in fresh) add(to, from);
  }
  const used = new Set([...sources.values()].flat());
  const items = {}; const surplus = {};
  for (const [path, it] of Object.entries(fresh)) {
    const carried = (sources.get(path) ?? []).reduce((s, p) => s + division.items[p].effective, 0);
    const effective = Math.min(carried, it.planned);
    items[path] = { planned: it.planned, effective, source: 'upgrade' };
    if (carried > effective && isStockPath(path)) surplus[path] = carried - effective;
  }
  const dropped = {};
  for (const [path, it] of Object.entries(division.items)) if (!used.has(path) && it.effective > 0) dropped[path] = it.effective;
  const record = { from: division.templateId, on: date, ...(Object.keys(surplus).length ? { surplus } : {}), ...(Object.keys(dropped).length ? { dropped } : {}) };
  return { division: { ...division, templateId: template.id, items, upgrade: record }, surplus, dropped };
}
