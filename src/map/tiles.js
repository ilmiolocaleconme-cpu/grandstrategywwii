// Cache a piastrelle della mappa Canvas: matematica pura (testata in tests/tiles.test.js), nessun accesso al DOM.
//
// Il mondo si divide in piastrelle quadrate (in unità di mappa) a livelli di zoom interi: il livello z ha N0 * 2^z colonne che
// fanno il giro del mondo (la mappa si ripete in orizzontale) e righe di pari altezza. Ogni piastrella si disegna una volta sola,
// a risoluzione di quel livello, e resta in cache: trascinare la mappa non ridisegna nulla di già visto, e tra un livello e l'altro
// si mostra la versione meno dettagliata finché quella nuova non è pronta (niente bordi vuoti, niente sfarfallio).

export const TILE_CSS = 256; // lato di una piastrella in pixel CSS al suo livello
export const TILE_BLEED = 2; // pixel dispositivo in più su ogni lato: nascondono la fessura tra piastrelle vicine
export const N0 = 2; // colonne al livello 0
export const MAX_LEVEL = 9;

/** Pixel CSS per unità di mappa al livello z. */
export function levelScale(z, worldW) {
  return (N0 * 2 ** z * TILE_CSS) / worldW;
}

/** Lato di una piastrella del livello z, in unità di mappa. */
export function tileSpan(z, worldW) {
  return worldW / (N0 * 2 ** z);
}

/** Colonne del livello z (giro del mondo). */
export function columns(z) {
  return N0 * 2 ** z;
}

/**
 * Livello da usare per la scala `sx` (pixel CSS per unità): quello la cui scala sta tra 0,62 e 1,23 volte quella dello schermo
 * (si ingrandisce poco: l'immagine ingrandita sfoca, quella rimpicciolita no).
 */
export function levelFor(sx, worldW) {
  const base = levelScale(0, worldW);
  const z = Math.round(Math.log2(Math.max(sx, 1e-9) / base) + 0.2);
  return Math.max(0, Math.min(MAX_LEVEL, z));
}

const mod = (a, n) => ((a % n) + n) % n;

/**
 * Piastrelle che toccano lo schermo W x H (con `ring` piastrelle in più attorno), dalla più vicina al centro.
 * aff: { sx, tx, ty } con px = sx * u + tx. xRange / yRange (unità di mappa): il mondo esiste solo tra queste ordinate;
 * in orizzontale si ripete. Ogni elemento: { c, r, ci } con c = colonna canonica (0..N-1), ci = indice non normalizzato.
 */
export function visibleTiles(z, aff, W, H, worldW, yMin, yMax, ring = 0) {
  const span = tileSpan(z, worldW);
  const n = columns(z);
  const ux0 = (0 - aff.tx) / aff.sx;
  const ux1 = (W - aff.tx) / aff.sx;
  const uy0 = (0 - aff.ty) / aff.sx;
  const uy1 = (H - aff.ty) / aff.sx;
  const half = worldW / 2;
  const ci0 = Math.floor((ux0 + half) / span) - ring;
  const ci1 = Math.floor((ux1 + half) / span) + ring;
  const r0 = Math.max(Math.floor(yMin / span), Math.floor(uy0 / span) - ring);
  const r1 = Math.min(Math.floor((yMax - 1e-9) / span), Math.floor(uy1 / span) + ring);
  const cx = (W / 2 - aff.tx) / aff.sx;
  const cy = (H / 2 - aff.ty) / aff.sx;
  const out = [];
  for (let r = r0; r <= r1; r += 1) {
    for (let ci = ci0; ci <= ci1; ci += 1) {
      const dx = (ci + 0.5) * span - half - cx;
      const dy = (r + 0.5) * span - cy;
      out.push({ c: mod(ci, n), r, ci, d: dx * dx + dy * dy });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Rettangolo della piastrella (ci, r) sullo schermo, in pixel CSS. */
export function tileRect(z, ci, r, aff, worldW) {
  const span = tileSpan(z, worldW);
  return { x: aff.sx * (ci * span - worldW / 2) + aff.tx, y: aff.sx * (r * span) + aff.ty, w: aff.sx * span, h: aff.sx * span };
}

/** Origine della piastrella (c canonica, r) in unità di mappa e lato. */
export function tileOrigin(z, c, r, worldW) {
  const span = tileSpan(z, worldW);
  return { x0: c * span - worldW / 2, y0: r * span, span };
}

export function tileKey(z, c, r) {
  return `${z}/${c}/${r}`;
}

/** Piastrella del livello z - dz che contiene (z, c, r), con il quadrante occupato (qx, qy in 0..2^dz-1 e lato 2^dz). */
export function ancestorOf(c, r, dz) {
  const f = 2 ** dz;
  return { c: Math.floor(c / f), r: Math.floor(r / f), qx: mod(c, f), qy: mod(r, f), f };
}

/** Le 4 piastrelle figlie (livello z + 1). */
export function childrenOf(c, r) {
  return [
    { c: 2 * c, r: 2 * r, qx: 0, qy: 0 },
    { c: 2 * c + 1, r: 2 * r, qx: 1, qy: 0 },
    { c: 2 * c, r: 2 * r + 1, qx: 0, qy: 1 },
    { c: 2 * c + 1, r: 2 * r + 1, qx: 1, qy: 1 },
  ];
}

/**
 * Cache di tele ordinata per ultimo uso. `limit`: numero massimo di piastrelle. Le tele scartate si riciclano (take/give):
 * creare e distruggere tele di centinaia di kB a ogni piastrella costringe il browser a ripulire la memoria durante i gesti.
 */
export class TileStore {
  constructor(limit) {
    this.limit = limit;
    this.map = new Map();
    this.pool = [];
    this.tick = 0;
  }

  get(key) {
    return this.map.get(key);
  }

  /** Segna la piastrella come usata nel fotogramma corrente (non verrà scartata). */
  touch(key) {
    const t = this.map.get(key);
    if (t) t.used = this.tick;
    return t;
  }

  nextFrame() {
    this.tick += 1;
  }

  set(key, tile) {
    const old = this.map.get(key);
    if (old && old.canvas !== tile.canvas) this.pool.push(old.canvas);
    tile.used = this.tick;
    this.map.set(key, tile);
    this.evict();
  }

  /** Toglie le meno usate oltre il limite, mai quelle usate nel fotogramma corrente né quelle `keep` (livello 0). */
  evict() {
    if (this.map.size <= this.limit) return;
    const items = [...this.map.entries()].filter(([, t]) => t.used < this.tick && !t.keep).sort((a, b) => a[1].used - b[1].used);
    for (const [k, t] of items) {
      if (this.map.size <= this.limit) break;
      this.map.delete(k);
      this.pool.push(t.canvas);
    }
    if (this.pool.length > 12) this.pool.length = 12; // il resto lo ripulisce il browser
  }

  take() {
    return this.pool.pop() ?? null;
  }

  clear() {
    for (const t of this.map.values()) this.pool.push(t.canvas);
    this.map.clear();
    if (this.pool.length > 12) this.pool.length = 12;
  }

  get size() {
    return this.map.size;
  }
}
