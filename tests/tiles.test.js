import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LEVEL, N0, TILE_CSS, TileStore, ancestorOf, childrenOf, columns, levelFor, levelScale, tileKey, tileOrigin, tileRect, tileSpan, visibleTiles } from '../src/map/tiles.js';

const WORLD_W = 360 * 0.7;

test('tiles: ogni livello raddoppia le colonne e dimezza il lato; le colonne fanno esattamente il giro del mondo', () => {
  for (let z = 0; z <= MAX_LEVEL; z += 1) {
    assert.equal(columns(z), N0 * 2 ** z);
    assert.ok(Math.abs(columns(z) * tileSpan(z, WORLD_W) - WORLD_W) < 1e-9);
    assert.ok(Math.abs(levelScale(z, WORLD_W) * tileSpan(z, WORLD_W) - TILE_CSS) < 1e-9, 'una piastrella è sempre TILE_CSS pixel al suo livello');
    if (z) assert.ok(Math.abs(levelScale(z, WORLD_W) / levelScale(z - 1, WORLD_W) - 2) < 1e-12);
  }
});

test('tiles: il livello scelto ha scala tra 0,62 e 1,23 volte quella dello schermo, e cresce con lo zoom', () => {
  let last = 0;
  for (let sx = levelScale(0, WORLD_W) * 0.8; sx < levelScale(MAX_LEVEL, WORLD_W) * 0.9; sx *= 1.07) {
    const z = levelFor(sx, WORLD_W);
    assert.ok(z >= last, 'monotono');
    last = z;
    const r = sx / levelScale(z, WORLD_W);
    if (z > 0 && z < MAX_LEVEL) assert.ok(r >= 0.6 && r <= 1.25, `rapporto ${r} al livello ${z}`);
  }
  assert.equal(levelFor(1e-6, WORLD_W), 0);
  assert.equal(levelFor(1e9, WORLD_W), MAX_LEVEL);
});

test('tiles: le piastrelle visibili coprono tutto lo schermo senza buchi, anche oltre il giro del mondo', () => {
  for (const [W, H, z, tx, ty] of [[412, 800, 2, -500, 100], [844, 390, 3, -1900, -300], [412, 800, 0, 10, 300], [1400, 900, 4, 9000, -700]]) {
    const aff = { sx: levelScale(z, WORLD_W) * 1.1, tx, ty };
    const tiles = visibleTiles(z, aff, W, H, WORLD_W, -85, 85, 0);
    for (let i = 0; i < 400; i += 1) {
      const px = (i * 7919) % W;
      const py = (i * 104729) % H;
      const uy = (py - aff.ty) / aff.sx;
      if (uy < -85 || uy > 85) continue; // sopra e sotto il mondo non c'è nulla da coprire
      const hit = tiles.some((t) => { const r = tileRect(z, t.ci, t.r, aff, WORLD_W); return px >= r.x - 1e-6 && px <= r.x + r.w + 1e-6 && py >= r.y - 1e-6 && py <= r.y + r.h + 1e-6; });
      assert.ok(hit, `pixel ${px},${py} scoperto (livello ${z})`);
    }
    for (const t of tiles) { assert.ok(t.c >= 0 && t.c < columns(z), 'colonna canonica'); }
  }
});

test('tiles: la colonna canonica e quella non normalizzata si ripetono ogni giro del mondo, con la stessa origine', () => {
  const a = tileOrigin(3, 5, 1, WORLD_W);
  const aff = { sx: levelScale(3, WORLD_W), tx: 0, ty: 0 };
  const r0 = tileRect(3, 5, 1, aff, WORLD_W);
  const r1 = tileRect(3, 5 + columns(3), 1, aff, WORLD_W);
  assert.ok(Math.abs(r1.x - r0.x - WORLD_W * aff.sx) < 1e-6);
  assert.ok(Math.abs(a.x0 - (5 * a.span - WORLD_W / 2)) < 1e-9);
});

test('tiles: le righe stanno tra le ordinate del mondo e le piastrelle sono ordinate dal centro', () => {
  const aff = { sx: levelScale(2, WORLD_W), tx: 200, ty: 400 };
  const tiles = visibleTiles(2, aff, 412, 2000, WORLD_W, -85, 85, 1);
  const span = tileSpan(2, WORLD_W);
  for (const t of tiles) { assert.ok(t.r >= Math.floor(-85 / span) && t.r <= Math.floor(85 / span)); }
  for (let i = 1; i < tiles.length; i += 1) assert.ok(tiles[i].d >= tiles[i - 1].d);
});

test('tiles: antenato e figli sono coerenti (la griglia dei livelli è annidata)', () => {
  for (const [c, r] of [[0, 0], [5, -3], [13, 2], [7, -1]]) {
    for (const k of childrenOf(c, r)) {
      const an = ancestorOf(k.c, k.r, 1);
      assert.deepEqual([an.c, an.r, an.qx, an.qy], [c, r, k.qx, k.qy]);
    }
    const an2 = ancestorOf(c, r, 2);
    const up = ancestorOf(ancestorOf(c, r, 1).c, ancestorOf(c, r, 1).r, 1);
    assert.deepEqual([an2.c, an2.r], [up.c, up.r]);
    // la piastrella figlia sta dentro l'antenata
    const z = 4;
    const child = tileOrigin(z, c, r, WORLD_W);
    const parent = tileOrigin(z - 1, Math.floor(c / 2), Math.floor(r / 2), WORLD_W);
    assert.ok(child.x0 >= parent.x0 - 1e-9 && child.x0 + child.span <= parent.x0 + parent.span + 1e-9);
    assert.ok(child.y0 >= parent.y0 - 1e-9 && child.y0 + child.span <= parent.y0 + parent.span + 1e-9);
  }
});

test('TileStore: scarta le meno usate oltre il limite, mai quelle del fotogramma corrente né quelle da tenere; ricicla le tele', () => {
  const s = new TileStore(3);
  const canvas = (n) => ({ n });
  s.nextFrame();
  s.set('a', { canvas: canvas('a') });
  s.set('keep', { canvas: canvas('k'), keep: true });
  s.nextFrame();
  s.set('b', { canvas: canvas('b') });
  s.set('c', { canvas: canvas('c') });
  assert.equal(s.size, 3, 'a è la meno usata ed è stata scartata');
  assert.equal(s.get('a'), undefined);
  assert.ok(s.get('keep'));
  assert.deepEqual(s.take(), { n: 'a' }, 'la tela scartata si ricicla');
  s.nextFrame();
  s.touch('b');
  s.set('d', { canvas: canvas('d') });
  assert.ok(s.get('b') && s.get('d') && s.get('keep'), 'b è stata usata di recente, keep non si scarta');
  assert.equal(s.get('c'), undefined);
  s.clear();
  assert.equal(s.size, 0);
  assert.equal(tileKey(2, 3, -1), '2/3/-1');
});
