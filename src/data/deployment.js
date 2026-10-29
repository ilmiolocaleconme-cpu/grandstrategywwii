// Dislocazione delle unità al 1/1/1936: unità → provincia madre. Le unità hanno solo una "stazione" in testo libero (file dell'utente):
// qui si ricava la provincia (città del catalogo, nome di provincia, corpo d'armata di appartenenza, poche eccezioni dichiarate).
// È una DERIVAZIONE (basis 'ipotesi'), non un dato storico verificato. Le unità senza luogo noto restano in `unplaced`: non si inventa. Funzioni PURE.
import { isActiveAt } from './units.js';

export const DEPLOYMENT_SCHEMA = 'deployment-v1';

export const norm = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const stripSide = (n) => n.replace(/ (nord|sud|est|ovest)( \d+)?$/, '');
const stripBank = (n) => n.replace(/ \(sponda [a-z]\)$/, '');

/** Eccezioni dichiarate: stazione normalizzata o nome dell'unità → { province, how }. Ogni voce ha il motivo. */
export const OVERRIDES = {
  monaco: { province: 'P_DEU_MUENCHEN_OBERBAYERN', how: 'stazione "Monaco": Monaco di Baviera non è tra le città del catalogo, provincia scelta a mano' },
  'baviera / monaco': { province: 'P_DEU_MUENCHEN_OBERBAYERN', how: 'stazione "Baviera / Monaco": Monaco di Baviera, provincia scelta a mano' },
  wurzburg: { province: 'P_DEU_MAINFRANKEN', how: 'stazione "Würzburg": provincia scelta a mano (Mainfranken)' },
  '1st infantry division': { province: 'P_GBR_HAMPSHIRE', how: 'Aldershot Command (britishmilitaryhistory.co.uk, Aldershot 1930-1938: 1ª e 2ª divisione ad Aldershot); Aldershot è nell\'Hampshire' },
  '2nd infantry division': { province: 'P_GBR_HAMPSHIRE', how: 'Aldershot Command (britishmilitaryhistory.co.uk, Aldershot 1930-1938: 1ª e 2ª divisione ad Aldershot); Aldershot è nell\'Hampshire' },
};

/** Indici da cittàgrandi e province: { cityByKey: Map('NAZ|nome' → madre), provByKey: Map('NAZ|nome' → madre), motherIds: Set }. */
export function buildIndexes({ cities, provinces }) {
  const cityByKey = new Map();
  const provByKey = new Map();
  const motherIds = new Set();
  for (const p of provinces) {
    const mother = p.parentProvince ?? p.id;
    motherIds.add(mother);
    const key = `${p.owner}|${norm(stripBank(p.name))}`;
    if (!provByKey.has(key)) provByKey.set(key, mother);
  }
  for (const c of cities) {
    const key = `${c.owner}|${stripSide(norm(c.name))}`;
    if (!cityByKey.has(key)) cityByKey.set(key, c.parentProvince);
  }
  return { cityByKey, provByKey, motherIds };
}

/** Provincia madre di una stazione ("Marne / Reims", "Berlino", ...) per una nazione, oppure null. */
export function resolveStation(station, nation, idx) {
  const whole = norm(station);
  if (OVERRIDES[whole]) return { province: OVERRIDES[whole].province, how: OVERRIDES[whole].how };
  const parts = String(station).split(/\s*[/,]\s*/).map(norm).filter(Boolean);
  for (const c of [...parts].reverse()) {
    const city = idx.cityByKey.get(`${nation}|${c}`);
    if (city) return { province: city, how: `stazione "${station}": città ${c} del catalogo` };
    const prov = idx.provByKey.get(`${nation}|${c}`);
    if (prov) return { province: prov, how: `stazione "${station}": provincia ${c}` };
  }
  return null;
}

/** Numeri delle divisioni di fanteria assegnate a un corpo tedesco dalla sua nota ("... : 1.; 11.; 21. Infanterie-Division"). */
export function corpsDivisions(note) {
  const m = /:\s*([\d.;\s]+)Infanterie-Division/.exec(note ?? '');
  return m ? m[1].split(';').map((s) => s.replace(/\./g, '').trim()).filter(Boolean).map(Number) : [];
}

export function buildDeployment({ units, cities, provinces }) {
  const idx = buildIndexes({ cities, provinces });
  const entries = new Map();
  const unplaced = [];
  const place = (u, hit) => { if (!entries.has(u.id)) entries.set(u.id, { unit: u.id, name: u.name, province: hit.province, how: hit.how }); };
  for (const u of units) {
    const byName = OVERRIDES[norm(u.name)];
    if (byName && u.nation === 'GBR') { place(u, byName); continue; }
    if (!u.station) continue;
    const hit = resolveStation(u.station, u.nation, idx);
    if (hit) place(u, hit);
  }
  // divisioni tedesche di fanteria: nel luogo del corpo d'armata a cui sono assegnate (derivazione dalla nota del corpo)
  const byName = new Map(units.map((u) => [`${u.nation}|${u.name}`, u]));
  for (const corps of units.filter((u) => u.nation === 'DEU' && u.commandLevel === 'corps')) {
    const at = entries.get(corps.id);
    if (!at) continue;
    for (const n of corpsDivisions(corps.note)) {
      const d = byName.get(`DEU|${n}. Infanterie-Division`);
      if (d && !entries.has(d.id)) place(d, { province: at.province, how: `nel luogo del corpo d'armata ${corps.name} (assegnazione dalla nota del corpo, indicativa)` });
    }
  }
  for (const u of units) {
    if (entries.has(u.id)) continue;
    if (u.station) unplaced.push({ unit: u.id, name: u.name, reason: `stazione "${u.station}" non riconducibile a una provincia` });
  }
  return {
    schema: DEPLOYMENT_SCHEMA,
    basis: 'ipotesi',
    note: 'Unità → provincia madre al 1/1/1936, DERIVATA dalla stazione in testo libero del file dell\'utente, dalle città del catalogo, dal corpo d\'armata e da poche eccezioni dichiarate (OVERRIDES in src/data/deployment.js). Non è una dislocazione storica verificata. Le unità senza luogo noto sono in unplaced e non compaiono sulla mappa.',
    entries: [...entries.values()].sort((a, b) => (a.unit < b.unit ? -1 : 1)),
    unplaced: unplaced.sort((a, b) => (a.unit < b.unit ? -1 : 1)),
  };
}

export function validateDeployment(doc, { unitIds, motherIds } = {}) {
  const errors = [];
  if (doc?.schema !== DEPLOYMENT_SCHEMA) errors.push(`dislocazione: schema ${JSON.stringify(doc?.schema)}`);
  if (!Array.isArray(doc?.entries)) return [...errors, 'dislocazione: entries mancante'];
  const seen = new Set();
  for (const e of doc.entries) {
    if (seen.has(e.unit)) errors.push(`dislocazione: unità duplicata ${e.unit}`);
    seen.add(e.unit);
    if (unitIds && !unitIds.has(e.unit)) errors.push(`dislocazione: unità inesistente ${e.unit}`);
    if (motherIds && !motherIds.has(e.province)) errors.push(`dislocazione: ${e.unit} in provincia inesistente ${e.province}`);
    if (!String(e.how ?? '').trim()) errors.push(`dislocazione: ${e.unit} senza motivazione`);
  }
  for (const u of doc.unplaced ?? []) if (seen.has(u.unit)) errors.push(`dislocazione: ${u.unit} sia collocata sia non collocata`);
  return errors;
}

/**
 * Unità attive alla data, raggruppate per provincia madre: { provincia: [{ nation, divisions, commands, units: [{ id, name, echelon }] }] }
 * (un gruppo per nazione, ordinato per nazione). Solo le unità con una collocazione.
 */
export function unitsByProvince(units, doc, date, { policy = 'strict' } = {}) {
  const at = new Map(doc.entries.map((e) => [e.unit, e.province]));
  const out = {};
  for (const u of units) {
    const province = at.get(u.id);
    if (!province || !isActiveAt(u, date, { policy })) continue;
    const groups = (out[province] ??= []);
    let g = groups.find((x) => x.nation === u.nation);
    if (!g) { g = { nation: u.nation, divisions: 0, commands: 0, units: [] }; groups.push(g); }
    if (u.echelon === 'division') g.divisions += 1; else g.commands += 1;
    g.units.push({ id: u.id, name: u.name, echelon: u.echelon, category: u.category, commandLevel: u.commandLevel ?? null });
  }
  for (const groups of Object.values(out)) groups.sort((a, b) => (a.nation < b.nation ? -1 : 1));
  return out;
}
