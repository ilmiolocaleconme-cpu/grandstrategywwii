import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOMI_1936, BACINI_DOPO_1936 } from '../scripts/revisione-urss-1936.js';

// Revisione dell'URSS del 25/11/2026 (scripts/revisione-urss-1936.js): nomi del 1936, Bajkonur, bacini del dopoguerra.
const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const ussr = read('provinces/USSR.json').features;
const byId = new Map(ussr.map((f) => [f.properties.id, f]));

test('URSS 1936: nessun nome attuale o con note fra parentesi, nome di Natural Earth conservato', () => {
  for (const f of ussr) {
    const p = f.properties;
    assert.ok(Array.isArray(p.nameNe), p.id);
    for (const n of [p.name, p.nameLocal]) {
      assert.doesNotMatch(n.replace(/ \(sponda [^)]+\)$/, ''), /\((con |parte|[A-Z][a-z]+ \d{4})/, `${p.id}: ${n}`);
      assert.doesNotMatch(n, /Volgograd|Nizhegorod|Moskovskaya|Maga Buryatdan|Territories|Autonomous Okrug/, `${p.id}: ${n}`);
    }
  }
  assert.equal(byId.get('P_USSR_VOLGOGRAD').properties.name, 'Stalingrado');
  assert.equal(byId.get('P_USSR_TVER').properties.nameLocal, 'Kalinin');
  assert.equal(byId.get('P_USSR_KHARKIV').properties.name, 'Charkov');
  assert.equal(byId.get('P_USSR_ARKHANGELSK_SP48').properties.name, 'Arcangelo (sponda p)');
  for (const k of Object.keys(NOMI_1936)) assert.ok(ussr.some((f) => f.properties.id.replace(/_SP\d+$/, '') === `P_USSR_${k}`), k);
});

test('URSS 1936: Bajkonur unito a Kzyl-Orda (nessun buco con un pezzo concentrico)', () => {
  const g = byId.get('P_USSR_QYZYLORDA').geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  assert.ok(polys.every((p) => p.length === 1), 'nessun buco');
  const inside = (x, y) => polys.some((p) => { let c = false; const r = p[0]; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i]; const [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; });
  assert.equal(inside(63.31, 45.62), true, 'Bajkonur (Tjuratam) è in Kzyl-Orda');
});

test('URSS 1936: bacini del dopoguerra segnati, laghi naturali no; etichette senza "(sponda"', () => {
  const lakes = read('lakes.json').features;
  const year = new Map(lakes.map((f) => [f.properties.id, f.properties.annoRiempimento]));
  for (const [id, y] of Object.entries(BACINI_DOPO_1936)) assert.equal(year.get(id), y, id);
  for (const id of ['L_BAIKAL', 'L_LADOGA', 'L_ARAL_SEA', 'L_BALKHASH', 'L_ISSYK_KUL']) assert.equal(year.get(id), undefined, id);
  const labels = JSON.stringify(read('labels.json').provinces);
  assert.equal(/SPONDA/.test(labels), false);
});

test('città dell\'URSS: nomi del 1936', () => {
  const names = new Map(read('citta_grandi.json').features.map((f) => [f.properties.id, f.properties.name]));
  const cases = { P_USSR_QYZYLORDA_CITTA_P1: 'Kzyl-Orda', P_USSR_PERM_CITTA_P1: "Perm'", P_USSR_ORENBURG_CITTA_P1: 'Orenburg', P_USSR_ULAN_UDE_CITTA_P1: 'Ulan-Ude' };
  for (const [id, n] of Object.entries(cases)) if (names.has(id)) assert.equal(names.get(id), n, id);
  for (const n of names.values()) assert.doesNotMatch(n, /^(Perovsk|Molotov|Čkalov|Elisavetpol|Verchneudinsk|Krasnokokšajsk)/);
});

test('Urali: rilievi tracciati a mano nel terreno, frazioni corrette e stima da raster conservata', async () => {
  const { RILIEVI_MANUALI, etichetta } = await import('../scripts/terrain/rilievi-manuali.js');
  const t = read('terrain.json');
  assert.deepEqual(t.rilievi.map((r) => r.id), RILIEVI_MANUALI.map((r) => r.id));
  const inside = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i]; const [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const dove = (x, y) => t.rilievi.find((r) => inside(x, y, r.ring))?.tipo ?? null;
  assert.equal(dove(60.12, 65.03), 'montagna', 'Narodnaja');
  assert.equal(dove(58.1, 54.25), 'montagna', 'Jamantau');
  assert.equal(dove(59.5, 58.0), 'collina', 'Urali medi');
  for (const [n, x, y] of [['Perm', 56.25, 58.0], ['Ufa', 55.96, 54.73], ['Čeljabinsk', 61.4, 55.15], ['Vorkuta', 64.0, 67.5], ['Salechard', 66.6, 66.53]]) assert.equal(dove(x, y), null, n);
  for (const id of ['P_USSR_BASHKORTOSTAN', 'P_USSR_CHELYABINSK', 'P_USSR_SVERDLOVSK']) {
    const p = t.province[id];
    assert.ok(p.frazioniStima && p.ritocco, id);
    assert.ok((p.frazioni.montagna ?? 0) + (p.frazioni.collina ?? 0) > (p.frazioniStima.montagna ?? 0) + (p.frazioniStima.collina ?? 0) + 0.1, id);
    assert.deepEqual({ terreno: p.terreno, secondario: p.secondario }, etichetta(p.frazioni));
  }
});
