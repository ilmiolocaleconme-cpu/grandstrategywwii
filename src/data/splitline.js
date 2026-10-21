// Divisione di un poligono lungo le linee (fiumi) che lo attraversano, sul piano lon/lat, senza dipendenze.
// Serve agli script di preparazione dei dati (scripts/build-cities.js), non al gioco in esecuzione.
//
// Metodo: ogni linea si ritaglia sul poligono; i tratti interni che partono e finiscono sul bordo (o che finiscono
// su un taglio già fatto: affluenti) sono "corde". Una corda spezza l'anello in due: i vertici della corda sono
// condivisi dai due pezzi (nessuna fessura). Si ripete sui pezzi finché nessuna linea ne spezza altri; i tratti
// che restano nel vuoto (fiume che nasce o finisce dentro la città) non dividono nulla.
// Un pezzo più piccolo di `minAreaKm2` non si crea: la corda viene scartata (niente strisce sottili).
// Limite noto: le corde che toccano un buco del poligono non dividono; le linee sono trattate come semplici.
import { pointInPolygon, signedArea } from './polyclip.js';

const KM_PER_DEG = 111.195;

function open(ring) {
  const out = ring.map((p) => [p[0], p[1]]);
  if (out.length > 1) {
    const f = out[0];
    const l = out[out.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) out.pop();
  }
  return out;
}
const closed = (ring) => [...ring, ring[0]];

/** Area approssimata in km2 di un anello (piano locale: lon x cos(lat)). */
export function ringKm2(ring) {
  let lat = 0;
  for (const p of ring) lat += p[1];
  lat /= ring.length || 1;
  const c = Math.cos((lat * Math.PI) / 180);
  return Math.abs(signedArea(ring.map(([x, y]) => [x * c, y]))) * KM_PER_DEG * KM_PER_DEG;
}

function segIntersection(a, b, c, d) {
  const r0 = b[0] - a[0];
  const r1 = b[1] - a[1];
  const s0 = d[0] - c[0];
  const s1 = d[1] - c[1];
  const den = r0 * s1 - r1 * s0;
  if (den === 0) return null;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

/** Punto dell'anello più vicino a p: { i (lato i -> i+1), q, d }. */
function nearestOnRing(ring, p) {
  let best = null;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = { i, q, d };
  }
  return best;
}

/** Inserisce nell'anello il punto q sul lato i (o riusa il vertice se è a meno di `vtol`). Restituisce { ring, index }. */
function insertOnRing(ring, loc, vtol) {
  const a = ring[loc.i];
  const b = ring[(loc.i + 1) % ring.length];
  if (Math.hypot(loc.q[0] - a[0], loc.q[1] - a[1]) <= vtol) return { ring, index: loc.i };
  if (Math.hypot(loc.q[0] - b[0], loc.q[1] - b[1]) <= vtol) return { ring, index: (loc.i + 1) % ring.length };
  const next = [...ring.slice(0, loc.i + 1), [loc.q[0], loc.q[1]], ...ring.slice(loc.i + 1)];
  return { ring: next, index: loc.i + 1 };
}

const bboxOf = (pts) => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};

/** Tratti della linea dentro il pezzo (a distanza dal bordo > bTol): [{ pts, startB, endB }]; B = l'estremo è un incrocio col bordo. */
function clipLine(line, piece, bTol) {
  const rings = [piece.ring, ...piece.holes];
  const inside = (m) => pointInPolygon(m[0], m[1], rings) && nearestOnRing(piece.ring, m).d > bTol && piece.holes.every((h) => nearestOnRing(h, m).d > bTol);
  const chords = [];
  let run = null;
  for (let s = 0; s + 1 < line.length; s += 1) {
    const a = line[s];
    const b = line[s + 1];
    const ts = [0, 1];
    for (const r of rings) {
      for (let i = 0; i < r.length; i += 1) {
        const t = segIntersection(a, b, r[i], r[(i + 1) % r.length]);
        if (t !== null) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const at = (t) => (t === 0 ? a : t === 1 ? b : [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    for (let k = 0; k + 1 < ts.length; k += 1) {
      if (ts[k + 1] - ts[k] < 1e-12) continue;
      const p = at(ts[k]);
      const q = at(ts[k + 1]);
      const ins = inside([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
      if (ins) {
        if (!run) run = { pts: [p], startB: !(s === 0 && k === 0) }; // se la linea nasce dentro, l'estremo è libero
        run.pts.push(q);
      } else if (run) {
        run.endB = true;
        chords.push(run);
        run = null;
      }
    }
  }
  if (run) { run.endB = false; chords.push(run); }
  return chords;
}

function trySplit(piece, chord, opts) {
  const { snap, vtol, minAreaKm2 } = opts;
  if (chord.pts.length < 2) return null;
  const first = chord.pts[0];
  const last = chord.pts[chord.pts.length - 1];
  let ring = piece.ring;
  const l0 = nearestOnRing(ring, first);
  if (l0.d > (chord.startB ? 1e-4 : snap)) return null;
  let ins = insertOnRing(ring, l0, vtol);
  ring = ins.ring;
  let i0 = ins.index;
  const l1 = nearestOnRing(ring, last);
  if (l1.d > (chord.endB ? 1e-4 : snap)) return null;
  const before = ring.length;
  ins = insertOnRing(ring, l1, vtol);
  ring = ins.ring;
  const i1 = ins.index;
  if (ring.length > before && i1 <= i0) i0 += 1;
  if (i0 === i1) return null;
  const mid = chord.pts.slice(1, -1);
  const n = ring.length;
  const walk = (from, to) => {
    const out = [];
    for (let i = from; ; i = (i + 1) % n) { out.push(ring[i]); if (i === to) break; }
    return out;
  };
  const A = [...walk(i0, i1), ...[...mid].reverse()];
  const B = [...walk(i1, i0), ...mid];
  if (A.length < 3 || B.length < 3) return null;
  if (ringKm2(A) < minAreaKm2 || ringKm2(B) < minAreaKm2) return null;
  const holesFor = (r) => piece.holes.filter((h) => pointInPolygon(h[0][0], h[0][1], [r]));
  return [{ ring: A, holes: holesFor(A) }, { ring: B, holes: holesFor(B) }];
}

/**
 * Divide un poligono [esterno, ...buchi] (anelli chiusi o no, lon/lat) con le linee `lines` ([[lon, lat], ...]).
 * Restituisce un elenco di poligoni [esterno, ...buchi] (anelli chiusi). Senza corde valide restituisce il poligono stesso.
 * opts: minAreaKm2 (default 3), snap (gradi, aggancio degli estremi liberi al bordo o a un taglio, default 4e-4).
 */
export function splitPolygon(polygon, lines, opts = {}) {
  const o = { minAreaKm2: 3, snap: 4e-4, vtol: 1e-7, bTol: 2e-5, ...opts };
  let outer = open(polygon[0]);
  if (signedArea(outer) < 0) outer = outer.reverse();
  let pieces = [{ ring: outer, holes: polygon.slice(1).map(open) }];
  const bb = bboxOf(outer);
  const near = lines.filter((l) => {
    const b = bboxOf(l);
    return !(b[2] < bb[0] || b[0] > bb[2] || b[3] < bb[1] || b[1] > bb[3]);
  });
  let progress = true;
  for (let guard = 0; progress && guard < 200; guard += 1) {
    progress = false;
    for (let pi = 0; pi < pieces.length && !progress; pi += 1) {
      for (const line of near) {
        const chords = clipLine(line, pieces[pi], o.bTol)
          .sort((x, y) => (Number(y.startB) + Number(y.endB)) - (Number(x.startB) + Number(x.endB)));
        for (const ch of chords) {
          const res = trySplit(pieces[pi], ch, o);
          if (res) { pieces = [...pieces.slice(0, pi), ...res, ...pieces.slice(pi + 1)]; progress = true; break; }
        }
        if (progress) break;
      }
    }
  }
  return pieces.map((p) => [closed(p.ring), ...p.holes.map(closed)]);
}
