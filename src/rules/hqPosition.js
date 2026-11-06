// Posizione STIMATA di un comando (corpo, armata) senza posizione nella dislocazione (decisione B dell'utente, 06/11/2026).
// Regola: la provincia dove stanno più divisioni sottostanti (nell'ORBAT); a parità vince l'id più piccolo.
// È una STIMA: non un dato storico. Va sempre etichettata come tale (source: 'stimata') e non sostituisce la posizione reale.
import { descendantsOf, orbatLevel } from './orbat.js';

/** { province, inProvince, basedOn, source: 'stimata' } oppure null se nessuna divisione sottostante ha una posizione. */
export function estimatedHqProvince({ hqId, orbat, unitsById, positionOf }) {
  const counts = new Map();
  let basedOn = 0;
  for (const id of descendantsOf(orbat, hqId)) {
    const u = unitsById.get(id);
    if (!u || orbatLevel(u) !== 'division') continue;
    const p = positionOf(id);
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
    basedOn += 1;
  }
  if (counts.size === 0) return null;
  const [province, inProvince] = [...counts].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
  return { province, inProvince, basedOn, source: 'stimata' };
}

/**
 * Comandi (corpi e armate attivi) per provincia, con posizione reale (movimento o dislocazione) oppure stimata.
 * Un comando mosso compare dove si trova ora, anche se non ha una voce nella dislocazione (la mappa non lo mostra, il pannello sì).
 * Ritorna Map provincia → [{ id, name, estimated, inProvince?, basedOn? }].
 */
export function commandsByProvince({ commands, orbat, unitsById, positionOf, isActive }) {
  const out = new Map();
  const put = (p, row) => { if (!out.has(p)) out.set(p, []); out.get(p).push(row); };
  for (const u of commands) {
    if (u.echelon !== 'command' || !['corps', 'army'].includes(u.commandLevel) || !isActive(u)) continue;
    const real = positionOf(u.id);
    if (real) { put(real, { id: u.id, name: u.name, estimated: false }); continue; }
    const e = estimatedHqProvince({ hqId: u.id, orbat, unitsById, positionOf });
    if (e) put(e.province, { id: u.id, name: u.name, estimated: true, inProvince: e.inProvince, basedOn: e.basedOn });
  }
  return out;
}

/**
 * Unisce i comandi (stimati o mossi) ai gruppi che la mappa già disegna (unitsByProvince). Un comando già presente nella
 * dislocazione non viene duplicato. Stesse regole dei segnalini: un gruppo per nazione e provincia; il comando conta fra i «commands».
 */
export function mergeCommandsIntoProvinceUnits(base, byProvince, unitsById) {
  const out = {};
  for (const [p, groups] of Object.entries(base)) out[p] = groups.map((g) => ({ ...g, units: [...g.units] }));
  for (const [p, rows] of byProvince) {
    for (const r of rows) {
      const u = unitsById.get(r.id);
      if (!u) continue;
      const groups = (out[p] ??= []);
      if (groups.some((g) => g.units.some((x) => x.id === r.id))) continue;
      let g = groups.find((x) => x.nation === u.nation);
      if (!g) { g = { nation: u.nation, divisions: 0, commands: 0, units: [] }; groups.push(g); }
      g.commands += 1;
      g.units.push({ id: u.id, name: u.name, echelon: u.echelon, category: u.category, commandLevel: u.commandLevel ?? null });
    }
  }
  for (const groups of Object.values(out)) groups.sort((a, b) => (a.nation < b.nation ? -1 : 1));
  return out;
}
