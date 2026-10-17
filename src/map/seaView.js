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

const KIND_RANK = { ocean: 0, sea: 1, gulf: 2, strait: 3, approach: 4 };
export const SEA_FONT_PX = (z) => (z.kind === 'ocean' ? 14 : 10);

/**
 * Nomi che restano senza sovrapporsi (precedenza: oceani, mari, golfi, stretti; a parità le zone più grandi).
 * `toScreen(z)` dà [x, y] in pixel dello schermo; fuori da `view` ({w, h}) il nome si scarta.
 */
export function declutterSea(zones, toScreen, view) {
  const ordered = [...zones].sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || (b.areaKm2 ?? 0) - (a.areaKm2 ?? 0));
  const kept = [];
  const rects = [];
  for (const z of ordered) {
    const [x, y] = toScreen(z);
    const f = SEA_FONT_PX(z);
    const w = z.name.length * f * 0.5;
    const h = f * 1.25;
    if (x + w / 2 < 0 || x - w / 2 > view.w || y + h / 2 < 0 || y - h / 2 > view.h) continue;
    const r = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    if (rects.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    rects.push(r);
    kept.push({ z, x, y });
  }
  return kept;
}
