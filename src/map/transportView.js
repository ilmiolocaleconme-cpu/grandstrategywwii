// Strade e ferrovie sulla mappa Canvas: modello proiettato (array tipizzati), densità per zoom e disegno.
// L'aspetto (bordi, due carreggiate, traversine e rotaie, doppio binario) sta in transportStyle.js e cresce con lo
// zoom. I dati e le regole stanno in src/data/transport.js e data/transport.json; qui solo la parte grafica.
// buildTransportModel, transportRankLimit e transportLegend si provano senza browser (tests/transport.test.js);
// drawTransport usa Path2D.

import { DRAW_GROUPS, OFFSETS, RECIPES, detailTier, sizeBoost, strokePass } from './transportStyle.js';

/**
 * Soglia di importanza (scalerank di Natural Earth) mostrata a un dato zoom: da molto lontano nessuna linea (la mappa
 * resta leggibile), poi solo autostrade e linee principali, poi le altre.
 */
export function transportRankLimit(k) {
  return k < 8 ? 0 : k < 12 ? 4 : k < 18 ? 6 : 99;
}

/** Tratti proiettati sul piano della mappa (x = lon·cos0, y = −lat), con riquadro e chiave di stile. `c` = [lon, lat, ...]. */
export function buildTransportModel(file, cos0) {
  const lines = (file?.lines ?? []).map((l) => {
    const n = l.c.length / 2;
    const a = new Float32Array(l.c.length);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const x = l.c[2 * i] * cos0;
      const y = -l.c[2 * i + 1];
      a[2 * i] = x;
      a[2 * i + 1] = y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return { id: l.id, key: `${l.k}-${l.level}`, kind: l.k, level: l.level, rank: l.rank ?? 99, coords: a, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  });
  return { lines, groups: new Map() };
}

/** Aggiunge a `path` la polilinea `c` scostata di `d` unità di lato (normale media tra segmenti; angoli stretti limitati). */
function addOffset(path, c, d) {
  const n = c.length / 2;
  const pt = (i) => {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    let tx = c[2 * i1] - c[2 * i0];
    let ty = c[2 * i1 + 1] - c[2 * i0 + 1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    return [c[2 * i] - ty * d, c[2 * i + 1] + tx * d];
  };
  const [x0, y0] = pt(0);
  path.moveTo(x0, y0);
  for (let i = 1; i < n; i += 1) { const [x, y] = pt(i); path.lineTo(x, y); }
}

/** Righe della legenda: tipo, nome e come si riconosce («spec» per drawSwatch: stesso disegno della mappa a zoom alto). */
export function transportLegend() {
  return [
    { key: 'road-1', label: 'Strada secondaria', how: 'una carreggiata, bordo scuro' },
    { key: 'road-2', label: 'Strada principale', how: 'gialla, linea di mezzeria' },
    { key: 'road-3', label: 'Autostrada (prime, 1936)', how: 'due carreggiate con spartitraffico' },
    { key: 'rail-2', label: 'Ferrovia a binario unico', how: 'rotaie con traversine' },
    { key: 'rail-3', label: 'Ferrovia potenziata', how: 'doppio binario' },
  ].map((r) => ({ ...r, spec: { kind: 'line', key: r.key } }));
}

// Tratti raggruppati per stile e per soglia di densità, in cache nel modello.
function groupsFor(model, rankLimit) {
  if (model.groups.has(rankLimit)) return model.groups.get(rankLimit);
  const byKey = new Map();
  for (const l of model.lines) {
    if (l.rank > rankLimit) continue;
    if (!byKey.has(l.key)) byKey.set(l.key, []);
    byKey.get(l.key).push(l);
  }
  model.groups.set(rankLimit, byKey);
  return byKey;
}

/**
 * Disegna strade e ferrovie visibili: strade sotto, ferrovie sopra, le autostrade (livello 3) per ultime in cima a tutto.
 * Il dettaglio dipende dallo zoom (detailTier): linee semplici, poi bordi e tratteggi, poi il disegno completo.
 * Ogni gruppo si fa per passate (tutti i bordi, poi tutti i riempimenti…) così gli incroci restano puliti.
 * Il contesto ha già la trasformazione mappa → schermo (`sx` pixel per unità): spessori e tratteggi in pixel si dividono per `sx`.
 * cull = { x0, x1, y0, y1 } in unità di mappa. Ritorna il numero di tratti disegnati.
 */
export function drawTransport(ctx, model, { sx: sxMap, k, cull }) {
  const sx = sxMap / sizeBoost(k); // a zoom massimo i segni crescono (spessori e tratteggi in px × boost)
  if (transportRankLimit(k) === 0) return 0;
  const byKey = groupsFor(model, transportRankLimit(k));
  const tier = detailTier(k);
  let drawn = 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  for (const group of DRAW_GROUPS) {
    const paths = [];
    for (const key of group) {
      const list = byKey.get(key);
      if (!list) continue;
      const off = tier === 2 ? OFFSETS[key] : undefined; // due tracciati paralleli (carreggiate, binari)
      const path = new Path2D();
      const path2 = off ? new Path2D() : null;
      let any = false;
      for (const l of list) {
        const b = l.bbox;
        if (b.x > cull.x1 || b.x + b.w < cull.x0 || b.y > cull.y1 || b.y + b.h < cull.y0) continue;
        const c = l.coords;
        path.moveTo(c[0], c[1]);
        if (off) { addOffset(path, c, -off / sx); addOffset(path2, c, off / sx); } else for (let i = 2; i < c.length; i += 2) path.lineTo(c[i], c[i + 1]);
        any = true;
        drawn += 1;
      }
      if (any) { paths.push({ key, path }); if (path2) paths.push({ key, path: path2 }); }
    }
    const passes = Math.max(0, ...paths.map((p) => RECIPES[p.key][tier].length));
    for (let i = 0; i < passes; i += 1) {
      for (const { key, path } of paths) {
        const pass = RECIPES[key][tier][i];
        if (pass) strokePass(ctx, pass, sx, path);
      }
    }
  }
  ctx.setLineDash([]);
  return drawn;
}
