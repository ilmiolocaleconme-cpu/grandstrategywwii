// Intersezione di due poligoni (con buchi) sul piano lon/lat, senza dipendenze.
// Serve agli script di preparazione dei dati (es. scripts/build-cities.js), non al gioco in esecuzione.
//
// Metodo: si calcolano i punti in cui i contorni si incrociano, si spezzano gli anelli in quei punti e si tengono
// i tratti di un poligono che stanno dentro l'altro; poi si ricompongono gli anelli. I vertici originali restano
// invariati, quindi un ritaglio su una provincia riusa i suoi stessi vertici (confini condivisi, senza fessure).
// Lati identici (stessi due vertici) fra i due poligoni sono riconosciuti e gestiti; sovrapposizioni parziali di lati
// collineari con vertici diversi non sono gestite in modo speciale.

const KEY_DIGITS = 9;
const nodeKey = (p) => `${p[0].toFixed(KEY_DIGITS)},${p[1].toFixed(KEY_DIGITS)}`;

/** Area con segno di un anello (positiva se antiorario). */
export function signedArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function cleanRing(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0], p[1]]);
  }
  if (out.length > 1) {
    const f = out[0];
    const l = out[out.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) out.pop();
  }
  return out;
}

/** Anelli normalizzati: esterno antiorario, buchi orari. `polygon` = [esterno, ...buchi], anelli chiusi o no. */
function normalize(polygon) {
  return polygon
    .map(cleanRing)
    .filter((r) => r.length >= 3)
    .map((r, i) => {
      const ccw = signedArea(r) > 0;
      return (i === 0) === ccw ? r : [...r].reverse();
    });
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punto dentro il poligono (anello esterno meno i buchi). */
export function pointInPolygon(x, y, rings) {
  let n = 0;
  for (const r of rings) if (inRing(x, y, r)) n += 1;
  return n % 2 === 1;
}

function bboxOf(ring) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function segmentIntersection(a, b, c, d) {
  const r0 = b[0] - a[0];
  const r1 = b[1] - a[1];
  const s0 = d[0] - c[0];
  const s1 = d[1] - c[1];
  const den = r0 * s1 - r1 * s0;
  if (den === 0) return null; // paralleli o collineari
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/**
 * Intersezione di due poligoni. Ogni poligono è [anelloEsterno, ...buchi] con punti [lon, lat].
 * Restituisce un elenco di poligoni [[esterno, ...buchi], ...] (anelli chiusi, esterno antiorario, buchi orari).
 */
export function intersect(subject, clip) {
  const S = normalize(subject);
  const C = normalize(clip);
  if (!S.length || !C.length) return [];
  const sb = bboxOf(S[0]);
  const cb = bboxOf(C[0]);
  if (sb[2] < cb[0] || cb[2] < sb[0] || sb[3] < cb[1] || cb[3] < sb[1]) return [];

  // punti aggiuntivi su ogni lato: lati[anello][indice] = [{t, p}]
  const extra = (rings) => rings.map((r) => r.map(() => []));
  const sExtra = extra(S);
  const cExtra = extra(C);
  const margin = 1e-12;
  const x0 = Math.max(sb[0], cb[0]) - margin;
  const y0 = Math.max(sb[1], cb[1]) - margin;
  const x1 = Math.min(sb[2], cb[2]) + margin;
  const y1 = Math.min(sb[3], cb[3]) + margin;

  // solo i lati dell'altro poligono che cadono nella zona comune
  const candidates = [];
  C.forEach((r, ri) => {
    for (let i = 0; i < r.length; i += 1) {
      const p = r[i];
      const q = r[(i + 1) % r.length];
      if (Math.max(p[0], q[0]) < x0 || Math.min(p[0], q[0]) > x1 || Math.max(p[1], q[1]) < y0 || Math.min(p[1], q[1]) > y1) continue;
      candidates.push([ri, i, p, q]);
    }
  });
  S.forEach((r, ri) => {
    for (let i = 0; i < r.length; i += 1) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < y0 || Math.min(a[1], b[1]) > y1) continue;
      for (const [cri, ci, c, d] of candidates) {
        if (Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.min(c[0], d[0]) > Math.max(a[0], b[0])
          || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) || Math.min(c[1], d[1]) > Math.max(a[1], b[1])) continue;
        const hit = segmentIntersection(a, b, c, d);
        if (!hit) continue;
        const { t, u } = hit;
        // incrocio su un vertice: si usa il vertice esistente, non un punto nuovo
        const eps = 1e-12;
        let p;
        if (t < eps) p = a;
        else if (t > 1 - eps) p = b;
        else if (u < eps) p = c;
        else if (u > 1 - eps) p = d;
        else p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        sExtra[ri][i].push({ t, p });
        cExtra[cri][ci].push({ t: u, p });
      }
    }
  });

  // anelli spezzati in nodi, poi lati orientati
  const split = (rings, ex) => rings.map((r, ri) => {
    const nodes = [];
    for (let i = 0; i < r.length; i += 1) {
      nodes.push(r[i]);
      const list = ex[ri][i].filter((e) => e.t > 0 && e.t < 1).sort((m, n) => m.t - n.t);
      for (const e of list) {
        const last = nodes[nodes.length - 1];
        if (nodeKey(last) !== nodeKey(e.p)) nodes.push(e.p);
      }
    }
    // eventuale duplicato di chiusura
    if (nodes.length > 1 && nodeKey(nodes[0]) === nodeKey(nodes[nodes.length - 1])) nodes.pop();
    return nodes;
  });
  const sNodes = split(S, sExtra);
  const cNodes = split(C, cExtra);

  // lati orientati dei due poligoni, per riconoscere quelli identici (stessi due vertici)
  const listEdges = (rings) => {
    const list = [];
    for (const nodes of rings) {
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        const b = nodes[(i + 1) % nodes.length];
        const ka = nodeKey(a);
        const kb = nodeKey(b);
        if (ka !== kb) list.push({ a, b, ka, kb, used: false });
      }
    }
    return list;
  };
  const sEdges = listEdges(sNodes);
  const cEdges = listEdges(cNodes);
  const cDirected = new Set(cEdges.map((e) => `${e.ka}>${e.kb}`));
  const sDirected = new Set(sEdges.map((e) => `${e.ka}>${e.kb}`));

  const edges = [];
  for (const e of sEdges) {
    if (cDirected.has(`${e.kb}>${e.ka}`)) continue; // lato in comune con verso opposto: i poligoni si toccano soltanto
    if (cDirected.has(`${e.ka}>${e.kb}`)) { edges.push(e); continue; } // lato in comune con lo stesso verso: se ne tiene uno
    if (pointInPolygon((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, C)) edges.push(e);
  }
  for (const e of cEdges) {
    if (sDirected.has(`${e.kb}>${e.ka}`) || sDirected.has(`${e.ka}>${e.kb}`)) continue; // già deciso sopra
    if (pointInPolygon((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, S)) edges.push(e);
  }

  const out = new Map();
  for (const e of edges) {
    if (!out.has(e.ka)) out.set(e.ka, []);
    out.get(e.ka).push(e);
  }
  const turn = (e, f) => { // angolo orario da e a f (0 = prosegue dritto, più grande = più a destra)
    const a1 = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
    const a2 = Math.atan2(f.b[1] - f.a[1], f.b[0] - f.a[0]);
    let d = a1 - a2;
    while (d < -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    return d;
  };

  const rings = [];
  for (const start of edges) {
    if (start.used) continue;
    const ring = [];
    let e = start;
    let guard = 0;
    while (e && !e.used && guard < edges.length + 2) {
      e.used = true;
      ring.push(e.a);
      const next = (out.get(e.kb) ?? []).filter((f) => !f.used || f === start);
      if (!next.length) { e = null; break; }
      e = next.length === 1 ? next[0] : next.reduce((best, f) => (turn(e, f) > turn(e, best) ? f : best));
      guard += 1;
      if (e === start) break;
    }
    if (e === start && ring.length >= 3) rings.push(ring);
  }

  const outers = [];
  const holes = [];
  for (const r of rings) {
    const a = signedArea(r);
    if (Math.abs(a) < 1e-18) continue;
    (a > 0 ? outers : holes).push(r);
  }
  const polygons = outers.map((r) => [[...r, r[0]]]);
  const areas = outers.map(signedArea);
  for (const h of holes) {
    let best = -1;
    outers.forEach((o, i) => {
      if (inRing(h[0][0], h[0][1], o) && (best < 0 || areas[i] < areas[best])) best = i;
    });
    if (best >= 0) polygons[best].push([...h, h[0]]);
  }
  return polygons;
}

/** Area di un poligono [esterno, ...buchi] nelle stesse unità al quadrato delle coordinate. */
export function polygonArea(polygon) {
  return polygon.reduce((s, r, i) => s + (i === 0 ? 1 : -1) * Math.abs(signedArea(r)), 0);
}
