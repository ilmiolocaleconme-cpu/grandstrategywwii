// Etichette incastrate nella forma: calcola dove mettere un nome e con che corpo perché il testo
// stia dentro il poligono (provincia o lago). Funzioni pure in unità di mappa, senza React né proiezione:
// i poligoni arrivano già proiettati. Testate in tests/labelfit.test.js.

export const CHAR_W = 0.66; // larghezza media di un carattere in maiuscolo serif spaziato, in em (la mappa forza questa larghezza con textLength)
export const TEXT_H = 0.9; // altezza della riga usata per l'ingombro, in em (maiuscole e discendenti)
export const LINE_STEP = 1.0; // distanza fra le righe di un nome su più righe, in em

// Un poligono = elenco di anelli [[x,y],...] (il primo è l'esterno, gli altri sono isole/buchi); regola pari-dispari.
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function segDist2(px, py, ax, ay, bx, by) {
  let x = ax;
  let y = ay;
  let dx = bx - x;
  let dy = by - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

// Distanza dal bordo (positiva dentro, negativa fuori).
function signedDist(x, y, rings) {
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const d = segDist2(x, y, ring[i][0], ring[i][1], ring[j][0], ring[j][1]);
      if (d < min) min = d;
    }
  }
  const d = Math.sqrt(min);
  return pointInRings(x, y, rings) ? d : -d;
}

function ringSignedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) a += (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]);
  return a / 2;
}

/** Polo di inaccessibilità: il punto più lontano dal bordo (algoritmo polylabel). Ritorna {x, y, d}. */
export function poleOfInaccessibility(rings, precision) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rings[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX;
  const hgt = maxY - minY;
  const cellSize = Math.min(w, hgt);
  if (cellSize === 0) return { x: minX, y: minY, d: 0 };
  const prec = precision ?? cellSize * 0.02;
  const mk = (x, y, h) => {
    const d = signedDist(x, y, rings);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  let h = cellSize / 2;
  const queue = [];
  for (let x = minX; x < maxX; x += cellSize) for (let y = minY; y < maxY; y += cellSize) queue.push(mk(x + h, y + h, h));
  let best = mk(minX + w / 2, minY + hgt / 2, 0);
  // baricentro come primo candidato
  let a = 0;
  let cx = 0;
  let cy = 0;
  const ring = rings[0];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const f = ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
    cx += (ring[i][0] + ring[j][0]) * f;
    cy += (ring[i][1] + ring[j][1]) * f;
    a += f * 3;
  }
  if (a !== 0) {
    const c = mk(cx / a, cy / a, 0);
    if (c.d > best.d) best = c;
  }
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i += 1) if (queue[i].max > queue[bi].max) bi = i;
    const cell = queue[bi];
    queue[bi] = queue[queue.length - 1];
    queue.pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= prec) continue;
    h = cell.h / 2;
    queue.push(mk(cell.x - h, cell.y - h, h), mk(cell.x + h, cell.y - h, h), mk(cell.x - h, cell.y + h, h), mk(cell.x + h, cell.y + h, h));
  }
  return { x: best.x, y: best.y, d: best.d };
}

// Distanza dal punto al bordo lungo la direzione (dx,dy) unitaria, in avanti e indietro.
function rayExtent(x, y, dx, dy, rings) {
  let tp = Infinity;
  let tn = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const ex = ring[i][0] - ring[j][0];
      const ey = ring[i][1] - ring[j][1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-14) continue;
      const qx = ring[j][0] - x;
      const qy = ring[j][1] - y;
      const t = (qx * ey - qy * ex) / den;
      const s = (qx * dy - qy * dx) / den;
      if (s < 0 || s > 1) continue;
      if (t > 1e-12 && t < tp) tp = t;
      else if (t < -1e-12 && -t < tn) tn = -t;
    }
  }
  return { tp, tn };
}

// Il rettangolo del testo (allargato del 3 %) deve stare dentro il poligono: punti campionati sul perimetro e
// sull'interno, e nessun vertice del poligono (spigoli, isole sottili) dentro il rettangolo.
export function textRectOk(x, y, angle, wUnits, hUnits, rings) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hw = (wUnits * 1.03) / 2;
  const hh = (hUnits * 1.03) / 2;
  const at = (u, v) => pointInRings(x + c * u - s * v, y + s * u + c * v, rings);
  // punti dei due bordi lunghi e della mezzeria; i vertici del poligono dentro il rettangolo (sotto) coprono spigoli e isole
  const N = 12;
  for (let i = 0; i <= N; i += 1) {
    const u = -hw + ((2 * hw) * i) / N;
    if (!at(u, -hh) || !at(u, hh) || !at(u, 0)) return false;
  }
  for (const ring of rings) {
    for (const [px, py] of ring) {
      const dx = px - x;
      const dy = py - y;
      const u = c * dx + s * dy;
      const v = -s * dx + c * dy;
      if (Math.abs(u) < hw && Math.abs(v) < hh) return false;
    }
  }
  return true;
}

// Asse maggiore del poligono (momenti del secondo ordine). Ritorna {angle (rad, in (-pi/2, pi/2]), elongation}.
export function principalAxis(ring) {
  let A = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    A += f;
    sx += (x0 + x1) * f;
    sy += (y0 + y1) * f;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * f;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * f;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * f;
  }
  if (Math.abs(A) < 1e-12) return { angle: 0, elongation: 1 };
  const area = A / 2;
  const cx = sx / (6 * area);
  const cy = sy / (6 * area);
  const cxx = sxx / (12 * area) - cx * cx;
  const cyy = syy / (12 * area) - cy * cy;
  const cxy = sxy / (24 * area) - cx * cy;
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(tr / 2 - disc, 1e-12);
  return { angle: 0.5 * Math.atan2(2 * cxy, cxx - cyy), elongation: Math.sqrt(l1 / l2) };
}

function bestSizeAt(x, y, angle, len, rings, charW, hEm = TEXT_H) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const along = rayExtent(x, y, c, s, rings);
  const across = rayExtent(x, y, -s, c, rings);
  const halfW = Math.min(along.tp, along.tn);
  const halfH = Math.min(across.tp, across.tn);
  if (!Number.isFinite(halfW) || !Number.isFinite(halfH) || halfW <= 0 || halfH <= 0) return { size: 0, span: 0 };
  let hi = Math.min((2 * halfW) / (len * charW), (2 * halfH) / hEm) * 1.02;
  let lo = 0;
  for (let k = 0; k < 9; k += 1) {
    const mid = (lo + hi) / 2;
    if (textRectOk(x, y, angle, len * charW * mid, hEm * mid, rings)) lo = mid;
    else hi = mid;
  }
  return { size: lo, span: along.tp + along.tn };
}

/**
 * Posizione, angolo e corpo del testo `len` caratteri (corpo in unità di mappa) perché stia dentro il poligono.
 * `rings`: anelli proiettati del poligono principale. Prova la posizione del polo e due spostamenti lungo il testo,
 * in orizzontale e, per le forme allungate, lungo l'asse maggiore (si sceglie la rotazione solo se dà un corpo
 * almeno 25 % più grande). Ritorna {x, y, angle (gradi), size} oppure null se non entra niente.
 */
export function fitLabel(rings, len, opts = {}) {
  const { maxAngleDeg = 75, minElongation = 1.6, charW = CHAR_W, lines = 1 } = opts;
  const hEm = TEXT_H + (Math.max(1, lines) - 1) * LINE_STEP; // altezza del blocco di testo in em (`len` = riga più lunga)
  if (!rings?.length || rings[0].length < 4 || len <= 0) return null;
  const pole = poleOfInaccessibility(rings);
  if (!(pole.d > 0)) return null;
  const candidates = [0];
  const axis = principalAxis(rings[0]);
  const deg = (axis.angle * 180) / Math.PI;
  if (axis.elongation >= minElongation && Math.abs(deg) > 6 && Math.abs(deg) <= maxAngleDeg) candidates.push(axis.angle);
  let best = null;
  for (const angle of candidates) {
    let local = null;
    const first = bestSizeAt(pole.x, pole.y, angle, len, rings, charW, hEm);
    local = { x: pole.x, y: pole.y, angle, size: first.size };
    for (const shift of [-0.3, 0.3]) {
      const x = pole.x + Math.cos(angle) * first.span * shift;
      const y = pole.y + Math.sin(angle) * first.span * shift;
      if (!pointInRings(x, y, rings)) continue;
      const r = bestSizeAt(x, y, angle, len, rings, charW, hEm);
      if (r.size > local.size) local = { x, y, angle, size: r.size };
    }
    if (!best || (angle !== 0 && local.size > best.size * 1.25) || (angle === 0 && !best)) best = local;
  }
  if (!best || best.size <= 0) return null;
  return { x: best.x, y: best.y, angle: (best.angle * 180) / Math.PI, size: best.size };
}

// Poligono principale (anello esterno più esteso) di una lista di poligoni proiettati.
export function mainPolygon(polys) {
  let best = null;
  let bestArea = -1;
  for (const poly of polys) {
    const a = Math.abs(ringSignedArea(poly[0]));
    if (a > bestArea) {
      bestArea = a;
      best = poly;
    }
  }
  return best;
}


const CONNECTIVES = new Set(['e', 'ed', 'di', 'de', 'del', 'della', 'dei', 'delle', 'da', 'of', 'and', 'the', 'la', 'le', 'el', 'y', 'i', 'et', 'und', 'og', 'och', 'kai', 'bei', 'am', 'an', 'der', 'den']);

/**
 * Divide un nome lungo in due righe bilanciate, spezzando a spazi, trattini e virgole. Ritorna [riga1, riga2] oppure
 * null se non c'è un punto di rottura sensato (una sola parola, o una riga resterebbe troppo corta).
 */
export function splitName(name) {
  const text = String(name).trim();
  if (text.length < 9) return null;
  let best = null;
  for (let i = 1; i < text.length - 1; i += 1) {
    const ch = text[i];
    if (ch !== ' ' && ch !== '-' && ch !== ',') continue;
    const cut = ch === ' ' ? i : i + 1; // il trattino e la virgola restano sulla prima riga
    const a = text.slice(0, cut).trim().replace(/,$/, ',');
    const b = text.slice(cut).trim();
    if (a.length < 3 || b.length < 3) continue;
    const longest = Math.max(a.length, b.length);
    if (!best || longest < best.longest) best = { lines: [a, b], longest };
  }
  return best ? best.lines : null;
}

/**
 * Sigla o nome breve quando il nome intero non entra. `explicit` (campo `short` dei dati) ha la precedenza; altrimenti
 * iniziali delle parole significative (3+ parole o composti) o, per una parola sola, le prime 4 lettere con il punto.
 * Ritorna null se la forma breve non è più corta del nome.
 */
export function shortName(name, explicit) {
  const full = String(name).trim();
  if (explicit && String(explicit).trim() && String(explicit).trim().length < full.length) return String(explicit).trim();
  const words = full.replace(/\([^)]*\)/g, ' ').split(/[\s,\-–/]+/).filter((w) => w && !CONNECTIVES.has(w.toLowerCase()));
  let out;
  if (words.length >= 2) out = words.map((w) => w[0]).join('');
  else if (words.length === 1 && words[0].length > 5) out = `${words[0].slice(0, 4)}.`;
  else return null;
  return out.length < full.length ? out : null;
}

// Parole significative di un nome (senza collegamenti come "e", "di", "kai"), spezzate anche a trattino.
function significantWords(name) {
  return String(name).replace(/\([^)]*\)/g, ' ').split(/[\s,\-–/]+/).filter((w) => w && !CONNECTIVES.has(w.toLowerCase()));
}

// Due livelli di sigla, ognuno con i suoi candidati dal più semplice al più esplicito:
//  - esplicita (leggibile): iniziali + inizio dell'ultima parola ("P.Sav"), o prime lettere con il punto ("Jämt.");
//  - compatta (poco spazio): solo iniziali ("PS", "AMT").
function shortLevels(name) {
  const w = significantWords(name);
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const explicit = [];
  const compact = [];
  if (w.length >= 2) {
    const last = w[w.length - 1];
    const init = w.slice(0, -1).map((x) => x[0]).join('').toUpperCase();
    for (const n of [3, 4]) explicit.push(`${init}.${cap(last.slice(0, n))}`); // "P.Sav"
    explicit.push(`${cap(w[0].slice(0, 3))}.${cap(last.slice(0, 3))}`); // "Poh.Sav"
    explicit.push(cap(last)); // l'ultima parola da sola: di solito è quella che distingue
    compact.push(w.map((x) => x[0]).join('').toUpperCase()); // "PS"
  } else if (w.length === 1 && w[0].length > 5) {
    for (let n = 4; n < w[0].length - 1; n += 1) explicit.push(`${cap(w[0].slice(0, n))}.`); // "Jämt.", "Jämtl."
  }
  return { explicit, compact };
}

/**
 * Assegna a ogni elemento fino a due sigle, ordinate dalla più esplicita alla più compatta, ciascuna unica nel suo
 * gruppo (di solito la nazione) e nel proprio livello. Il campo `short` dei dati ha la precedenza e viene riservato per
 * primo (resta l'unica sigla di quell'elemento); gli altri scorrono i candidati e prendono il primo non ancora usato
 * nel gruppo, dalle province più grandi (che ricevono le sigle più semplici). Una sigla non più corta del nome non si
 * assegna; senza candidato libero l'elemento resta senza sigla di quel livello: meglio nessun nome che uno ambiguo.
 * `entries`: [{ id, name, group, area, explicit }]. Ritorna Map id -> [sigla, ...] (anche vuota se non c'è nulla).
 */
export function assignShortNames(entries) {
  const used = new Map(); // `${gruppo}|${livello}` -> Set di sigle (maiuscole)
  const taken = (g, lvl) => { const k = `${g}|${lvl}`; if (!used.has(k)) used.set(k, new Set()); return used.get(k); };
  const out = new Map();
  for (const e of entries) {
    const x = e.explicit && String(e.explicit).trim();
    if (!x) continue;
    out.set(e.id, [x]);
    taken(e.group, 'explicit').add(x.toUpperCase());
    taken(e.group, 'compact').add(x.toUpperCase());
  }
  for (const e of [...entries].sort((a, b) => (b.area ?? 0) - (a.area ?? 0) || String(a.id).localeCompare(String(b.id)))) {
    if (out.has(e.id)) continue;
    const full = String(e.name).trim();
    const lv = shortLevels(full);
    const picks = [];
    for (const [lvl, cands] of [['explicit', lv.explicit], ['compact', lv.compact]]) {
      const set = taken(e.group, lvl);
      const pick = cands.find((c) => c.length < full.length && !set.has(c.toUpperCase()));
      if (!pick) continue;
      set.add(pick.toUpperCase());
      if (!picks.some((q) => q.toUpperCase() === pick.toUpperCase())) picks.push(pick);
    }
    out.set(e.id, picks);
  }
  return out;
}
