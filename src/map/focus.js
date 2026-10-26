// Inquadratura iniziale sulla nazione scelta. Funzioni PURE (testate in tests/focus.test.js).
import { layoutOf } from './canvasView.js';
import { MAX_K, WORLD_W, minZoomToFit, wrapView } from './geo.js';

const COS0 = WORLD_W / 360;
const bboxOfFeature = (g) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const rings of polys) for (const [x, y] of rings[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
};
const gapBetween = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1, 0);

/**
 * Riquadro (gradi) del nucleo di una nazione: si parte dalla provincia più grande e si aggiungono, finché ce ne sono, quelle della
 * stessa nazione che distano meno di `gapDeg` dal riquadro raccolto (terraferma contigua e isole vicine). Territori lontani (colonie,
 * possedimenti oltremare) restano fuori, così l'inquadratura non diventa un planisfero. Null se la nazione non ha province.
 */
export function nationBounds(features, nationId, gapDeg = 8) {
  const own = features.filter((f) => f.properties.owner === nationId).map((f) => bboxOfFeature(f.geometry));
  if (own.length === 0) return null;
  let seed = own[0];
  for (const b of own) if ((b.x1 - b.x0) * (b.y1 - b.y0) > (seed.x1 - seed.x0) * (seed.y1 - seed.y0)) seed = b;
  let box = { ...seed };
  const used = new Set([seed]);
  for (let grew = true; grew;) {
    grew = false;
    for (const b of own) {
      if (used.has(b) || gapBetween(box, b) > gapDeg) continue;
      used.add(b); grew = true;
      box = { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) };
    }
  }
  return { lon0: box.x0, lat0: box.y0, lon1: box.x1, lat1: box.y1 };
}

/**
 * Vista {k, x, y} che mette `bounds` (gradi) al centro dello schermo W x H con un po' di margine. `minSpanDeg`: le nazioni piccole
 * non riempiono lo schermo, si vede anche il contesto attorno.
 */
export function focusView(bounds, W, H, vb, { minSpanDeg = 16, margin = 1.3, maxK = MAX_K } = {}) {
  const lay = layoutOf(vb, W, H);
  const lonSpan = Math.max(bounds.lon1 - bounds.lon0, minSpanDeg);
  const latSpan = Math.max(bounds.lat1 - bounds.lat0, minSpanDeg * (H / W));
  const kMin = minZoomToFit(W, H, lay.s);
  const k = Math.min(maxK, Math.max(kMin, Math.min(W / (lonSpan * COS0 * margin * lay.s), H / (latSpan * margin * lay.s))));
  const cx = ((bounds.lon0 + bounds.lon1) / 2) * COS0;
  const cy = -((bounds.lat0 + bounds.lat1) / 2);
  return wrapView({ k, x: (W / 2 - lay.ox) / lay.s - k * cx + vb.x, y: (H / 2 - lay.oy) / lay.s - k * cy + vb.y }, vb);
}
