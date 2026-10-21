// Intersezione di poligoni (src/data/polyclip.js): casi semplici, concavi, con buchi e senza contatto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersect, polygonArea, signedArea, pointInPolygon } from '../src/data/polyclip.js';

const sq = (x, y, w, h = w) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const total = (polys) => polys.reduce((s, p) => s + polygonArea(p), 0);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} contro ${b}`);

test('polyclip: due quadrati che si sovrappongono in parte', () => {
  const r = intersect([sq(0, 0, 4)], [sq(2, 2, 4)]);
  assert.equal(r.length, 1);
  near(total(r), 4);
  assert.ok(signedArea(r[0][0].slice(0, -1)) > 0, 'anello esterno antiorario');
});

test('polyclip: un poligono dentro l\'altro e il contrario', () => {
  near(total(intersect([sq(1, 1, 1)], [sq(0, 0, 4)])), 1, 'soggetto dentro');
  near(total(intersect([sq(0, 0, 4)], [sq(1, 1, 1)])), 1, 'ritaglio dentro');
});

test('polyclip: poligoni separati non danno nulla', () => {
  assert.deepEqual(intersect([sq(0, 0, 1)], [sq(5, 5, 1)]), []);
  assert.deepEqual(intersect([sq(0, 0, 4)], [sq(10, 0, 4)]), []);
});

test('polyclip: indipendente da orientamento e punto di partenza degli anelli', () => {
  const a = sq(0, 0, 4);
  const b = [...sq(2, 2, 4)].reverse();
  near(total(intersect([a], [b])), 4);
  const rotated = [a[2], a[3], a[0], a[1], a[2]];
  near(total(intersect([rotated], [sq(2, 2, 4)])), 4);
});

test('polyclip: soggetto concavo (a U) tagliato in due pezzi', () => {
  const u = [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6], [0, 0]]; // area 36 - 8 (vano 2x4) = 28
  near(polygonArea([u]), 28);
  const r = intersect([u], [sq(-1, 3, 8, 2)]); // fascia orizzontale a y 3..5: prende le due braccia
  assert.equal(r.length, 2);
  near(total(r), 8); // ogni braccio è largo 2 e alto 2: 4 + 4
});

test('polyclip: il ritaglio ha un buco', () => {
  const holed = [sq(0, 0, 10), [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]]]; // 100 - 16
  near(polygonArea(holed), 84);
  near(total(intersect([sq(1, 1, 8)], holed)), 64 - 16);
  near(total(intersect([sq(4, 4, 2)], holed)), 0, 'tutto nel buco');
});

test('polyclip: il soggetto contiene il ritaglio con un buco in mezzo', () => {
  const r = intersect([sq(0, 0, 10)], [sq(2, 2, 6), [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]]);
  assert.equal(r.length, 1);
  assert.equal(r[0].length, 2, 'un buco');
  near(total(r), 36 - 4);
});

test('polyclip: i vertici del ritaglio restano invariati (confini condivisi)', () => {
  const province = [[0, 0], [5, 0], [7, 3], [5, 6], [0, 6], [0, 0]];
  const r = intersect([sq(-1, 1, 5, 4)], [province]);
  const verts = new Set(r.flatMap((p) => p[0]).map((v) => v.join(',')));
  for (const v of [[0, 0], [5, 0], [7, 3], [5, 6], [0, 6]].filter(([x, y]) => pointInPolygon(x, y, [sq(-1, 1, 5, 4).slice(0, -1)]))) {
    assert.ok(verts.has(v.join(',')), `vertice ${v}`);
  }
});

test('polyclip: area dell\'intersezione di due cerchi come poligoni (controllo con campionamento)', () => {
  const circle = (cx, cy, r, n = 120) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * (i % n)) / n), cy + r * Math.sin((2 * Math.PI * (i % n)) / n)]);
  const A = circle(0, 0, 5);
  const B = circle(4, 1, 4);
  const got = total(intersect([A], [B]));
  let inside = 0;
  const N = 400;
  for (let i = 0; i < N; i += 1) for (let j = 0; j < N; j += 1) {
    const x = -5 + (10 * (i + 0.5)) / N;
    const y = -5 + (10 * (j + 0.5)) / N;
    if (pointInPolygon(x, y, [A.slice(0, -1)]) && pointInPolygon(x, y, [B.slice(0, -1)])) inside += 1;
  }
  const expected = (inside * 100) / (N * N);
  assert.ok(Math.abs(got - expected) / expected < 0.01, `${got} contro ${expected}`);
});
