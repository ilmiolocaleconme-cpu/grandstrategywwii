// Fiumi tra posti confinanti (data/military/river_crossings.json, generato da scripts/build-river-crossings.js a partire dai ponti di
// data/links.json): per ogni coppia di POSTI (province o sponde) il cui collegamento scavalca un fiume medio o grande, il fiume più largo.
// Serve alla battaglia: chi entra in un posto lungo uno di questi collegamenti ha attraversato il fiume. Funzioni PURE, senza I/O.
// Qualità `hypothesis` come links.json (rete e corsi moderni). Le zone urbane non compaiono (city_links non passa da qui).
export const RIVER_CROSSINGS_SCHEMA = 'river-crossings-v1';
const WIDTH_RANK = { medium: 1, large: 2 };

/**
 * Contenuto del file. links: data/links.json; rivers: data/rivers.json; provinceIds: id dei tasselli nell'ordine di caricamento
 * (lo stesso a cui puntano i nodi di links.json).
 */
export function buildRiverCrossings({ links, rivers, provinceIds }) {
  const widthOf = new Map(rivers.map((r) => [r.id, r.widthClass]));
  const nodePlace = links.nodes.map((n) => provinceIds[n.p]);
  const linkById = new Map(links.links.map((l) => [l.id, l]));
  const best = new Map();
  for (const b of links.bridges) {
    const l = linkById.get(b.link);
    const w = widthOf.get(b.riverId);
    if (!l || !(w in WIDTH_RANK)) continue;
    const pa = nodePlace[l.a]; const pb = nodePlace[l.b];
    if (!pa || !pb || pa === pb) continue;
    const [x, y] = pa < pb ? [pa, pb] : [pb, pa];
    const key = `${x}~${y}`;
    const cur = best.get(key);
    if (!cur || WIDTH_RANK[w] > WIDTH_RANK[cur.w] || (WIDTH_RANK[w] === WIDTH_RANK[cur.w] && b.riverId < cur.r)) best.set(key, { x, y, r: b.riverId, w });
  }
  const list = [...best.values()].sort((p, q) => (p.x < q.x ? -1 : p.x > q.x ? 1 : p.y < q.y ? -1 : 1));
  const places = [...new Set(list.flatMap((e) => [e.x, e.y]))].sort();
  const riverIds = [...new Set(list.map((e) => e.r))].sort();
  const pi = new Map(places.map((p, i) => [p, i])); const ri = new Map(riverIds.map((r, i) => [r, i]));
  return {
    schema: RIVER_CROSSINGS_SCHEMA, quality: 'hypothesis',
    note: 'Derivato dai ponti di data/links.json (rete moderna, hypothesis): rigenerare con node scripts/build-river-crossings.js. Una voce per coppia di posti il cui collegamento scavalca un fiume medio o grande: [posto, posto, fiume] come indici in `places` e `rivers`; a parità si tiene il fiume più largo.',
    source: { links: links.schema, checksum: links.checksum },
    places, rivers: riverIds.map((id) => [id, widthOf.get(id)]),
    pairs: list.map((e) => [pi.get(e.x), pi.get(e.y), ri.get(e.r)]),
    counts: { pairs: list.length, medium: list.filter((e) => e.w === 'medium').length, large: list.filter((e) => e.w === 'large').length },
  };
}

/** Indice { between(a, b) → { riverId, widthClass } | null, size }. */
export function createRiverIndex(file) {
  const map = new Map();
  for (const [a, b, r] of file?.pairs ?? []) {
    const x = file.places[a]; const y = file.places[b]; const [riverId, widthClass] = file.rivers[r];
    map.set(x < y ? `${x}~${y}` : `${y}~${x}`, { riverId, widthClass });
  }
  return { between: (a, b) => (a && b && a !== b ? map.get(a < b ? `${a}~${b}` : `${b}~${a}`) ?? null : null), size: map.size };
}

/** Errori del file (lista vuota = valido). placeIds / riverIds (facoltativi): insiemi degli id esistenti. */
export function validateRiverCrossings(file, { placeIds = null, riverIds = null } = {}) {
  if (file?.schema !== RIVER_CROSSINGS_SCHEMA) return [`river_crossings: schema ${JSON.stringify(file?.schema)}`];
  const errors = [];
  if (!Array.isArray(file.places) || !Array.isArray(file.rivers) || !Array.isArray(file.pairs)) return ['river_crossings: places, rivers o pairs mancanti'];
  if (placeIds) for (const p of file.places) if (!placeIds.has(p)) errors.push(`river_crossings: posto sconosciuto ${p}`);
  for (const [id, w] of file.rivers) {
    if (riverIds && !riverIds.has(id)) errors.push(`river_crossings: fiume sconosciuto ${id}`);
    if (!(w in WIDTH_RANK)) errors.push(`river_crossings: larghezza «${w}» di ${id} non ammessa`);
  }
  const seen = new Set();
  for (const [a, b, r] of file.pairs) {
    if (!(a >= 0 && a < file.places.length && b >= 0 && b < file.places.length && r >= 0 && r < file.rivers.length) || a === b) { errors.push(`river_crossings: coppia non valida ${a},${b},${r}`); continue; }
    const k = a < b ? `${a}~${b}` : `${b}~${a}`;
    if (seen.has(k)) errors.push(`river_crossings: coppia doppia ${file.places[a]} ~ ${file.places[b]}`);
    seen.add(k);
  }
  return errors;
}
