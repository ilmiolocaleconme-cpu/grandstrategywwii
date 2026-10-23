// Divide in 3 province ciascuna delle 17 regioni italiane che oggi hanno UNA sola provincia (decisione 23/10/2026).
// Restano come sono: Sicilia (9 province), Zara e Dodecaneso.
// Metodo (ipotesi dichiarata, non storica):
//  1. le «province vere» sono quelle moderne di Natural Earth 10m admin-1 v5.1.1 (dominio pubblico) che cadono nella regione;
//  2. si raggruppano in 3 gruppi contigui di area simile (crescita da 3 semi lontani fra loro); il confine fra due gruppi è una
//     catena di lati veri (non una retta);
//  3. il poligono esistente (OpenHistoricalMap) NON si sostituisce: si taglia lungo quelle catene (splitPolygon) e i pezzi
//     restano con i vertici in comune, quindi il contorno regionale e le sponde dei fiumi restano identici;
//  4. dove la regione ha solo 2 province moderne (Umbria, Lucania, Trentino-Alto Adige) la più grande si taglia a metà con una
//     linea CURVA (sinusoide irregolare), cercata in modo che le due metà abbiano la stessa area: confine inventato.
//  5. Venezia Giulia: i gruppi sono scelti a mano (Gorizia, Trieste, Pola) perché le unità slovene e croate non condividono i
//     lati con quelle italiane.
// Ingresso: ne_10m_admin_1_states_provinces.geojson (non nel repository):
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector ne && git -C ne sparse-checkout set geojson
//   node scripts/build-italy-split.js <cartella ne/geojson>      (oppure NE_DIR=<cartella>)
// Scrive data/provinces/ITA.json e aggiorna `parentProvince` delle città in data/sources/citta_base.json. Idempotente: se le
// 17 regioni sono già divise non fa nulla. Dopo: node scripts/build-cities.js, npm run build:terrain (e gli altri build:*).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pointInPolygon } from '../src/data/polyclip.js';
import { ringKm2, splitPolygon } from '../src/data/splitline.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

/** Le 17 regioni da dividere: id della provincia madre attuale e codice del sottogruppo di cui si occupa. */
export const REGIONS = Object.freeze([
  { mother: 'P_ITA_PIEDMONT', name: 'Piemonte' },
  { mother: 'P_ITA_LIGURIA', name: 'Liguria' },
  { mother: 'P_ITA_LOMBARDY', name: 'Lombardia' },
  { mother: 'P_ITA_TRIDENTINE_VENETIA', name: 'Venezia Tridentina', curve: true },
  { mother: 'P_ITA_VENETO', name: 'Veneto' },
  { mother: 'P_ITA_JULIAN_MARCH', name: 'Venezia Giulia', manual: true },
  { mother: 'P_ITA_EMILIA', name: 'Emilia' },
  { mother: 'P_ITA_TUSCANY', name: 'Toscana' },
  { mother: 'P_ITA_MARCHE', name: 'Marche' },
  { mother: 'P_ITA_UMBRIA', name: 'Umbria', curve: true },
  { mother: 'P_ITA_LAZIO', name: 'Lazio' },
  { mother: 'P_ITA_ABRUZZI_E_MOLISE', name: 'Abruzzi e Molise' },
  { mother: 'P_ITA_CAMPANIA', name: 'Campania' },
  { mother: 'P_ITA_APULIA', name: 'Puglia' },
  { mother: 'P_ITA_LUCANIA', name: 'Lucania', curve: true },
  { mother: 'P_ITA_CALABRIA', name: 'Calabria' },
  { mother: 'P_ITA_SARDINIA', name: 'Sardegna' },
]);

/** Nomi italiani delle unità di Natural Earth che hanno un nome inglese, tedesco o sbagliato. */
export const ITALIAN_NAME = Object.freeze({
  Turin: 'Torino', Aoste: 'Aosta', Bozen: 'Bolzano', Crotene: 'Crotone', Oristrano: 'Oristano', Istarska: 'Pola',
});

/** Venezia Giulia: gruppi scelti a mano (nome del gruppo → nomi delle unità di Natural Earth). */
export const JULIAN_GROUPS = Object.freeze({
  Gorizia: ['Gorizia', 'Bovec', 'Kobarid', 'Tolmin', 'Kanal', 'Brda', 'Nova Goriška', 'Šempeter-Vrtojba', 'Miren-Kostanjevica', 'Cerkno', 'Idrija', 'Ajdovščina', 'Vipava', 'Komen'],
  Trieste: ['Trieste', 'Sežana', 'Hrpelje-Kozina', 'Koper', 'Piran', 'Izola', 'Divaca', 'Postojna', 'Pivka', 'Ilirska Bistrica'],
  Pola: ['Istarska'],
});

const EXT_DEG = 0.03; // le catene si prolungano oltre il contorno regionale per essere certi di attraversarlo
const BRIDGE_DEG = 0.02; // estremi di catene entro questa distanza (confine fra due Stati) si uniscono
// Nessun taglio crea un pezzo sotto questa area (niente schegge: confini che quasi coincidono con un fiume o con la costa).
export const MIN_PIECE_KM2 = 150;

// ---------------------------------------------------------------- geometria di base
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const roundRing = (ring) => ring.map(([x, y]) => [r6(x), r6(y)]);
const roundPoly = (p) => p.map(roundRing);
export const geomOf = (polys) => (polys.length === 1 ? { type: 'Polygon', coordinates: roundPoly(polys[0]) } : { type: 'MultiPolygon', coordinates: polys.map(roundPoly) });
export const polyKm2 = (p) => ringKm2(p[0]) - p.slice(1).reduce((s, h) => s + ringKm2(h), 0);
export const geomKm2 = (g) => polysOf(g).reduce((s, p) => s + polyKm2(p), 0);
/** Area di un insieme di poligoni con UNA latitudine fissa (ringKm2 usa la latitudine media di ogni anello: confronti prima/dopo non esatti). */
export function areaKm2At(polys, lat0) {
  const c = Math.cos((lat0 * Math.PI) / 180);
  const ring = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i += 1) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
  return polys.reduce((s, p) => s + ring(p[0]) - p.slice(1).reduce((t, h) => t + ring(h), 0), 0) * c * 111.195 * 111.195;
}

/** Punto interno di un poligono [esterno, ...buchi]: centro dell'intervallo più largo su una retta orizzontale. */
export function interiorPoint(poly) {
  let y0 = Infinity; let y1 = -Infinity;
  for (const [, y] of poly[0]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  let best = null;
  for (const frac of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = y0 + (y1 - y0) * frac;
    const xs = [];
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const [ax, ay] = ring[i]; const [bx, by] = ring[i + 1];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (!best || w > best.w) best = { w, p: [(xs[i] + xs[i + 1]) / 2, y] };
    }
    if (best && best.w > 1e-6) break;
  }
  return best ? best.p : poly[0][0];
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const distToPolygon = (p, poly) => {
  let d = Infinity;
  for (const ring of poly) for (let i = 0; i < ring.length - 1; i += 1) d = Math.min(d, distToSegment(p, ring[i], ring[i + 1]));
  return d;
};

// ---------------------------------------------------------------- unità di Natural Earth
/** Unità { name, iso, polys, area, c: [lon, lat] (punto interno del poligono maggiore) } delle feature di Natural Earth. */
export function toUnits(neFeatures, places = []) {
  return neFeatures.map((f) => {
    const polys = polysOf(f.geometry);
    let big = polys[0];
    for (const p of polys) if (ringKm2(p[0]) > ringKm2(big[0])) big = p;
    // popolazione = quella del luogo più grande (NE populated places) dentro l'unità: serve a dare al gruppo il nome del suo centro maggiore
    let pop = 0;
    for (const pl of places) if (pl.pop > pop && polys.some((p) => pointInPolygon(pl.x, pl.y, p))) pop = pl.pop;
    return { name: ITALIAN_NAME[f.properties.name] ?? f.properties.name, neName: f.properties.name, iso: f.properties.iso_a2, polys, area: polys.reduce((s, p) => s + polyKm2(p), 0), pop, c: interiorPoint(big) };
  });
}

const containsPoint = (polys, [x, y]) => polys.some((pl) => pointInPolygon(x, y, pl));

/** Unità la cui area interna cade in uno dei poligoni dati (anche di un altro Stato se `anyIso`). */
export function unitsInside(units, regionPolys, { isos = ['IT'], names = null } = {}) {
  return units.filter((u) => (names ? names.includes(u.neName) : isos.includes(u.iso)) && containsPoint(regionPolys, u.c));
}

// ---------------------------------------------------------------- raggruppamento in 3
const edgeKey = (a, b) => {
  const ka = `${a[0].toFixed(6)},${a[1].toFixed(6)}`;
  const kb = `${b[0].toFixed(6)},${b[1].toFixed(6)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

/** Lati con le unità che li possiedono: Map(chiave → { a, b, units: Set(indice) }). */
export function buildEdges(units) {
  const edges = new Map();
  units.forEach((u, ui) => {
    for (const poly of u.polys) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const a = ring[i]; const b = ring[i + 1];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          const k = edgeKey(a, b);
          const e = edges.get(k) ?? edges.set(k, { a, b, units: new Set() }).get(k);
          e.units.add(ui);
        }
      }
    }
  });
  return edges;
}

/** Raggruppa le unità in `k` gruppi contigui di area simile. Ritorna array (per unità) con l'indice del gruppo. */
export function groupUnits(units, edges, k = 3) {
  const n = units.length;
  if (n < k) throw new Error(`servono almeno ${k} unità, ce ne sono ${n}`);
  const adj = Array.from({ length: n }, () => new Set());
  for (const e of edges.values()) {
    const us = [...e.units];
    for (const a of us) for (const b of us) if (a !== b) adj[a].add(b);
  }
  const dist = (i, j) => Math.hypot((units[i].c[0] - units[j].c[0]) * Math.cos((units[i].c[1] * Math.PI) / 180), units[i].c[1] - units[j].c[1]);
  const seeds = [units.reduce((best, u, i) => (u.area > units[best].area ? i : best), 0)];
  while (seeds.length < k) {
    let bi = -1; let bd = -1;
    for (let i = 0; i < n; i += 1) {
      if (seeds.includes(i)) continue;
      const d = Math.min(...seeds.map((s) => dist(i, s)));
      if (d > bd) { bd = d; bi = i; }
    }
    seeds.push(bi);
  }
  const group = new Array(n).fill(-1);
  const total = new Array(k).fill(0);
  seeds.forEach((s, g) => { group[s] = g; total[g] += units[s].area; });
  for (;;) {
    let pick = null;
    const order = [...Array(k).keys()].sort((a, b) => total[a] - total[b]);
    for (const g of order) {
      let cand = null;
      for (let i = 0; i < n; i += 1) {
        if (group[i] !== g) continue;
        for (const j of adj[i]) if (group[j] === -1 && (!cand || dist(j, seeds[g]) < dist(cand, seeds[g]))) cand = j;
      }
      if (cand !== null) { pick = { g, cand }; break; }
    }
    if (!pick) break;
    group[pick.cand] = pick.g;
    total[pick.g] += units[pick.cand].area;
  }
  for (let i = 0; i < n; i += 1) { // unità senza lati in comune (isole): al gruppo più vicino
    if (group[i] !== -1) continue;
    let bg = 0; let bd = Infinity;
    for (let j = 0; j < n; j += 1) if (group[j] !== -1 && dist(i, j) < bd) { bd = dist(i, j); bg = group[j]; }
    group[i] = bg;
  }
  return group;
}

// ---------------------------------------------------------------- confini fra i gruppi
/** Catene di lati che separano due gruppi diversi (entrambi dentro la regione). Ritorna array di polilinee [[lon, lat], ...]. */
export function boundaryChains(edges, group) {
  const segs = [];
  for (const e of edges.values()) {
    const gs = new Set([...e.units].map((u) => group[u]).filter((g) => g !== undefined && g !== -1));
    const inside = [...e.units].filter((u) => group[u] !== undefined && group[u] !== -1);
    if (inside.length >= 2 && gs.size >= 2) segs.push([e.a, e.b]);
  }
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const nodes = new Map();
  segs.forEach((s, i) => { for (const p of s) (nodes.get(key(p)) ?? nodes.set(key(p), { p, es: [] }).get(key(p))).es.push(i); });
  const used = new Array(segs.length).fill(false);
  const chains = [];
  const walk = (startIdx, from) => {
    const pts = [from];
    let cur = startIdx; let at = from;
    for (;;) {
      used[cur] = true;
      const [a, b] = segs[cur];
      const next = key(a) === key(at) ? b : a;
      pts.push(next);
      const node = nodes.get(key(next));
      if (node.es.length !== 2) break;
      const nxt = node.es.find((i) => i !== cur);
      if (used[nxt]) break;
      cur = nxt; at = next;
    }
    return pts;
  };
  for (const node of nodes.values()) {
    if (node.es.length === 2) continue;
    for (const i of node.es) if (!used[i]) chains.push(walk(i, node.p));
  }
  for (let i = 0; i < segs.length; i += 1) if (!used[i]) chains.push(walk(i, segs[i][0])); // anelli chiusi
  return chains;
}

const distPt = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Unisce le catene i cui estremi distano meno di `tol` (lacune fra Stati diversi). */
export function bridgeChains(chains, tol = BRIDGE_DEG) {
  let cs = chains.map((c) => c.slice());
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < cs.length; i += 1) {
      for (let j = i + 1; j < cs.length; j += 1) {
        for (const [ei, ej] of [['end', 'start'], ['end', 'end'], ['start', 'start'], ['start', 'end']]) {
          const pi = ei === 'end' ? cs[i][cs[i].length - 1] : cs[i][0];
          const pj = ej === 'start' ? cs[j][0] : cs[j][cs[j].length - 1];
          const d = distPt(pi, pj);
          if (d > tol || d === 0) continue;
          const a = ei === 'end' ? cs[i] : [...cs[i]].reverse();
          const b = ej === 'start' ? cs[j] : [...cs[j]].reverse();
          cs = cs.filter((_, k) => k !== i && k !== j);
          cs.push([...a, ...b]);
          changed = true;
          break outer;
        }
      }
    }
  }
  return cs;
}

/**
 * Dove 3 o più catene si incontrano in un punto interno (giunzione di 3 gruppi) ne unisce due in una sola polilinea passante,
 * così la terza finisce SU un taglio già fatto (splitPolygon non chiude un taglio che finisce nel vuoto).
 */
export function joinAtJunctions(chains) {
  const key = (q) => `${q[0].toFixed(6)},${q[1].toFixed(6)}`;
  let cs = chains.map((c) => c.slice());
  for (let guard = 0; guard < 500; guard += 1) {
    const ends = new Map();
    cs.forEach((c, i) => { for (const [e, q] of [['start', c[0]], ['end', c[c.length - 1]]]) (ends.get(key(q)) ?? ends.set(key(q), []).get(key(q))).push({ i, e }); });
    const j = [...ends.values()].find((l) => l.length >= 3 && new Set(l.map((x) => x.i)).size >= 2);
    if (!j) break;
    const [A, B] = [...j].sort((x, y) => cs[y.i].length - cs[x.i].length).filter((x, idx, arr) => arr.findIndex((y) => y.i === x.i) === idx);
    const a = A.e === 'end' ? cs[A.i] : [...cs[A.i]].reverse();
    const b = B.e === 'start' ? cs[B.i] : [...cs[B.i]].reverse();
    cs = cs.filter((_, k) => k !== A.i && k !== B.i);
    cs.push([...a, ...b.slice(1)]);
  }
  return cs;
}

/**
 * Prolunga una polilinea ai due estremi lungo l'ultimo lato. Con `regionPolys` si va avanti finché il punto esce dalla regione
 * (più un margine): il contorno di OpenHistoricalMap può stare anche 5 km oltre quello di Natural Earth (coste, mare incluso).
 */
export function extend(line, ext = EXT_DEG, regionPolys = null, noExt = null) {
  const out = line.map((p) => [p[0], p[1]]);
  const push = (from, to, front) => {
    if (noExt?.has(`${to[0].toFixed(6)},${to[1].toFixed(6)}`)) return; // giunzione fra catene: il taglio prosegue su un'altra catena
    const d = distPt(from, to) || 1;
    const ux = (to[0] - from[0]) / d; const uy = (to[1] - from[1]) / d;
    let len = ext;
    if (regionPolys) {
      len = 0;
      while (len < 0.6 && containsPoint(regionPolys, [to[0] + ux * len, to[1] + uy * len])) len += 0.002;
      len = len >= 0.6 ? ext : len + 0.01;
    }
    const q = [to[0] + ux * len, to[1] + uy * len];
    if (front) out.unshift(q); else out.push(q);
  };
  push(line[1], line[0], true);
  push(line[line.length - 2], line[line.length - 1], false);
  return out;
}

// ---------------------------------------------------------------- taglio curvo (regioni con 2 province moderne)
/**
 * Taglia a metà (stessa area entro l'1%) il poligono maggiore dell'unità con una linea curva (sinusoide irregolare, non retta).
 * Ritorna { line, halves: [polys...] } oppure null. Deterministico: nessun numero casuale.
 */
export function curvedCut(unit) {
  const big = unit.polys.reduce((b, p) => (ringKm2(p[0]) > ringKm2(b[0]) ? p : b), unit.polys[0]);
  const ring = big[0];
  let cx = 0; let cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  cx /= ring.length; cy /= ring.length;
  // asse principale (PCA 2x2)
  let sxx = 0; let sxy = 0; let syy = 0;
  for (const [x, y] of ring) { sxx += (x - cx) ** 2; sxy += (x - cx) * (y - cy); syy += (y - cy) ** 2; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const u = [Math.cos(th), Math.sin(th)]; // lungo l'asse maggiore
  const v = [-Math.sin(th), Math.cos(th)]; // lungo il taglio
  let lo = Infinity; let hi = -Infinity; let vlo = Infinity; let vhi = -Infinity;
  for (const [x, y] of ring) {
    const a = (x - cx) * u[0] + (y - cy) * u[1]; const b = (x - cx) * v[0] + (y - cy) * v[1];
    lo = Math.min(lo, a); hi = Math.max(hi, a); vlo = Math.min(vlo, b); vhi = Math.max(vhi, b);
  }
  const len = hi - lo; const span = vhi - vlo;
  const amp = 0.06 * len; const lambda = 0.9 * span;
  const offAt = (s) => amp * Math.sin((2 * Math.PI * s) / lambda + 0.7) + 0.5 * amp * Math.sin((2 * Math.PI * s) / (0.43 * lambda) + 2.1);
  const make = (c) => {
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= steps; i += 1) {
      const s = vlo - 0.2 * span + (1.4 * span * i) / steps;
      const off = c + offAt(s);
      pts.push([cx + off * u[0] + s * v[0], cy + off * u[1] + s * v[1]]);
    }
    return pts;
  };
  // lato di un punto rispetto alla curva con scostamento c: true = lato di -u («basso»)
  const sideOf = (c) => (p) => {
    const a2 = (p[0] - cx) * u[0] + (p[1] - cy) * u[1];
    const s = (p[0] - cx) * v[0] + (p[1] - cy) * v[1];
    return a2 < c + offAt(s);
  };
  let a = lo * 0.45; let b = hi * 0.45; let best = null;
  for (let it = 0; it < 40; it += 1) {
    const c = (a + b) / 2;
    const parts = splitPolygon(big, [make(c)], { minAreaKm2: 1 });
    const side = sideOf(c);
    let low = 0; let tot = 0;
    for (const pt of parts) { const ar = polyKm2(pt); tot += ar; if (side(interiorPoint(pt))) low += ar; }
    const frac = low / tot;
    best = { line: make(c), side, frac, parts: parts.length };
    if (Math.abs(frac - 0.5) < 0.01) break;
    if (frac < 0.5) a = c; else b = c;
  }
  return best && best.parts >= 2 ? best : null;
}

// ---------------------------------------------------------------- una regione
/** Direzione cardinale (nord/sud/est/ovest) in cui il pezzo A sta rispetto al pezzo B. */
export function cardinal(pa, pb) {
  const kmx = (pa[0] - pb[0]) * Math.cos((pa[1] * Math.PI) / 180) * 111.195;
  const kmy = (pa[1] - pb[1]) * 111.195;
  return Math.abs(kmy) >= Math.abs(kmx) ? (kmy >= 0 ? 'nord' : 'sud') : (kmx >= 0 ? 'est' : 'ovest');
}

/**
 * Divide una regione. `pieces`: feature esistenti (pezzi/sponde) della provincia madre. `units`: tutte le unità di Natural Earth.
 * Ritorna { groups: [{ name, neNames, fragments: [{ pieceIndex, polys }] , curve }], note }.
 */
export function splitRegion(def, pieces, units) {
  const regionPolys = pieces.flatMap((f) => polysOf(f.geometry));
  let inside;
  let group;
  let edges;
  let names;
  let curveInfo = null;
  if (def.manual) {
    const all = Object.values(JULIAN_GROUPS).flat();
    inside = unitsInside(units, regionPolys, { names: all });
    group = inside.map((u) => Object.values(JULIAN_GROUPS).findIndex((l) => l.includes(u.neName)));
    names = Object.keys(JULIAN_GROUPS);
    edges = buildEdges(inside);
  } else {
    inside = unitsInside(units, regionPolys);
    edges = buildEdges(inside);
    if (inside.length >= 3 && !def.curve) {
      group = groupUnits(inside, edges, 3);
    } else if (def.curve && inside.length === 2) {
      // piccola = gruppo 0, grande tagliata in 2 metà = gruppi 1 e 2
      const bigIdx = inside[0].area > inside[1].area ? 0 : 1;
      curveInfo = { bigIdx, cut: curvedCut(inside[bigIdx]) };
      if (!curveInfo.cut) throw new Error(`${def.mother}: taglio curvo non riuscito`);
      group = inside.map((_, i) => (i === bigIdx ? 1 : 0));
    } else throw new Error(`${def.mother}: ${inside.length} unità di Natural Earth, non so come dividerla`);
  }
  let chains = boundaryChains(edges, group);
  if (def.manual) chains = bridgeChains(chains);
  chains = joinAtJunctions(chains);
  const vertexUse = new Map(); // quante catene passano per un punto: una fine che tocca un'altra catena non si prolunga
  for (const c of chains) for (const q of new Set(c.map((x) => `${x[0].toFixed(6)},${x[1].toFixed(6)}`))) vertexUse.set(q, (vertexUse.get(q) ?? 0) + 1);
  const junctions = new Set([...vertexUse].filter(([, n]) => n >= 2).map(([k]) => k));
  const lines = chains.map((c) => extend(c, EXT_DEG, regionPolys, junctions));
  if (curveInfo) {
    // il taglio curvo vale solo dentro l'unità grande: lo si ritaglia sul suo contorno e lo si prolunga oltre
    lines.push(trimToUnit(curveInfo.cut.line, inside[curveInfo.bigIdx], regionPolys));
  }
  // assegna ogni frammento al gruppo dell'unità che lo contiene (o della più vicina)
  const nGroups = 3;
  const groups = Array.from({ length: nGroups }, () => ({ units: [], fragments: [] }));
  inside.forEach((u, i) => groups[group[i]].units.push(u));
  pieces.forEach((f, pieceIndex) => {
    for (const poly of polysOf(f.geometry)) {
      for (const frag of splitPolygon(poly, lines, { minAreaKm2: MIN_PIECE_KM2 })) {
        const p = interiorPoint(frag);
        let ui = inside.findIndex((u) => containsPoint(u.polys, p));
        if (ui === -1) {
          let bd = Infinity;
          inside.forEach((u, i) => { const d = Math.min(...u.polys.map((pl) => distToPolygon(p, pl))); if (d < bd) { bd = d; ui = i; } });
        }
        let g = group[ui];
        if (curveInfo && ui === curveInfo.bigIdx) g = curveInfo.cut.side(p) ? 1 : 2; // quale metà del taglio curvo?
        const arr = groups[g].fragments;
        const slot = arr.find((x) => x.pieceIndex === pieceIndex) ?? (arr.push({ pieceIndex, polys: [] }), arr[arr.length - 1]);
        slot.polys.push(frag);
      }
    }
  });
  return { groups, names, curveInfo, inside, group };
}

/** Ritaglia la polilinea sul poligono maggiore dell'unità: tiene dal primo all'ultimo punto dentro e prolunga di EXT_DEG. */
export function trimToUnit(line, unit, regionPolys = null) {
  const big = unit.polys.reduce((b, p) => (ringKm2(p[0]) > ringKm2(b[0]) ? p : b), unit.polys[0]);
  const idx = line.map((p, i) => (pointInPolygon(p[0], p[1], big) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return line;
  const seg = line.slice(idx[0], idx[idx.length - 1] + 1);
  return extend(seg, EXT_DEG, regionPolys);
}

// ---------------------------------------------------------------- composizione delle feature
const LETTERS = 'ABCDEFGH';

export function buildFeatures(def, pieces, result, usedIds) {
  const out = [];
  const ordered = result.groups.map((g, gi) => ({ ...g, gi })).filter((g) => g.fragments.length > 0);
  if (ordered.length !== 3) throw new Error(`${def.mother}: ${ordered.length} gruppi non vuoti invece di 3`);
  const names = ordered.map((g) => {
    if (result.names) return result.names[g.gi];
    if (result.curveInfo && g.gi >= 1) return null; // nome dopo, con il punto cardinale
    return g.units.reduce((b, u) => ((u.pop ?? 0) > (b.pop ?? 0) || ((u.pop ?? 0) === (b.pop ?? 0) && u.area > b.area) ? u : b), g.units[0]).name; // il centro più popoloso dà il nome
  });
  if (result.curveInfo) { // Perugia Nord / Perugia Sud (punto cardinale rispetto all'altra metà)
    const halves = ordered.filter((g) => g.gi >= 1);
    const base = result.inside[result.curveInfo.bigIdx].name;
    const pa = interiorPoint(halves[0].fragments[0].polys[0]); const pb = interiorPoint(halves[1].fragments[0].polys[0]);
    const ca = cardinal(pa, pb); const cb = cardinal(pb, pa);
    const label = (c) => c.charAt(0).toUpperCase() + c.slice(1);
    ordered.forEach((g, i) => { if (g.gi === halves[0].gi) names[i] = `${base} ${label(ca)}`; else if (g.gi === halves[1].gi) names[i] = `${base} ${label(cb)}`; });
  }
  ordered.forEach((g, i) => {
    const name = names[i];
    const id = `P_ITA_${slug(name)}`;
    if (usedIds.has(id)) throw new Error(`id già usato: ${id}`);
    usedIds.add(id);
    const multi = g.fragments.length > 1;
    g.fragments.forEach((fr, k) => {
      const old = pieces[fr.pieceIndex].properties;
      const fid = multi ? `${id}_SP${k + 1}` : id;
      const label = multi ? `${name} (sponda ${LETTERS[k]})` : name;
      const neNames = g.units.map((u) => u.neName).sort();
      const props = {
        id: fid, name: label, nameLocal: label, owner: old.owner, adminLevel: 6,
        ...(old.ohmRelation != null ? { ohmRelation: old.ohmRelation } : {}),
        validFrom: old.validFrom, validTo: old.validTo, ...(old.dateBasis ? { dateBasis: old.dateBasis } : {}),
        borderQuality: 'hypothesis',
        source: `${old.source}; divisa in 3 province con i confini interni delle province moderne di Natural Earth 10m admin-1 v5.1.1`,
        license: `${old.license}; Natural Earth: Public Domain`,
        derivedFromNe: neNames,
        knownIssues: [...new Set([...(old.knownIssues ?? []), 'divisione_ipotetica_in_3_province', result.curveInfo && g.gi >= 1 ? 'taglio_curvo_ipotetico' : 'raggruppata_da_unita_attuali'])],
        notes: `Una delle 3 province ricavate dividendo ${def.name}: confini interni IPOTETICI, non del 1936. ${result.curveInfo && g.gi >= 1 ? `Taglio curvo inventato che divide a metà ${result.inside[result.curveInfo.bigIdx].name}.` : `Unione di province moderne: ${neNames.join(', ')}.`} Il contorno regionale è quello della fonte originale (${old.source}).`,
        ...(multi ? { parentProvince: id, sponda_fiume: true, sponda: String(k + 1) } : {}),
      };
      out.push({ type: 'Feature', id: fid, properties: props, geometry: geomOf(fr.polys) });
    });
  });
  return out;
}

// stesso aspetto del resto dei file di dati (json di Python: ", " e ": ")
function dump(v) {
  if (Array.isArray(v)) return `[${v.map(dump).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${dump(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2] ?? process.env.NE_DIR;
  if (!src) { console.error('uso: node scripts/build-italy-split.js <cartella con ne_10m_admin_1_states_provinces.geojson>'); process.exit(2); }
  const neFeatures = JSON.parse(await readFile(path.join(src, 'ne_10m_admin_1_states_provinces.geojson'), 'utf8')).features
    .filter((f) => { const b = polysOf(f.geometry)[0][0][0]; return b[0] > 4 && b[0] < 20 && b[1] > 36 && b[1] < 48.5; });
  const places = JSON.parse(await readFile(path.join(src, 'ne_10m_populated_places_simple.geojson'), 'utf8')).features
    .filter((f) => f.properties.iso_a2 === 'IT' || f.properties.iso_a2 === 'SI' || f.properties.iso_a2 === 'HR')
    .map((f) => ({ x: f.geometry.coordinates[0], y: f.geometry.coordinates[1], pop: f.properties.pop_max ?? 0 }));
  const units = toUnits(neFeatures, places);
  const ita = JSON.parse(await readFile(dataUrl('provinces/ITA.json'), 'utf8'));
  const motherOf = (f) => f.properties.parentProvince ?? f.properties.id;
  const todo = REGIONS.filter((d) => ita.features.some((f) => motherOf(f) === d.mother));
  if (todo.length === 0) { console.log('nessuna regione da dividere (già fatto)'); process.exit(0); }
  const usedIds = new Set(ita.features.map((f) => f.properties.id));
  const features = [...ita.features];
  const parentMap = {}; // vecchia madre → [{ id nuova madre, polys }]
  for (const def of todo) {
    const pieces = features.filter((f) => motherOf(f) === def.mother);
    const result = splitRegion(def, pieces, units);
    for (const f of pieces) usedIds.delete(f.properties.id);
    const fresh = buildFeatures(def, pieces, result, usedIds);
    const at = features.findIndex((f) => motherOf(f) === def.mother);
    const rest = features.filter((f) => motherOf(f) !== def.mother);
    rest.splice(at, 0, ...fresh);
    features.length = 0; features.push(...rest);
    const lat0 = pieces.flatMap((f) => polysOf(f.geometry)).reduce((t, p, _, a) => t + p[0].reduce((u, q) => u + q[1], 0) / p[0].length / a.length, 0);
    const before = areaKm2At(pieces.flatMap((f) => polysOf(f.geometry)), lat0);
    const after = areaKm2At(fresh.flatMap((f) => polysOf(f.geometry)), lat0);
    parentMap[def.mother] = fresh.map((f) => ({ mother: f.properties.parentProvince ?? f.properties.id, geometry: f.geometry }));
    console.log(`${def.mother}: ${pieces.length} pezzi → ${fresh.length} feature in 3 province (${[...new Set(fresh.map((f) => f.properties.parentProvince ?? f.properties.id))].join(', ')}); area ${Math.round(before)} → ${Math.round(after)} km²`);
  }
  await writeFile(dataUrl('provinces/ITA.json'), `${dump({ ...ita, features })}\n`);
  // regioni: ogni regione che aveva la vecchia madre ora elenca le 3 nuove
  {
    const doc = JSON.parse(await readFile(dataUrl('regions.json'), 'utf8'));
    for (const def of todo) {
      const region = doc.regions.find((r) => r.provinces.includes(def.mother));
      if (!region) throw new Error(`regions.json: nessuna regione contiene ${def.mother}`);
      region.provinces = [...new Set(parentMap[def.mother].map((x) => x.mother))];
      region.basis = 'compartimento diviso in 3 province (ipotesi)';
      region.notes = `Tre province ricavate dividendo il compartimento (scripts/build-italy-split.js): confini interni IPOTETICI, non del 1936.`;
    }
    doc.note = doc.note.replace(/ITALIA: .*? GERMANIA:/s, 'ITALIA: 17 regioni su 20 sono divise in 3 province ciascuna (confini interni ipotetici ricavati da province moderne di Natural Earth, scripts/build-italy-split.js); la Sicilia ha le sue 9 province; Zara e il Dodecaneso una sola. GERMANIA:');
    const line = (r) => `    ${JSON.stringify(r)}`;
    await writeFile(dataUrl('regions.json'), `{\n  "schema": ${JSON.stringify(doc.schema)},\n  "quality": ${JSON.stringify(doc.quality)},\n  "note": ${JSON.stringify(doc.note)},\n  "regions": [\n${doc.regions.map(line).join(',\n')}\n  ]\n}\n`);
    console.log(`regions.json: ${todo.length} regioni aggiornate`);
  }
  // città: ogni città passa alla nuova madre che la contiene (punto interno della sua zona)
  const cityFile = 'sources/citta_base.json';
  const cb = JSON.parse(await readFile(dataUrl(cityFile), 'utf8'));
  const grandi = JSON.parse(await readFile(dataUrl('citta_grandi.json'), 'utf8'));
  const zoneById = new Map(grandi.features.map((z) => [z.properties.id, z]));
  let moved = 0; let unresolved = 0;
  for (const c of cb.features) {
    const old = c.properties.parentProvince;
    const list = parentMap[old];
    if (!list) continue;
    const z = zoneById.get(c.properties.id);
    const g = z?.geometry ?? c.geometry;
    const p = g.type === 'Point' ? g.coordinates : interiorPoint(polysOf(g).reduce((b, pl) => (ringKm2(pl[0]) > ringKm2(b[0]) ? pl : b)));
    let hit = list.find((x) => polysOf(x.geometry).some((pl) => pointInPolygon(p[0], p[1], pl)));
    if (!hit) { let bd = Infinity; for (const x of list) for (const pl of polysOf(x.geometry)) { const d = distToPolygon(p, pl); if (d < bd) { bd = d; hit = x; } } unresolved += 1; }
    c.properties.parentProvince = hit.mother;
    delete c.properties.sponda;
    moved += 1;
  }
  await writeFile(dataUrl(cityFile), `${dump(cb)}\n`);
  console.log(`${cityFile}: ${moved} città riassegnate (${unresolved} per vicinanza)`);
}
