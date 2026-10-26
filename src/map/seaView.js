// Logica pura delle zone marittime per la mappa (selezione per punto, righe dei nomi).
// Niente React né Canvas: si prova con node (tests/seaview.test.js). La posizione dei nomi è in data/labels.json.

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
    if (lat < y0 || lat > y1) continue;
    // le zone a cavallo dell'antimeridiano hanno longitudini oltre ±180: si prova anche il punto spostato di un giro
    for (const dx of [0, -360, 360]) {
      const x = lon + dx;
      if (x < x0 || x > x1) continue;
      if (insideRings(z.rings, x, lat)) return z;
    }
  }
  return null;
}


const SEA_MAX_CHARS = 16; // lunghezza desiderata di una riga
const SEA_MAX_LINES = 3;

/** Divide il nome in al massimo 3 righe (solo a spazio) minimizzando la riga più lunga; sceglie il minor numero di righe che sta in `maxChars`. */
export function seaLabelLines(name, maxChars = SEA_MAX_CHARS) {
  const words = name.split(/\s+/).filter(Boolean);
  if (name.length <= maxChars || words.length < 2) return [name];
  let best = [name];
  for (let n = 2; n <= Math.min(SEA_MAX_LINES, words.length); n += 1) {
    let cand = null;
    let candMax = Infinity;
    const walk = (from, left, acc) => {
      if (left === 1) {
        const line = words.slice(from).join(' ');
        const lines = [...acc, line];
        const m = Math.max(...lines.map((l) => l.length));
        if (m < candMax) { candMax = m; cand = lines; }
        return;
      }
      for (let to = from + 1; to <= words.length - (left - 1); to += 1) walk(to, left - 1, [...acc, words.slice(from, to).join(' ')]);
    };
    walk(0, n, []);
    best = cand;
    if (candMax <= maxChars) break;
  }
  return best;
}
