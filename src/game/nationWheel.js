// Logica pura della ruota di scelta nazione (provata senza browser: tests/nation_wheel.test.js).
// L'ordine sta in data/nation_order.json; qui si decide solo che cosa mostrare e dove.

export const VISIBLE_OFFSETS = [-2, -1, 0, 1, 2]; // cinque posti: centro e due per lato

/** Elenco ordinato per la ruota: { id, name, playable }. Gli id sconosciuti si scartano; le nazioni scegliibili fuori ordine vanno in fondo. */
export function buildWheel({ order, names, playableIds }) {
  const playable = new Set(playableIds);
  const seen = new Set();
  const out = [];
  const add = (id) => {
    if (seen.has(id) || !(id in names)) return;
    seen.add(id);
    out.push({ id, name: names[id], playable: playable.has(id) });
  };
  order.forEach(add);
  [...playable].sort().forEach(add);
  return out;
}

export function clampIndex(i, count) {
  return Math.max(0, Math.min(count - 1, i));
}

/** Indice della nazione iniziale (al centro all'apertura); 0 se manca. */
export function startIndex(list, startId) {
  const i = list.findIndex((e) => e.id === startId);
  return i >= 0 ? i : 0;
}

/** I cinque posti attorno al centro: { offset, index } con index null fuori dalla lista (posto vuoto). */
export function visibleSlots(center, count) {
  return VISIBLE_OFFSETS.map((offset) => {
    const index = center + offset;
    return { offset, index: index >= 0 && index < count ? index : null };
  });
}

/** Posa di una card a distanza `offset` dal centro: più lontana = più indietro, più piccola, più ruotata e più sbiadita. */
export function slotPose(offset) {
  const d = Math.abs(offset);
  if (d > 2) return { x: Math.sign(offset) * 190, z: -260, rotY: -Math.sign(offset) * 60, scale: 0.6, opacity: 0, hidden: true };
  const sign = Math.sign(offset);
  return {
    x: sign * [0, 140, 224][d],
    z: [60, -70, -170][d],
    rotY: -sign * [0, 38, 52][d],
    scale: [1.08, 0.9, 0.78][d],
    opacity: [1, 0.9, 0.7][d],
    hidden: false,
  };
}

/** Dopo un gesto orizzontale di `dx` pixel: -1, 0 o +1 posti (uno alla volta). Trascinare a sinistra porta avanti nella lista. */
export function stepFromDrag(dx, threshold = 36) {
  if (dx <= -threshold) return 1;
  if (dx >= threshold) return -1;
  return 0;
}
