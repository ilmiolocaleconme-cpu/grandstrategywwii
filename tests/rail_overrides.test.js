// Ferrovie posteriori al 1936: declassamento (src/data/railOverrides.js, data/rail_overrides_1936.json) e confronto con le lunghezze 1936.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyRailOverrides, validateRailOverrides } from '../src/data/railOverrides.js';
import { validateLinks } from '../src/data/links.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));

// piccolo grafo: tre province in fila, A-B ferrovia (con ponte), B-C strada
const fixture = () => ({
  nodes: [{ p: 0, t: 4 }, { p: 1, t: 4 }, { p: 2, t: 2 }],
  links: [{ id: 'LK_0_1', a: 0, b: 1, t: 4, km: 10 }, { id: 'LK_1_2', a: 1, b: 2, t: 2, km: 8 }],
  segments: [
    { id: 'S1', link: 'LK_0_1', t: 4, k: 'rail', level: 2, rank: 4, c: [0, 0, 0.1, 0] },
    { id: 'S2', link: 'LK_1_2', t: 2, k: 'road', level: 1, rank: 99, c: [0.1, 0, 0.2, 0] },
  ],
  bridges: [{ id: 'B1', riverId: 'R_X', seg: 'S1', link: 'LK_0_1', t: 4, mode: 'rail', lon: 0.05, lat: 0, level: 2, road: 0, rail: 2, ang: 0, km: 2 }],
});
const ov = (to = 1) => ({ schema: 'rail-overrides-v1', quality: 'hypothesis', entries: [{ link: 'LK_0_1', to, basis: 'memory_unverified', reason: 'prova' }] });

test('declassamento: collegamento, tratti, ponti e sedi passano al gradino indicato', () => {
  const { file, applied } = applyRailOverrides(fixture(), ov(1));
  assert.deepEqual(applied, ['LK_0_1']);
  assert.equal(file.links[0].t, 1);
  assert.deepEqual([file.segments[0].t, file.segments[0].k, file.segments[0].level, file.segments[0].rank], [1, 'road', 0, 99]);
  const b = file.bridges[0];
  assert.deepEqual([b.t, b.mode, b.level, b.road, b.rail], [1, 'road', 1, 1, 0]);
  assert.equal(file.nodes[0].t, 1); // la sede senza altri collegamenti scende
  assert.equal(file.nodes[1].t, 2); // la sede con una strada di gradino 2 resta a 2
  assert.equal(file.nodes[2].t, 2);
});

test('declassamento: non modifica l\'ingresso ed è idempotente', () => {
  const src = fixture();
  const first = applyRailOverrides(src, ov(1));
  assert.equal(src.links[0].t, 4);
  const second = applyRailOverrides(first.file, ov(1));
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, ['LK_0_1']);
  assert.deepEqual(second.file.links, first.file.links);
});

test('validazione dell\'elenco: duplicati, gradino, motivo, collegamento sconosciuto', () => {
  const bad = { schema: 'rail-overrides-v1', quality: 'hypothesis', entries: [{ link: 'X', to: 4, basis: 'a', reason: 'b' }, { link: 'X', to: 1, basis: 'a' }, { link: 'Y', to: 1, basis: 'a', reason: 'b' }] };
  const e = validateRailOverrides(bad, { linkIds: new Set(['X']) });
  assert.ok(e.some((m) => /voce duplicata/.test(m)));
  assert.ok(e.some((m) => /gradino di arrivo/.test(m)));
  assert.ok(e.some((m) => /motivo e base/.test(m)));
  assert.ok(e.some((m) => /sconosciuto/.test(m)));
  assert.deepEqual(validateRailOverrides(ov(1), { linkIds: new Set(['LK_0_1']) }), []);
});

test('dati reali: ogni voce esiste, è già declassata in links.json e il file resta valido', async () => {
  const links = read('links.json');
  const o = read('rail_overrides_1936.json');
  const byId = new Map(links.links.map((l) => [l.id, l]));
  assert.deepEqual(validateRailOverrides(o, { linkIds: new Set(byId.keys()) }), []);
  assert.ok(o.entries.length > 0);
  for (const e of o.entries) {
    assert.equal(byId.get(e.link).t, e.to, `${e.link} non declassato: lanciare node scripts/apply-rail-overrides.js`);
    assert.ok(links.segments.filter((s) => s.link === e.link).every((s) => s.k === 'road'), `${e.link}: restano tratti di ferrovia`);
  }
  const provinces = await loadProvinces();
  const ids = provinces.features.map((f) => f.properties.id);
  assert.deepEqual(validateLinks(links, { provinceIds: ids }), []);
});

test('tavola 1936: nel modello i km di rotaia di ogni nazione non superano la lunghezza storica in esercizio', async () => {
  const links = read('links.json');
  const table = read('infrastructure/rail_length_1936.json');
  const provinces = await loadProvinces();
  const owner = provinces.features.map((f) => f.properties.owner);
  const lk = new Map(links.links.map((l) => [l.id, l]));
  const rad = Math.PI / 180;
  const hav = (a, b, c, d) => { const x = Math.sin(((d - b) * rad) / 2) ** 2 + Math.cos(b * rad) * Math.cos(d * rad) * Math.sin(((c - a) * rad) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(x)); };
  const km = new Map();
  for (const s of links.segments) {
    if (s.k !== 'rail') continue;
    let len = 0;
    for (let i = 0; i < s.c.length - 2; i += 2) len += hav(s.c[i], s.c[i + 1], s.c[i + 2], s.c[i + 3]);
    const o = owner[lk.get(s.link).a];
    km.set(o, (km.get(o) ?? 0) + len);
  }
  const ids = new Set();
  let compared = 0;
  for (const e of table.entries) {
    assert.ok(!ids.has(e.nation), `${e.nation}: voce duplicata`);
    ids.add(e.nation);
    assert.ok(e.km > 0 && table.pages[e.page], `${e.nation}: km o pagina non validi`);
    if (!e.comparable) continue;
    compared += 1;
    assert.ok((km.get(e.nation) ?? 0) <= e.km, `${e.nation}: ${Math.round(km.get(e.nation))} km di ferrovia nel modello contro ${e.km} nel ${e.year}`);
  }
  assert.ok(compared >= 20);
});
