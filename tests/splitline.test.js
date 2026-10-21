// Divisione di un poligono lungo le linee dei fiumi (src/data/splitline.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPolygon, ringKm2 } from '../src/data/splitline.js';

// quadrato di 0,2 gradi di lato (circa 14 x 22 km a 45 N)
const sq = [[10, 45], [10.2, 45], [10.2, 45.2], [10, 45.2], [10, 45]];
const total = (polys) => polys.reduce((s, p) => s + ringKm2(p[0]), 0);
const key = (p) => p.join(',');

test('splitline: un fiume che attraversa il poligono lo divide in due pezzi che sommano la stessa area', () => {
  const r = splitPolygon([sq], [[[10.1, 44.9], [10.1, 45.3]]]);
  assert.equal(r.length, 2);
  assert.ok(Math.abs(total(r) - ringKm2(sq)) < 2e-3 * ringKm2(sq));
  // i due pezzi si dividono lo stesso tratto: i vertici del taglio sono condivisi
  const a = new Set(r[0][0].map(key));
  const shared = r[1][0].filter((p) => a.has(key(p)));
  assert.ok(shared.length >= 2, `vertici condivisi: ${shared.length}`);
});

test('splitline: fiume tortuoso (con vertici dentro) e affluente che finisce nel fiume: tre pezzi', () => {
  const fiume = [[10.1, 44.9], [10.12, 45.05], [10.08, 45.12], [10.1, 45.3]];
  const affluente = [[9.9, 45.1], [10.0, 45.1], [10.08, 45.12]]; // entra da ovest e finisce sul fiume
  const r = splitPolygon([sq], [fiume, affluente]);
  assert.equal(r.length, 3);
  assert.ok(Math.abs(total(r) - ringKm2(sq)) < 2e-3 * ringKm2(sq));
});

test('splitline: un fiume che nasce dentro e non esce non divide', () => {
  assert.equal(splitPolygon([sq], [[[10.1, 45.1], [10.1, 45.3]]]).length, 1);
  assert.equal(splitPolygon([sq], [[[10.05, 45.05], [10.1, 45.1]]]).length, 1);
});

test('splitline: niente strisce sottili: un fiume a pochi metri dal bordo non crea un pezzo', () => {
  assert.equal(splitPolygon([sq], [[[10.0003, 44.9], [10.0003, 45.3]]]).length, 1);
});

test('splitline: un fiume sul bordo non divide e una linea lontana non cambia nulla', () => {
  assert.equal(splitPolygon([sq], [[[10, 44.9], [10, 45.3]]]).length, 1);
  assert.equal(splitPolygon([sq], [[[12, 44.9], [12, 45.3]]]).length, 1);
});

test('splitline: il buco resta nel pezzo che lo contiene', () => {
  const hole = [[10.03, 45.03], [10.03, 45.06], [10.06, 45.06], [10.06, 45.03], [10.03, 45.03]];
  const r = splitPolygon([sq, hole], [[[10.15, 44.9], [10.15, 45.3]]]);
  assert.equal(r.length, 2);
  assert.equal(r.filter((p) => p.length === 2).length, 1);
});
