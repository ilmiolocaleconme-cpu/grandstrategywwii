// Calcolo delle zone marittime (solo script: non entra nel pacchetto del browser).
//
// Metodo: le coste vengono dalle province. Su una griglia regolare le celle coperte da una provincia
// sono terra; il resto, dentro l'area d'interesse e fuori dai "holes" (terre non coperte dai dati:
// Irlanda, Islanda...), è acqua. Ogni cella d'acqua passa al seme più vicino PER VIA D'ACQUA
// (Dijkstra a più sorgenti): una penisola separa due mari anche se i semi sono vicini in linea d'aria.
// Un seme con radiusKm non va oltre quel raggio: così i passaggi strategici restano zone piccole.
// Poi si ricavano contorni, zone confinanti (km di confine) e province costiere (km di costa).
import { makeGrid, rasterizeProvinces, fillPolygon } from './sea-raster.js';

const KM_LAT = 110.57;
const KM_LON_EQ = 111.32;

class MinHeap {
  constructor() { this.d = new Float64Array(1 << 16); this.c = new Int32Array(1 << 16); this.s = new Int16Array(1 << 16); this.n = 0; }
  less(i, j) { return this.d[i] < this.d[j] || (this.d[i] === this.d[j] && (this.s[i] < this.s[j] || (this.s[i] === this.s[j] && this.c[i] < this.c[j]))); }
  swap(i, j) { const d = this.d[i], c = this.c[i], s = this.s[i]; this.d[i] = this.d[j]; this.c[i] = this.c[j]; this.s[i] = this.s[j]; this.d[j] = d; this.c[j] = c; this.s[j] = s; }
  grow() {
    const cap = this.d.length * 2;
    const d = new Float64Array(cap); d.set(this.d); this.d = d;
    const c = new Int32Array(cap); c.set(this.c); this.c = c;
    const s = new Int16Array(cap); s.set(this.s); this.s = s;
  }
  push(dist, cell, seed) {
    if (this.n === this.d.length) this.grow();
    let i = this.n++;
    this.d[i] = dist; this.c[i] = cell; this.s[i] = seed;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
  }
  pop() {
    const out = [this.d[0], this.c[0], this.s[0]];
    this.n -= 1;
    if (this.n > 0) {
      this.d[0] = this.d[this.n]; this.c[0] = this.c[this.n]; this.s[0] = this.s[this.n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < this.n && this.less(l, m)) m = l;
        if (r < this.n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return out;
  }
}

function simplifyClosed(ring, tol) {
  // ring: punti senza ripetere il primo in coda. Douglas-Peucker sui due semianelli divisi dai punti più lontani.
  const n = ring.length;
  if (n <= 4) return ring;
  let a = 0, b = 0, best = -1;
  for (let i = 1; i < n; i += 1) { const dx = ring[i][0] - ring[0][0], dy = ring[i][1] - ring[0][1]; const d = dx * dx + dy * dy; if (d > best) { best = d; b = i; } }
  const keep = new Uint8Array(n);
  keep[a] = 1; keep[b] = 1;
  const stack = [[a, b], [b, n]]; // il secondo tratto chiude sul punto 0 (indice n -> 0)
  while (stack.length > 0) {
    const [i, j] = stack.pop();
    const p = ring[i % n], q = ring[j % n];
    const dx = q[0] - p[0], dy = q[1] - p[1]; const len2 = dx * dx + dy * dy;
    let far = -1, fd = tol;
    for (let k = i + 1; k < j; k += 1) {
      const r = ring[k % n];
      let d;
      if (len2 === 0) d = Math.hypot(r[0] - p[0], r[1] - p[1]);
      else { const t = Math.max(0, Math.min(1, ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / len2)); d = Math.hypot(r[0] - (p[0] + t * dx), r[1] - (p[1] + t * dy)); }
      if (d > fd) { fd = d; far = k; }
    }
    if (far !== -1) { keep[far % n] = 1; stack.push([i, far], [far, j]); }
  }
  return ring.filter((_, i) => keep[i]);
}

export function computeSeaZones(collection, design, { debug = false } = {}) {
  const g = makeGrid(design.grid);
  const { nx, ny, step } = g;
  const total = nx * ny;
  const prov = rasterizeProvinces(g, collection);

  const holeMask = new Uint16Array(total);
  for (const h of design.holes ?? []) fillPolygon(g, [h.ring], holeMask, 1);
  const forcedMask = new Uint16Array(total);
  for (const f of design.forcedWater ?? []) fillPolygon(g, [f.ring], forcedMask, 1);

  const water = new Uint8Array(total);
  for (let c = 0; c < total; c += 1) water[c] = forcedMask[c] || (!prov[c] && !holeMask[c]) ? 1 : 0;

  const lat = (iy) => g.lat0 + (iy + 0.5) * step;
  const hKm = new Float64Array(ny); // passo orizzontale in km
  for (let iy = 0; iy < ny; iy += 1) hKm[iy] = step * KM_LON_EQ * Math.cos((lat(iy) * Math.PI) / 180);
  const vKm = step * KM_LAT;

  // semi: si spostano sulla cella d'acqua più vicina (entro 0,4°) se cadono su terra
  const seeds = design.seeds.map((s, k) => {
    const ix0 = Math.floor((s.lon - g.lon0) / step), iy0 = Math.floor((s.lat - g.lat0) / step);
    const maxR = Math.ceil(0.4 / step);
    let bestCell = -1, bestD = Infinity;
    for (let dy = -maxR; dy <= maxR; dy += 1) for (let dx = -maxR; dx <= maxR; dx += 1) {
      const ix = ix0 + dx, iy = iy0 + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny || !water[iy * nx + ix]) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestCell = iy * nx + ix; }
    }
    if (bestCell < 0) throw new Error(`seme ${s.id}: nessuna cella d'acqua entro 0,4° da (${s.lon}, ${s.lat})`);
    return { ...s, k, cell: bestCell, shiftDeg: Math.sqrt(bestD) * step };
  });

  const owner = new Int16Array(total).fill(-1);
  const best = new Float64Array(total).fill(Infinity);
  const heap = new MinHeap();
  for (const s of seeds) { best[s.cell] = 0; heap.push(0, s.cell, s.k); }
  const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  while (heap.n > 0) {
    const [d, cell, k] = heap.pop();
    if (owner[cell] !== -1) continue;
    owner[cell] = k;
    const cap = seeds[k].radiusKm ?? Infinity;
    const ix = cell % nx, iy = (cell - ix) / nx;
    for (const [dx, dy] of NB) {
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const nc = jy * nx + jx;
      if (!water[nc] || owner[nc] !== -1) continue;
      const stepKm = dx !== 0 && dy !== 0 ? Math.hypot(hKm[iy], vKm) : dx !== 0 ? hKm[iy] : vKm;
      const nd = d + stepKm;
      if (nd > cap || nd >= best[nc]) continue;
      best[nc] = nd;
      heap.push(nd, nc, k);
    }
  }

  // Sacche: acqua rimasta chiusa dietro le zone a raggio limitato (che fanno da muro agli altri semi).
  // Ogni sacca piccola (fino a maxPocketCells) va alla zona confinante con cui ha più contatto.
  // Le masse grandi non raggiunte (terre non coperte dai dati che la griglia vede come "acqua",
  // come la penisola araba, il Mar Rosso del nord) restano senza zona.
  const maxPocket = design.maxPocketCells ?? 20000;
  const seen = new Uint8Array(total);
  let pocketsAssigned = 0;
  const skipped = [];
  for (let start = 0; start < total; start += 1) {
    if (!water[start] || owner[start] !== -1 || seen[start]) continue;
    const comp = [start];
    seen[start] = 1;
    const contact = new Map();
    for (let qi = 0; qi < comp.length; qi += 1) {
      const cell = comp[qi];
      const ix = cell % nx, iy = (cell - ix) / nx;
      for (const [dx, dy] of NB.slice(0, 4)) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const nc = jy * nx + jx;
        if (!water[nc]) continue;
        if (owner[nc] === -1) { if (!seen[nc]) { seen[nc] = 1; comp.push(nc); } } else contact.set(owner[nc], (contact.get(owner[nc]) ?? 0) + 1);
      }
    }
    if (contact.size === 0 || comp.length > maxPocket) { skipped.push(comp.length); continue; }
    let bestZone = -1, bestN = -1;
    for (const [z, n] of [...contact].sort((a, b) => a[0] - b[0])) if (n > bestN) { bestN = n; bestZone = z; }
    for (const cell of comp) owner[cell] = bestZone;
    pocketsAssigned += 1;
  }
  let unassigned = 0;
  for (let c = 0; c < total; c += 1) if (water[c] && owner[c] === -1) unassigned += 1;

  // contorni, confini tra zone e coste
  const edgesByZone = seeds.map(() => new Map());
  const addEdge = (z, a, b) => { const m = edgesByZone[z]; const l = m.get(a); if (l) l.push(b); else m.set(a, [b]); };
  const V = (ix, iy) => iy * (nx + 1) + ix;
  const area = new Float64Array(seeds.length);
  const seaKm = new Map();
  const coastKm = seeds.map(() => new Map());
  const bump = (m, key, km) => m.set(key, (m.get(key) ?? 0) + km);
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const c = iy * nx + ix;
      const z = owner[c];
      if (z < 0) continue;
      area[z] += hKm[iy] * vKm;
      const nbr = (jx, jy) => (jx < 0 || jy < 0 || jx >= nx || jy >= ny ? -2 : owner[jy * nx + jx]);
      const sides = [
        [ix, iy - 1, V(ix, iy), V(ix + 1, iy), hKm[iy]],
        [ix + 1, iy, V(ix + 1, iy), V(ix + 1, iy + 1), vKm],
        [ix, iy + 1, V(ix + 1, iy + 1), V(ix, iy + 1), hKm[iy]],
        [ix - 1, iy, V(ix, iy + 1), V(ix, iy), vKm],
      ];
      for (const [jx, jy, va, vb, km] of sides) {
        const o = nbr(jx, jy);
        if (o === z) continue;
        addEdge(z, va, vb);
        if (o >= 0) { if (z < o) bump(seaKm, `${z}|${o}`, km); } else if (o === -1) {
          const p = prov[jy * nx + jx];
          if (p) bump(coastKm[z], p - 1, km);
        }
      }
    }
  }

  const lonOf = (v) => g.lon0 + (v % (nx + 1)) * step;
  const latOf = (v) => g.lat0 + Math.floor(v / (nx + 1)) * step;
  const tol = design.simplifyTolDeg ?? 0.06;
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const zones = seeds.map((s, z) => {
    const m = edgesByZone[z];
    const rings = [];
    for (const [startV] of m) {
      while (m.get(startV)?.length > 0) {
        const loop = [startV];
        let v = startV;
        for (;;) {
          const outs = m.get(v);
          const nextV = outs.pop();
          if (outs.length === 0) m.delete(v);
          if (nextV === startV) break;
          loop.push(nextV);
          v = nextV;
          if (!m.has(v)) break; // non dovrebbe succedere: anello aperto
        }
        // toglie i punti allineati (scalini), poi semplifica
        const pts = loop.map((vv) => [lonOf(vv), latOf(vv)]);
        const compact = pts.filter((p, i) => { const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length]; return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1])); });
        const simple = simplifyClosed(compact.length >= 4 ? compact : pts, tol);
        if (simple.length >= 3) rings.push(simple.map(([x, y]) => [round3(x), round3(y)]));
      }
    }
    rings.sort((a, b) => b.length - a.length);
    return { s, rings };
  });

  const minKm = 5;
  const idOf = (k) => seeds[k].id;
  const neighborsOf = seeds.map(() => []);
  for (const [key, km] of seaKm) {
    if (km < minKm) continue;
    const [a, b] = key.split('|').map(Number);
    neighborsOf[a].push([idOf(b), Math.round(km)]);
    neighborsOf[b].push([idOf(a), Math.round(km)]);
  }

  const out = zones.map(({ s, rings }, z) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    region: s.region,
    strategic: s.strategic === true,
    note: s.note ?? '',
    areaKm2: Math.round(area[z]),
    seed: [round3(g.lon0 + ((s.cell % nx) + 0.5) * step), round3(g.lat0 + (Math.floor(s.cell / nx) + 0.5) * step)],
    neighbors: neighborsOf[z].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    coastal: [...coastKm[z]].filter(([, km]) => km >= minKm).map(([p, km]) => [p, Math.round(km)]).sort((a, b) => a[0] - b[0]),
    rings,
  }));

  const report = {
    cells: total,
    waterCells: water.reduce((a, v) => a + v, 0),
    unassigned,
    pocketsAssigned,
    skippedMasses: skipped.sort((a, b) => b - a).slice(0, 8),
    snapped: seeds.filter((s) => s.shiftDeg > 0.0001).map((s) => `${s.id} (${s.shiftDeg.toFixed(2)}°)`),
  };
  return { zones: out, grid: g, report, debug: debug ? { owner, prov, water } : null };
}
