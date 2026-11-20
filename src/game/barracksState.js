// Caserme nello stato di partita (20/11/2026). Funzioni PURE.
// Stato OPZIONALE: state.barracks = { schema, byNation: { [nazione]: [ { id, name, provinceId, level, builtOn? } ] } }.
// Una nazione assente da byNation ha le caserme iniziali del file (data/military/barracks.json): i salvataggi precedenti non cambiano forma.
// Una caserma è OCCUPATA finché una divisione vi si addestra (forces.divisions[id].training.barracksId, fino a training.until).
// Una caserma in una provincia che la nazione non controlla non si usa (né per formare, né per i rinforzi).
import { barracksEnabled, barracksLevelDef } from '../data/barracks.js';

export const BARRACKS_SCHEMA = 'barracks-v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateBarracksState(b) {
  if (b === undefined) return [];
  if (!b || b.schema !== BARRACKS_SCHEMA || typeof b.byNation !== 'object' || b.byNation === null) return ['caserme: forma non valida'];
  const e = [];
  for (const [nation, list] of Object.entries(b.byNation)) {
    if (!Array.isArray(list)) { e.push(`caserme: elenco di ${nation} non valido`); continue; }
    const ids = new Set();
    for (const x of list) {
      if (typeof x?.id !== 'string' || ids.has(x.id)) e.push(`caserme: ${nation}, id mancante o doppio (${x?.id})`);
      ids.add(x?.id);
      if (typeof x?.provinceId !== 'string') e.push(`caserme: ${x?.id} senza provincia`);
      if (!(Number.isInteger(x?.level) && x.level >= 1)) e.push(`caserme: ${x?.id}, livello non valido`);
      if (x?.builtOn !== undefined && !DATE_RE.test(x.builtOn)) e.push(`caserme: ${x?.id}, data di costruzione non valida`);
    }
  }
  return e;
}

/** Caserme della nazione (stato, altrimenti quelle iniziali del file). */
export function barracksOf(state, doc, nation) {
  const own = state.barracks?.byNation?.[nation];
  if (own) return own;
  return (doc?.initial?.[nation] ?? []).map((b) => ({ id: b.id, name: b.name, provinceId: b.province, level: b.level }));
}

/** Nuovo stato con l'elenco di caserme della nazione sostituito. */
export function setBarracks(state, nation, list) {
  const cur = state.barracks ?? { schema: BARRACKS_SCHEMA, byNation: {} };
  return { ...state, barracks: { ...cur, byNation: { ...cur.byNation, [nation]: list } } };
}

/** Divisioni in addestramento per caserma: Map idCaserma → [{ divisionId, until }]. */
export function occupancy(state) {
  const m = new Map();
  for (const [id, d] of Object.entries(state.forces?.divisions ?? {})) {
    const t = d.training;
    if (!t?.barracksId || !(state.date < t.until)) continue;
    if (!m.has(t.barracksId)) m.set(t.barracksId, []);
    m.get(t.barracksId).push({ divisionId: id, until: t.until });
  }
  return m;
}

/**
 * Righe per l'interfaccia e per le regole: { ...caserma, levelName, controlled, busy: [{divisionId, until}], free (posti liberi) }.
 * controllerOf(state, provinceId) → nazione che controlla la provincia.
 */
export function barracksRows(state, doc, nation, controllerOf) {
  if (!barracksEnabled(doc, nation)) return [];
  const occ = occupancy(state);
  return barracksOf(state, doc, nation).map((b) => {
    const busy = occ.get(b.id) ?? [];
    const controlled = controllerOf(state, b.provinceId) === nation;
    return { ...b, levelName: barracksLevelDef(doc, b.level)?.name ?? `Livello ${b.level}`, controlled, busy, free: controlled ? Math.max(0, doc.capacityDivisions - busy.length) : 0 };
  });
}

/** Prima caserma con un posto libero: nella provincia indicata, altrimenti (se anywhere) la prima libera in ordine di nome. null se nessuna. */
export function pickBarracks(rows, provinceId, { anywhere = false } = {}) {
  const here = rows.find((r) => r.provinceId === provinceId && r.free > 0);
  if (here || !anywhere) return here ?? null;
  return [...rows].filter((r) => r.free > 0).sort((a, b) => a.name.localeCompare(b.name, 'it'))[0] ?? null;
}

/** Province (controllate) delle caserme della nazione: punti di partenza dei rinforzi. */
export function barracksOrigins(state, doc, nation, controllerOf) {
  return [...new Set(barracksRows(state, doc, nation, controllerOf).filter((r) => r.controlled).map((r) => r.provinceId))];
}

/**
 * Completa i lavori finiti: nuova caserma (livello 1) o caserma migliorata. done: [{ nation, provinceId, level, name? }].
 * Una caserma nuova prende id `<nazione>-BK-<provincia>`; il nome predefinito è «Caserma di <provincia>» (provinceName facoltativo).
 */
export function completeBarracks(state, doc, done, date, provinceName = (id) => id) {
  let s = state;
  for (const d of done) {
    const list = [...barracksOf(s, doc, d.nation)];
    const i = list.findIndex((b) => b.provinceId === d.provinceId);
    if (i >= 0) list[i] = { ...list[i], level: Math.max(list[i].level, d.level) };
    else list.push({ id: `${d.nation}-BK-${d.provinceId}`, name: d.name ?? `Caserma di ${provinceName(d.provinceId)}`, provinceId: d.provinceId, level: 1, builtOn: date });
    s = setBarracks(s, d.nation, list);
  }
  return s;
}

/**
 * Voce di costruzione per la provincia (interfaccia): caserma nuova o miglioramento di quella che c'è. null se già al massimo.
 * Ritorna { label, detail, cost: { ecv, steel, days } }. motherOf(id) → provincia madre (sponda o città → madre).
 */
export function barracksBuildOption(state, doc, nation, provinceId, motherOf = (id) => id) {
  const mother = motherOf(provinceId);
  const here = barracksOf(state, doc, nation).find((b) => b.provinceId === mother);
  const level = here ? here.level + 1 : 1;
  const def = doc.levels.find((l) => l.level === level);
  if (!def) return null;
  const bonus = (l) => `addestra in ${Math.round(l.trainingFactor * 100)}% del tempo${l.experienceBonus ? `, +${l.experienceBonus} esperienza` : ''}`;
  return {
    label: here ? `${here.name} → ${def.name} (livello ${level})` : 'Caserma nuova',
    detail: `1 divisione alla volta; ${bonus(def)}`,
    cost: { ...doc.build[String(level)] },
  };
}
