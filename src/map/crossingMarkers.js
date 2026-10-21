// Marcatori dei punti di passaggio sulla mappa Canvas: forma, colore e dimensione dicono il LIVELLO della
// struttura (1 leggera, 2 media, 3 pesante), il tratteggio dice che il fiume fa da confine.
// Solo disegno: i dati e le regole stanno in src/data/crossingPoints.js e data/crossing_points.json.
// Il browser non è necessario per provare buildMarkers e markerLegend (tests/crossing_points.test.js).

import { CROSSING_LEVELS, markerCellPx, minLevelForZoom } from '../data/crossingPoints.js';

export const MARKER_STYLE = Object.freeze({
  1: { fill: 'rgba(0,0,0,0)', stroke: '#e8e2c8', size: 2.8, shape: 'circle' }, // guado, traghetto, passerella: cerchio vuoto
  2: { fill: '#f0c040', stroke: '#1d2418', size: 3.6, shape: 'square' }, // ponte stradale: quadrato giallo
  3: { fill: '#e8643c', stroke: '#ffffff', size: 4.8, shape: 'diamond' }, // ponte pesante: rombo arancio con filo bianco e punto centrale
});

/** Punti proiettati sul piano della mappa (x = lon·cos0, y = −lat), pronti da disegnare. */
export function buildMarkers(file, cos0) {
  return (file?.points ?? []).map((p) => ({
    id: p.id,
    x: p.lon * cos0,
    y: -p.lat,
    level: p.level,
    kind: p.kind,
    riverId: p.riverId,
    from: p.from,
    to: p.to,
  }));
}

/** Righe della legenda: livello, nome, esempio di struttura e come si riconosce sulla mappa. */
export function markerLegend() {
  return CROSSING_LEVELS.map((l) => ({
    level: l.level,
    label: `Livello ${l.level} · ${l.label}`,
    hint: l.hint,
    shape: MARKER_STYLE[l.level].shape,
    fill: MARKER_STYLE[l.level].fill,
    stroke: MARKER_STYLE[l.level].stroke,
  }));
}

function shapePath(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.25, y);
    ctx.lineTo(x, y + r * 1.25);
    ctx.lineTo(x - r * 1.25, y);
    ctx.closePath();
  }
}


/** Marcatori visibili a quel zoom e dentro `cull`, senza sovrapposizioni: i livelli alti hanno la precedenza. */
export function visibleMarkers(markers, { sx, k, cull }) {
  const minLevel = minLevelForZoom(k);
  const cell = markerCellPx(k) / sx; // due marcatori nella stessa cella non si disegnano entrambi (vince il livello più alto)
  const taken = new Set();
  const out = [];
  for (const level of [3, 2, 1]) {
    if (level < minLevel) continue;
    for (const m of markers) {
      if (m.level !== level || m.x < cull.x0 || m.x > cull.x1 || m.y < cull.y0 || m.y > cull.y1) continue;
      const key = `${Math.floor(m.x / cell)}|${Math.floor(m.y / cell)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      out.push(m);
    }
  }
  return out;
}

/**
 * Disegna i marcatori visibili. Il contesto ha già la trasformazione mappa → schermo (`sx` = pixel per unità):
 * le misure in pixel si dividono per `sx`, così i simboli restano grandi uguali a ogni zoom.
 * cull = { x0, x1, y0, y1 } in unità di mappa; k = zoom (a vista d'insieme solo le strutture pesanti).
 * L'anello tratteggiato dei fiumi-confine compare da zoom 3,5, quando c'è spazio. Ritorna quanti ne ha disegnati.
 */
export function drawMarkers(ctx, markers, { sx, k, cull }) {
  const list = visibleMarkers(markers, { sx, k, cull });
  ctx.lineJoin = 'round';
  for (const level of [1, 2, 3]) { // i pesanti per ultimi, sopra gli altri
    const st = MARKER_STYLE[level];
    const r = st.size / sx;
    for (const m of list) {
      if (m.level !== level) continue;
      ctx.fillStyle = st.fill;
      ctx.strokeStyle = st.stroke;
      if (m.kind === 'river_border' && k >= 3.5) { // il fiume fa da confine: anello tratteggiato intorno al simbolo
        ctx.setLineDash([2 / sx, 2 / sx]);
        ctx.lineWidth = 1 / sx;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, r * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = st.stroke;
      }
      shapePath(ctx, st.shape, m.x, m.y, r);
      ctx.lineWidth = (level === 3 ? 1.2 : 1) / sx;
      ctx.fill();
      ctx.stroke();
      if (level === 3) { // punto centrale: distingue il livello pesante anche a colpo d'occhio
        ctx.beginPath();
        ctx.arc(m.x, m.y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }
  }
  return list.length;
}
