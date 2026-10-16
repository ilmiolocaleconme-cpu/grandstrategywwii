import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProvinces } from '../scripts/load-provinces.js';
import { project, buildMapModel, buildWaterModel, labelFitOf, pickLabels, polygonsOf, withoutSmallHoles } from '../src/map/geo.js';
import { fitLabel, poleOfInaccessibility, principalAxis, CHAR_W, TEXT_H } from '../src/map/labelfit.js';
import { readFileSync } from 'node:fs';

// Etichette incastrate nella forma (provincia o lago): il rettangolo del testo deve stare dentro il poligono.

// controllo indipendente: punto in poligono (regola pari-dispari) e campionamento fitto del rettangolo
const inside = (x, y, rings) => {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
};
const rectInside = (fit, len, rings, shrink = 0.97, charW = CHAR_W) => {
  const w = len * charW * fit.size * shrink;
  const h = TEXT_H * fit.size * shrink;
  const a = (fit.angle * Math.PI) / 180;
  for (let i = 0; i <= 24; i += 1) {
    for (let j = 0; j <= 4; j += 1) {
      const u = -w / 2 + (w * i) / 24;
      const v = -h / 2 + (h * j) / 4;
      if (!inside(fit.x + Math.cos(a) * u - Math.sin(a) * v, fit.y + Math.sin(a) * u + Math.cos(a) * v, rings)) return false;
    }
  }
  return true;
};

test('rettangolo: il testo e centrato e il corpo e limitato dalla larghezza', () => {
  const sq = [[[0, 0], [10, 0], [10, 4], [0, 4], [0, 0]]];
  const fit = fitLabel(sq, 5);
  assert.ok(Math.abs(fit.x - 5) < 0.3 && Math.abs(fit.y - 2) < 0.3, JSON.stringify(fit));
  assert.equal(Math.round(fit.angle), 0);
  assert.ok(rectInside(fit, 5, sq));
  // 5 caratteri in 10 unita: corpo ~ 10 / (5 * 0,66) = 3,0 (meno il 3 % di margine)
  assert.ok(fit.size > 2.6 && fit.size < 3.2, `corpo ${fit.size}`);
});

test('forma a L: il nome sta dentro il braccio, non nel vuoto del baricentro', () => {
  const L = [[[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10], [0, 0]]];
  const pole = poleOfInaccessibility(L);
  assert.ok(inside(pole.x, pole.y, L));
  const fit = fitLabel(L, 4);
  assert.ok(fit && rectInside(fit, 4, L), JSON.stringify(fit));
});

test('isola interna (buco): il testo non attraversa il buco', () => {
  const ring = [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]];
  const hole = [[8, 3], [12, 3], [12, 7], [8, 7], [8, 3]];
  const rings = [ring, hole];
  const fit = fitLabel(rings, 6);
  assert.ok(fit && rectInside(fit, 6, rings), JSON.stringify(fit));
  assert.equal(inside(fit.x, fit.y, rings), true);
});

test('striscia diagonale: il testo ruota lungo l\'asse e diventa piu grande', () => {
  // striscia lunga 40 e larga 3, inclinata di 35 gradi
  const a = (35 * Math.PI) / 180;
  const pts = [[-20, -1.5], [20, -1.5], [20, 1.5], [-20, 1.5], [-20, -1.5]].map(([u, v]) => [Math.cos(a) * u - Math.sin(a) * v, Math.sin(a) * u + Math.cos(a) * v]);
  const fit = fitLabel([pts], 8);
  assert.ok(fit && Math.abs(fit.angle - 35) < 6, JSON.stringify(fit));
  assert.ok(rectInside(fit, 8, [pts]));
  const flat = fitLabel([pts], 8, { minElongation: 1e9 }); // senza rotazione
  assert.ok(fit.size > flat.size * 1.25, `${fit.size} contro ${flat.size}`);
  const ax = principalAxis(pts);
  assert.ok(ax.elongation > 5 && Math.abs((ax.angle * 180) / Math.PI - 35) < 1);
});

test('forma troppo stretta o degenere: nessun testo', () => {
  assert.equal(fitLabel([[[0, 0], [1, 0], [0, 0]]], 4), null);
  assert.equal(fitLabel([], 4), null);
});

test('province reali: il nome sta dentro la provincia (campionamento fitto), con rotazione dove serve', async () => {
  const provinces = await loadProvinces();
  const model = buildMapModel(provinces);
  const pick = [...model.items].sort((a, b) => b.areaKm2 - a.areaKm2).filter((_, i) => i % 6 === 0);
  const owners = new Set(['EST', 'LVA', 'LTU', 'DNK', 'NOR', 'SWE', 'FIN']);
  for (const it of model.items) if (owners.has(it.props.owner) && it.areaKm2 > 800) pick.push(it);
  let rotated = 0;
  for (const it of pick) {
    const text = (it.props.nameLocal ?? it.props.name).toLocaleUpperCase('it');
    const fit = labelFitOf(it, text);
    assert.ok(fit, `${it.id}: nessun fit`);
    const polys = polygonsOf(it.feature).map((p) => p.map((r) => r.map(([lon, lat]) => project(lon, lat))));
    const main = polys.reduce((m, p) => (Math.abs(p[0].length) > Math.abs(m[0].length) ? p : m));
    // il poligono principale e quello con anello esterno piu esteso: si cerca quello che contiene il centro
    const host = polys.find((p) => inside(fit.x, fit.y, p)) ?? main;
    assert.ok(rectInside(fit, text.length, host), `${it.id}: il testo esce dalla provincia`);
    if (Math.abs(fit.angle) > 1) rotated += 1;
  }
  assert.ok(pick.length > 100, `province controllate: ${pick.length}`);
  assert.ok(rotated > 5, `province con testo ruotato: ${rotated}`);
});

test('laghi: i nomi dei laghi grandi stanno dentro il lago (con le isole)', async () => {
  const lakes = JSON.parse(readFileSync(new URL('../data/lakes.json', import.meta.url), 'utf8'));
  const water = buildWaterModel([], { features: [] }, lakes);
  let checked = 0;
  for (const it of water.lakes) {
    if (!it.name || it.areaKm2 < 150) continue;
    const fit = labelFitOf(it, it.name, 0.52);
    if (!fit) continue; // laghi troppo stretti: nessun nome, e corretto
    const polys = polygonsOf(it.feature).map((p) => p.map((r) => r.map(([lon, lat]) => project(lon, lat))));
    const host0 = polys.find((p) => inside(fit.x, fit.y, withoutSmallHoles(p)));
    assert.ok(host0, `${it.id}: centro fuori dal lago`);
    const host = withoutSmallHoles(host0); // le isole piccole non fermano il nome: il testo ci passa sopra
    assert.ok(rectInside(fit, it.name.length, host, 0.97, 0.52), `${it.id}: il nome esce dal lago`);
    checked += 1;
  }
  assert.ok(checked > 20, `laghi controllati: ${checked}`);
});

test('pickLabels sui laghi: nessuna sovrapposizione con i nomi delle province', async () => {
  const provinces = await loadProvinces();
  const model = buildMapModel(provinces);
  const lakes = JSON.parse(readFileSync(new URL('../data/lakes.json', import.meta.url), 'utf8'));
  const water = buildWaterModel([], { features: [] }, lakes);
  const vb = { x: model.bounds.x, y: model.bounds.y, w: model.bounds.w, h: model.bounds.h };
  const pxPerUnit = 360 / vb.w;
  for (const k of [3, 8]) {
    const view = { k, x: -(vb.x + vb.w * 0.55) * k + vb.w / 2 + vb.x, y: -(vb.y + vb.h * 0.2) * k + vb.h / 2 + vb.y }; // verso il Nord
    const prov = pickLabels(model.items, view, vb, pxPerUnit);
    const lk = pickLabels(water.lakes, view, vb, pxPerUnit, [0], { maxLabels: 30, maxPx: 15, charW: 0.52, upper: false, avoid: prov.map((l) => l.rect), nameOf: (it) => it.props.name });
    for (const a of lk) for (const b of prov) {
      assert.ok(!(a.rect[0] < b.rect[2] && a.rect[2] > b.rect[0] && a.rect[1] < b.rect[3] && a.rect[3] > b.rect[1]), `k=${k}: ${a.name} / ${b.name}`);
    }
    assert.ok(lk.length <= 30);
  }
});
