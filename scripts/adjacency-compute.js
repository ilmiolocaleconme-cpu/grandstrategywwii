// Calcolo dell'adiacenza tra province dai poligoni (solo script: non entra nel pacchetto del browser).
//
// Metodo: il contorno di ogni provincia è campionato ogni `stepDeg` gradi; due province sono
// adiacenti se i loro contorni restano a meno di `tolDeg` gradi l'uno dall'altro per un tratto.
// La lunghezza del tratto comune è la MINORE delle due stime (A vicino a B, B vicino ad A) ed è
// una stima grossolana: i contorni sono poligonali e a scala diversa, quindi tende a SOVRASTIMARE
// (da verifiche a mano 1,3-1,6 volte la lunghezza reale dei confini). Serve a confrontare ordini
// di grandezza, non come misura.
//
// Limite noto: dove i poligoni costieri non sono ritagliati (vedi docs/DATI_PROVINCE.md) due
// province separate da un braccio di mare stretto possono risultare adiacenti. I casi riconosciuti
// sono esclusi a mano in data/adjacency_overrides.json, con il motivo.

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON_EQ = 111.32;

function segmentKm(x0, y0, x1, y1) {
  const midLat = ((y0 + y1) / 2) * (Math.PI / 180);
  const dx = (x1 - x0) * KM_PER_DEG_LON_EQ * Math.cos(midLat);
  const dy = (y1 - y0) * KM_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/**
 * @param {{features: object[]}} collection province unite (ordine = ordine degli indici nel risultato)
 * @returns {{ edges: Array<[number, number, number]>, params: object }} archi [i, j, km] con i < j, ordinati
 */
export function computeAdjacency(collection, { stepDeg = 0.01, tolDeg = 0.02, cellDeg = 0.05 } = {}) {
  const px = [];
  const py = [];
  const pw = [];
  const pp = [];
  const grid = new Map();
  const cellKey = (cx, cy) => `${cx},${cy}`;

  collection.features.forEach((feature, provinceIndex) => {
    const g = feature.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const [x0, y0] = ring[i];
          const [x1, y1] = ring[i + 1];
          if (Math.abs(x0) === 180 && x0 === x1) continue; // tratto sulla cucitura a ±180°: non è un confine
          const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / stepDeg));
          const w = segmentKm(x0, y0, x1, y1) / n;
          for (let k = 0; k < n; k += 1) {
            const x = x0 + ((x1 - x0) * k) / n;
            const y = y0 + ((y1 - y0) * k) / n;
            const idx = px.length;
            px.push(x); py.push(y); pw.push(w); pp.push(provinceIndex);
            const key = cellKey(Math.floor(x / cellDeg), Math.floor(y / cellDeg));
            const bucket = grid.get(key);
            if (bucket) bucket.push(idx); else grid.set(key, [idx]);
          }
        }
      }
    }
  });

  const directed = new Map(); // "p>q" -> km di contorno di p entro la tolleranza da q
  const tol2 = tolDeg * tolDeg;
  for (let s = 0; s < px.length; s += 1) {
    const p = pp[s];
    const cx = Math.floor(px[s] / cellDeg);
    const cy = Math.floor(py[s] / cellDeg);
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = grid.get(cellKey(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const t of bucket) {
          const q = pp[t];
          if (q === p || seen.has(q)) continue;
          const ex = px[t] - px[s];
          const ey = py[t] - py[s];
          if (ex * ex + ey * ey <= tol2) seen.add(q);
        }
      }
    }
    for (const q of seen) {
      const key = `${p}>${q}`;
      directed.set(key, (directed.get(key) ?? 0) + pw[s]);
    }
  }

  const edges = [];
  for (const [key, km] of directed) {
    const [p, q] = key.split('>').map(Number);
    if (p > q) continue; // ogni coppia una volta sola
    const back = directed.get(`${q}>${p}`) ?? 0;
    const shared = Math.min(km, back);
    if (shared > 0) edges.push([p, q, Math.max(1, Math.round(shared))]);
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { edges, params: { stepDeg, tolDeg } };
}
