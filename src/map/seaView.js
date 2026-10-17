// Logica pura delle zone marittime per la mappa (nomi visibili per zoom, selezione per punto).
// Niente React né Canvas: si prova con node (tests/seaview.test.js).

/** Nomi da mostrare allo zoom `k`: i grandi mari sempre, i golfi da k≥2, gli stretti da k≥4 (non coprono la mappa). */
export function seaLabels(zones, k) {
  return zones.filter((z) => (z.kind === 'strait' || z.kind === 'approach' ? k >= 4 : z.kind === 'gulf' ? k >= 2 : true));
}

function bboxOf(z) {
  if (z.bbox) return z.bbox;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const ring of z.rings) for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  z.bbox = [x0, y0, x1, y1];
  return z.bbox;
}

/** Punto (lon, lat) dentro l'insieme di anelli con regola pari-dispari (i buchi sono isole). */
function insideRings(rings, lon, lat) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Zona marittima che contiene il punto, o null. */
export function seaZoneAt(zones, lon, lat) {
  for (const z of zones) {
    const [x0, y0, x1, y1] = bboxOf(z);
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (insideRings(z.rings, lon, lat)) return z;
  }
  return null;
}
