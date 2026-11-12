// Equivalenza fra voci di equipaggiamento (12/11/2026). Funzioni PURE.
// Problema: le fabbriche producono `equipment.<equipment_id>` (es. equipment.INW-DEU-RIFLE-1939), ma le divisioni chiedono la voce del LORO template
// (es. equipment.fucili nel template tedesco 1936): senza un legame i pezzi prodotti restavano in magazzino e non arrivavano ai reparti.
// Regola: due voci della stessa nazione sono la STESSA arma se le collega un alias del catalogo (chiave di template → equipment_id) o una riga della
// mappa di aggiornamento dei template (data/units/equipment/upgrade_map.json, già validata per categoria e calibro). Il legame è transitivo.
// Nessun dato nuovo: si usano solo alias e mappa esistenti. Una voce senza legami è equivalente solo a sé stessa (comportamento di prima).
const PATH = 'equipment.';
const strip = (p) => (p.startsWith(PATH) ? p.slice(PATH.length) : null);

/**
 * catalog = catalogo unito { entries, aliases }; upgradeMap = { entries: [{ nation, from, to }] }.
 * Ritorna sourcesOf(nation, item) → elenco delle voci di scorta che possono rifornire `item`: prima la voce stessa, poi le equivalenti in ordine alfabetico.
 */
// generic (facoltativo, 12/11/2026): { categoria: prodotto generico } — es. { TANK: 'tanks' }, i carri delle ricette REC-TANK-* (pezzi non
// assegnati a un modello) riforniscono qualsiasi voce di carri della nazione; categoryOf(nazione, voce) dice la categoria.
export function buildEquivalence({ catalog, upgradeMap = null, generic = null, categoryOf = null }) {
  const parent = new Map(); // union-find per chiave "NAZ|id"
  const find = (k) => { let r = k; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r); return r; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
  const link = (nation, a, b) => { const ka = `${nation}|${a}`; const kb = `${nation}|${b}`; add(ka); add(kb); union(ka, kb); };
  for (const a of catalog?.aliases ?? []) if (a.nation && a.templateKey && a.equipment_id) link(a.nation, a.templateKey, a.equipment_id);
  for (const e of upgradeMap?.entries ?? []) if (e.nation && e.from && e.to) link(e.nation, e.from, e.to);
  const groups = new Map();
  for (const k of parent.keys()) { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); }
  const members = new Map();
  for (const list of groups.values()) for (const k of list) members.set(k, list);
  return function sourcesOf(nation, item) {
    const id = strip(item);
    if (id === null) return [item];
    const list = members.get(`${nation}|${id}`);
    const others = list ? list.map((k) => PATH + k.slice(k.indexOf('|') + 1)).filter((p) => p !== item).sort() : [];
    const g = generic && categoryOf ? generic[categoryOf(nation, item)] : null;
    return g ? [item, ...others, g] : [item, ...others];
  };
}
