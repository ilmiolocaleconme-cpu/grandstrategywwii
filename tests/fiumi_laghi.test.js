import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// I fiumi non devono attraversare i laghi disegnati: i tratti sono divisi sui poligoni dei laghi; quelli dentro (inLake)
// restano nei dati (continuita per la navigazione) ma la mappa non li disegna.
const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const geo = read('rivers_geo.json');
const lakes = read('lakes.json');
const rivers = read('rivers.json');

const inRing = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const bboxes = lakes.features.map((f) => {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const poly of f.geometry.coordinates) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
});
const inAnyLake = (x, y) => lakes.features.some((f, i) => {
  const b = bboxes[i];
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  return f.geometry.coordinates.some((poly) => poly.reduce((n, r) => n + (inRing(x, y, r) ? 1 : 0), 0) % 2 === 1);
});
const midpoints = (c) => c.slice(0, -1).map((p, i) => [(p[0] + c[i + 1][0]) / 2, (p[1] + c[i + 1][1]) / 2]);

test('fiumi e laghi: i tratti visibili non passano dentro un lago disegnato (salvo rare corde tra due vertici)', () => {
  let edges = 0;
  let inside = 0;
  for (const f of geo.features) {
    if (f.properties.inLake) continue;
    for (const [x, y] of midpoints(f.geometry.coordinates)) { edges += 1; if (inAnyLake(x, y)) inside += 1; }
  }
  assert.ok(edges > 20000, `archi ${edges}`);
  // una corda tra due vertici fuori dal lago puo tagliarne un'insenatura: tollerato fino allo 0,5% degli archi
  assert.ok(inside / edges <= 0.005, `archi visibili con il punto medio in un lago: ${inside}/${edges}`);
});

test('fiumi e laghi: i tratti inLake stanno dentro un lago, ogni fiume resta continuo nei dati', () => {
  const lakeSegs = geo.features.filter((f) => f.properties.inLake);
  assert.ok(lakeSegs.length > 100, `tratti nei laghi: ${lakeSegs.length}`);
  let n = 0;
  let ok = 0;
  for (const f of lakeSegs) for (const [x, y] of midpoints(f.geometry.coordinates)) { n += 1; if (inAnyLake(x, y)) ok += 1; }
  assert.ok(ok / n >= 0.95, `punti medi dentro un lago: ${ok}/${n}`);
  // numerazione dei tratti: 0..n-1 per fiume, senza buchi, e ogni fiume ha almeno un tratto
  const seg = new Map();
  for (const f of geo.features) { const a = seg.get(f.properties.riverId) ?? []; a.push(f.properties.segment); seg.set(f.properties.riverId, a); }
  for (const r of rivers) {
    const a = (seg.get(r.id) ?? []).sort((p, q) => p - q);
    assert.ok(a.length > 0, r.id);
    assert.deepEqual(a, a.map((_, i) => i), `${r.id}: numerazione dei tratti`);
  }
});

test('fiumi e laghi: nessuna linea visibile attraversa il Ladoga', () => {
  const ladoga = lakes.features.find((f) => f.properties.name === 'Ladoga');
  assert.ok(ladoga);
  const visible = geo.features.filter((f) => !f.properties.inLake);
  const crossing = visible.filter((f) => midpoints(f.geometry.coordinates).some(([x, y]) => x > 30.5 && x < 32 && y > 60.2 && y < 61.2 && inAnyLake(x, y)));
  assert.equal(crossing.length, 0);
});
