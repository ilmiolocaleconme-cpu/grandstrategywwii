// Matematica della vista per il renderer Canvas (prototipo): stessa vista {k, x, y} di MapView, stesso viewBox.
// Funzioni pure testate in tests/canvas.test.js. Convenzione: schermo = s * (k * u + view.x - vb.x) + o, con `s` pixel CSS
// per unità di mappa a zoom 1 (come ctm.a dell'SVG con preserveAspectRatio "meet"), `u` unità di mappa e `o` lo scarto di centratura.

/** Scala e scarti con cui il viewBox `vb` sta in un contenitore W x H (pixel CSS), centrato come `xMidYMid meet`. */
export function layoutOf(vb, W, H) {
  const s = Math.min(W / vb.w, H / vb.h);
  return { s, ox: (W - vb.w * s) / 2, oy: (H - vb.h * s) / 2 };
}

/** Trasformazione unità di mappa -> pixel CSS dello schermo: px = sx * u + tx, py = sx * v + ty. */
export function affineOf(view, vb, lay) {
  return { sx: lay.s * view.k, tx: lay.s * (view.x - vb.x) + lay.ox, ty: lay.s * (view.y - vb.y) + lay.oy };
}

/** Punto dello schermo (pixel CSS) -> unità di mappa. */
export function screenToUnit(view, vb, lay, px, py) {
  const a = affineOf(view, vb, lay);
  return [(px - a.tx) / a.sx, (py - a.ty) / a.sx];
}

/** Punto dello schermo -> coordinate della vista (quelle che MapView ricava con toView e passa a zoomAt). */
export function screenToView(vb, lay, px, py) {
  return [(px - lay.ox) / lay.s + vb.x, (py - lay.oy) / lay.s + vb.y];
}

/**
 * Immagine già disegnata con la vista `v0` (che copre `region`, rettangolo in pixel CSS rispetto allo schermo di v0)
 * portata alla vista `v1`: ritorna il rettangolo di destinazione {x, y, w, h} e il rapporto di scala r.
 * Vale per qualunque coppia di viste "continue" (senza normalizzazione del giro del mondo nel mezzo).
 */
export function blitPlan(v0, v1, vb, lay, region) {
  const a0 = affineOf(v0, vb, lay);
  const a1 = affineOf(v1, vb, lay);
  const r = a1.sx / a0.sx;
  const tx = a1.tx - r * a0.tx;
  const ty = a1.ty - r * a0.ty;
  return { r, x: r * region.x + tx, y: r * region.y + ty, w: r * region.w, h: r * region.h };
}

/** Il rettangolo di destinazione copre tutto lo schermo W x H? (altrimenti si vedrebbero bordi vuoti). */
export function coversScreen(rect, W, H, slack = 0.5) {
  return rect.x <= slack && rect.y <= slack && rect.x + rect.w >= W - slack && rect.y + rect.h >= H - slack;
}

/**
 * Il mondo si ripete in orizzontale: se l'immagine disegnata è larga almeno un giro del mondo (`period` = larghezza di un giro in
 * pixel allo zoom attuale), contiene ogni longitudine e basta ripeterla per riempire lo schermo, senza bordi vuoti né ridisegni.
 * Ritorna gli spostamenti orizzontali (pixel) con cui disegnarla: [0] se non basta un giro.
 */
export function tileOffsets(rect, period, W) {
  if (!(period > 0) || rect.w < period - 0.5) return [0];
  const out = [];
  for (let n = -8; n <= 8; n += 1) {
    const x = rect.x + n * period;
    if (x < W && x + rect.w > 0) out.push(n * period);
  }
  return out.length ? out : [0];
}

/** Come coversScreen, ma con l'immagine ripetibile in orizzontale (vedi tileOffsets): basta coprire lo schermo in verticale. */
export function coversScreenWrap(rect, W, H, period, slack = 0.5) {
  if (period > 0 && rect.w >= period - 0.5) return rect.y <= slack && rect.y + rect.h >= H - slack;
  return coversScreen(rect, W, H, slack);
}

// Ridisegni durante il gesto. Un ridisegno della scena è sincrono e può costare da centinaia di ms a secondi sul telefono:
// se parte a ogni fotogramma il thread principale non si libera più e il gesto si ferma. Regole: si ridisegna solo se
// l'immagine non copre lo schermo o è troppo ingrandita/rimpicciolita, mai più spesso di MOVING_MIN_GAP_MS e mai prima che
// sia passato il doppio del costo dell'ultimo ridisegno (così il tempo libero per i gesti è almeno la metà).
export const MOVING_MIN_GAP_MS = 250;
export const RATIO_MAX = 1.8;
export const RATIO_MIN = 0.55;
/**
 * Ritardo (ms) con cui ridisegnare durante un gesto, o null se l'immagine attuale basta.
 * covers: l'immagine copre lo schermo; ratio: rapporto di scala immagine/vista; now, lastEnd: istanti (ms) e fine
 * dell'ultimo ridisegno; lastCost: durata (ms) dell'ultimo ridisegno.
 */
export function gestureRenderDelay({ covers, ratio, now, lastEnd = -Infinity, lastCost = 0 }) {
  if (covers && ratio <= RATIO_MAX && ratio >= RATIO_MIN) return null;
  const earliest = lastEnd + Math.max(MOVING_MIN_GAP_MS, 2 * lastCost);
  return Math.max(covers ? 80 : 0, earliest - now);
}

// Versioni semplificate: la tolleranza di ogni livello (unità di mappa) deve restare sotto MAX_ERR_PX pixel allo zoom corrente.
export const MAX_ERR_PX = 0.35;
/** Livello di semplificazione (0..2) o 3 = dettaglio pieno, dato `sx` = pixel CSS per unità di mappa. `tols` in unità di mappa, dal più grossolano. */
export function lodLevelForScale(sx, tols) {
  for (let i = 0; i < tols.length; i += 1) if (tols[i] * sx <= MAX_ERR_PX) return i;
  return tols.length;
}

/** Rettangolo (unità di mappa) corrispondente a una regione dello schermo, per scartare ciò che è fuori. */
export function regionToUnits(view, vb, lay, region) {
  const [x0, y0] = screenToUnit(view, vb, lay, region.x, region.y);
  const [x1, y1] = screenToUnit(view, vb, lay, region.x + region.w, region.y + region.h);
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}
