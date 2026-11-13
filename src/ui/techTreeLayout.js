// Disposizione dell'albero tecnologico (14/11/2026, richiesta dell'utente: albero a colonne con collegamenti, come nell'immagine di esempio).
// Funzioni PURE, senza React: colonne = profondità (lunghezza della catena di prerequisiti), una fascia orizzontale per ramo («segmento»),
// collegamenti dai prerequisiti alle tecnologie che li richiedono, avanzamento per ramo.
export const NODE_W = 210;
export const NODE_H = 64;
export const GAP_X = 56;
export const GAP_Y = 14;
export const LANE_HEAD = 26; // spazio per il nome del ramo sopra la fascia

/** Profondità di ogni tecnologia: 0 senza prerequisiti, altrimenti 1 + la massima dei prerequisiti (i cicli sono già esclusi dalla validazione). */
export function depths(techs) {
  const byId = new Map(techs.map((t) => [t.id, t]));
  const memo = new Map();
  const depth = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const pre = (byId.get(id)?.prerequisites ?? []).filter((p) => byId.has(p));
    const d = pre.length ? 1 + Math.max(...pre.map((p) => depth(p, seen))) : 0;
    memo.set(id, d);
    return d;
  };
  for (const t of techs) depth(t.id);
  return memo;
}

/**
 * branches = [{ id, name_it }] (ordine delle fasce); techs = [{ id, branch, prerequisites }]; doneIds = Set delle tecnologie acquisite.
 * Ritorna { width, height, lanes: [{ id, name, y, height, done, total }], nodes: Map(id → { x, y, col }), edges: [{ from, to, path }] }.
 */
export function layoutTree(branches, techs, doneIds = new Set()) {
  const d = depths(techs);
  const order = [...branches.map((b) => b.id), ...[...new Set(techs.map((t) => t.branch))].filter((b) => !branches.some((x) => x.id === b))];
  const nodes = new Map();
  const lanes = [];
  let y = 0;
  let maxCol = 0;
  for (const bid of order) {
    const list = techs.filter((t) => t.branch === bid);
    if (!list.length) continue;
    // righe: prima colonna in ordine di id; nelle successive ogni tecnologia va all'altezza media dei suoi prerequisiti dello stesso ramo
    // (se la riga è già occupata, scende alla prima libera), così i collegamenti restano corti e diritti
    const rowOf = new Map();
    let rows = 0;
    const cols = [...new Set(list.map((t) => d.get(t.id)))].sort((a, b) => a - b);
    for (const col of cols) {
      const want = (t) => { const pr = (t.prerequisites ?? []).filter((p) => rowOf.has(p)).map((p) => rowOf.get(p)); return pr.length ? pr.reduce((x, v) => x + v, 0) / pr.length : -1; };
      const inCol = list.filter((t) => d.get(t.id) === col).sort((a, b) => want(a) - want(b) || (a.id < b.id ? -1 : 1));
      let next = 0;
      for (const t of inCol) {
        const row = Math.max(next, Math.round(Math.max(0, want(t))));
        rowOf.set(t.id, row);
        next = row + 1;
        nodes.set(t.id, { x: col * (NODE_W + GAP_X), y: y + LANE_HEAD + row * (NODE_H + GAP_Y), col });
        rows = Math.max(rows, row + 1);
      }
      maxCol = Math.max(maxCol, col);
    }
    const height = LANE_HEAD + rows * (NODE_H + GAP_Y);
    lanes.push({ id: bid, name: branches.find((b) => b.id === bid)?.name_it ?? bid, y, height, done: list.filter((t) => doneIds.has(t.id)).length, total: list.length });
    y += height + GAP_Y;
  }
  const edges = [];
  for (const t of techs) {
    for (const p of t.prerequisites ?? []) {
      const a = nodes.get(p); const b = nodes.get(t.id);
      if (!a || !b) continue;
      const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2; const x2 = b.x; const y2 = b.y + NODE_H / 2;
      const mid = (x1 + x2) / 2;
      edges.push({ from: p, to: t.id, path: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2 - 6},${y2}` });
    }
  }
  return { width: (maxCol + 1) * (NODE_W + GAP_X) - GAP_X, height: Math.max(0, y - GAP_Y), lanes, nodes, edges };
}

/** Tecnologie collegate a quella scelta: tutti i prerequisiti (a monte) e tutte quelle che la richiedono (a valle), per evidenziarle. */
export function related(techs, id) {
  const pre = new Map(techs.map((t) => [t.id, t.prerequisites ?? []]));
  const up = new Set();
  const stack = [...(pre.get(id) ?? [])];
  while (stack.length) { const p = stack.pop(); if (!up.has(p)) { up.add(p); stack.push(...(pre.get(p) ?? [])); } }
  const down = new Set();
  const queue = [id];
  while (queue.length) { const c = queue.shift(); for (const t of techs) if ((t.prerequisites ?? []).includes(c) && !down.has(t.id)) { down.add(t.id); queue.push(t.id); } }
  return { up, down };
}
