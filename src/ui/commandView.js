// Vista della catena di comando (pura, senza React): albero, unità da assegnare e comandi validi per una unità.
// Le regole di inquadramento restano in src/rules/orbat.js (canAttach): qui si preparano solo i dati per il pannello.
import { orbatLevel, LEVEL_RANK, childrenOf, descendantsOf, canAttach } from '../rules/orbat.js';
import { isActiveAt } from '../data/units.js';

export const LEVEL_LABEL = { theater: 'Teatro', army_group: 'Gruppo d’armate', army: 'Armata', corps: 'Corpo d’armata', division: 'Divisione', brigade: 'Brigata', support: 'Supporto' };

/** Etichetta del livello di una unità (le brigate si distinguono dalle divisioni). */
export function levelLabel(unit) {
  const l = orbatLevel(unit);
  if (l === 'division' && unit.echelon === 'brigade') return LEVEL_LABEL.brigade;
  return LEVEL_LABEL[l] ?? '';
}

const isCommand = (u) => { const l = orbatLevel(u); return l !== null && l !== 'division' && l !== 'support'; };
const byRankThenName = (a, b) => (LEVEL_RANK[orbatLevel(b)] - LEVEL_RANK[orbatLevel(a)]) || a.name.localeCompare(b.name, 'it') || (a.id < b.id ? -1 : 1);

/** Unità inquadrabili e attive della nazione, per id. */
export function nationUnits(units, nation, date) {
  return units.filter((u) => u.nation === nation && orbatLevel(u) !== null && isActiveAt(u, date));
}

/** Albero: radici = comandi senza padre; ogni nodo ha i figli ordinati (comandi prima, poi divisioni, poi supporti) e i conteggi dei discendenti. */
export function commandTree(orbat, units, nation, date) {
  const mine = nationUnits(units, nation, date);
  const byId = new Map(mine.map((u) => [u.id, u]));
  const build = (u, seen) => {
    const kids = childrenOf(orbat, u.id).map((id) => byId.get(id)).filter((k) => k && !seen.has(k.id)).sort(byRankThenName);
    const next = new Set([...seen, u.id]);
    const children = kids.map((k) => build(k, next));
    const divisions = children.reduce((s, c) => s + c.divisions, 0) + children.filter((c) => c.level === 'division').length;
    return { id: u.id, name: u.name, level: orbatLevel(u), label: levelLabel(u), category: u.category, children, divisions };
  };
  return mine.filter((u) => isCommand(u) && !orbat.links[u.id]).sort(byRankThenName).map((u) => build(u, new Set()));
}

/** Righe visibili dell'albero con profondità, rispettando i nodi aperti e il testo cercato (la ricerca apre i rami che contengono il risultato). */
export function visibleRows(roots, expanded, query = '') {
  const q = query.trim().toLowerCase();
  const matches = (n) => n.name.toLowerCase().includes(q) || n.children.some(matches);
  const rows = [];
  const walk = (n, depth) => {
    if (q && !matches(n)) return;
    const open = q ? true : expanded.has(n.id);
    rows.push({ node: n, depth, open, hasChildren: n.children.length > 0 });
    if (open) n.children.forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));
  return rows;
}

/** Divisioni e supporti ancora senza comando (e le brigate), più i comandi non ancora in albero non servono qui: sono radici. */
export function loose(orbat, units, nation, date, query = '') {
  const q = query.trim().toLowerCase();
  return nationUnits(units, nation, date)
    .filter((u) => !isCommand(u) && !orbat.links[u.id] && (!q || u.name.toLowerCase().includes(q)))
    .sort(byRankThenName);
}

/** Comandi a cui l'unità può essere aggiunta, raggruppati per livello (dal più alto). Esclude il padre attuale. */
export function validParents(orbat, unitId, units, nation, date) {
  const cur = orbat.links[unitId]?.parent ?? null;
  const out = [];
  for (const p of nationUnits(units, nation, date).filter(isCommand)) {
    if (p.id === cur) continue;
    if (canAttach(orbat, { childId: unitId, parentId: p.id, units, date }).ok) out.push(p);
  }
  out.sort(byRankThenName);
  const groups = [];
  for (const p of out) {
    const last = groups[groups.length - 1];
    if (last && last.level === orbatLevel(p)) last.items.push(p); else groups.push({ level: orbatLevel(p), label: LEVEL_LABEL[orbatLevel(p)], items: [p] });
  }
  return groups;
}

/** Unità che possono essere aggiunte a un comando (senza padre, di livello più basso), per livello. */
export function validChildren(orbat, parentId, units, nation, date) {
  const out = nationUnits(units, nation, date).filter((u) => u.id !== parentId && !orbat.links[u.id]
    && canAttach(orbat, { childId: u.id, parentId, units, date }).ok).sort(byRankThenName);
  const groups = [];
  for (const u of out) { // raggruppa per etichetta anche se i nomi si alternano (divisioni e brigate)
    const lv = levelLabel(u);
    const g = groups.find((x) => x.label === lv);
    if (g) g.items.push(u); else groups.push({ level: orbatLevel(u), label: lv, items: [u] });
  }
  return groups;
}

/** Percorso leggibile dei padri: "Armata 1 › Gruppo d’armate A". */
export function pathOf(orbat, unitId, byId) {
  const names = []; const seen = new Set([unitId]);
  let cur = orbat.links[unitId]?.parent;
  while (cur && !seen.has(cur)) { names.push(byId.get(cur)?.name ?? cur); seen.add(cur); cur = orbat.links[cur]?.parent; }
  return names;
}

/** Quante divisioni (e brigate) stanno sotto un comando, a ogni livello. */
export function countDivisions(orbat, unitId, byId) {
  return descendantsOf(orbat, unitId).filter((id) => orbatLevel(byId.get(id) ?? {}) === 'division').length;
}
