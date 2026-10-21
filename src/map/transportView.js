// Strade e ferrovie sulla mappa Canvas: modello proiettato (array tipizzati), densità per zoom e disegno.
// Il livello si riconosce da colore e spessore (strade) e da tratteggio e spessore (ferrovie). I dati e le regole
// stanno in src/data/transport.js e data/transport.json; qui solo la parte grafica. buildTransportModel,
// transportRankLimit e transportLegend si provano senza browser (tests/transport.test.js); drawTransport usa Path2D.

export const TRANSPORT_STYLE = Object.freeze({
  'road-1': { stroke: '#d8c690', width: 0.8, dash: null },
  'road-2': { stroke: '#f2d25a', width: 1.5, dash: null },
  'rail-2': { stroke: '#e4e4dc', width: 1, dash: [3, 2.2] },
  'rail-3': { stroke: '#ffffff', width: 1.8, dash: [4.5, 2.2] },
});

/** Soglia di importanza (scalerank di Natural Earth) mostrata a un dato zoom: a vista d'insieme solo le linee principali. */
export function transportRankLimit(k) {
  return k < 1.8 ? 4 : k < 3.5 ? 6 : 99;
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

/** Righe della legenda: nome, tipo di tratto e stile (colore, spessore, tratteggio). */
export function transportLegend() {
  return [
    { key: 'road-1', label: 'Strada secondaria' },
    { key: 'road-2', label: 'Strada principale' },
    { key: 'rail-2', label: 'Ferrovia a binario unico' },
    { key: 'rail-3', label: 'Ferrovia principale' },
  ].map((r) => ({ ...r, ...TRANSPORT_STYLE[r.key] }));
}

// Tratti raggruppati per stile e per soglia di densità, in cache nel modello (un Path2D per gruppo).
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
 * Disegna strade e ferrovie visibili: le strade sotto, le ferrovie sopra, i livelli alti per ultimi.
 * Il contesto ha già la trasformazione mappa → schermo (`sx` pixel per unità): spessori e tratteggi in pixel si dividono per `sx`.
 * cull = { x0, x1, y0, y1 } in unità di mappa. Ritorna il numero di tratti disegnati.
 */
export function drawTransport(ctx, model, { sx, k, cull }) {
  const byKey = groupsFor(model, transportRankLimit(k));
  let drawn = 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  for (const key of ['road-1', 'road-2', 'rail-2', 'rail-3']) {
    const list = byKey.get(key);
    if (!list) continue;
    const st = TRANSPORT_STYLE[key];
    const path = new Path2D();
    let any = false;
    for (const l of list) {
      const b = l.bbox;
      if (b.x > cull.x1 || b.x + b.w < cull.x0 || b.y > cull.y1 || b.y + b.h < cull.y0) continue;
      const c = l.coords;
      path.moveTo(c[0], c[1]);
      for (let i = 2; i < c.length; i += 2) path.lineTo(c[i], c[i + 1]);
      any = true;
      drawn += 1;
    }
    if (!any) continue;
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = st.width / sx;
    ctx.setLineDash(st.dash ? st.dash.map((d) => d / sx) : []);
    ctx.stroke(path);
  }
  ctx.setLineDash([]);
  return drawn;
}
