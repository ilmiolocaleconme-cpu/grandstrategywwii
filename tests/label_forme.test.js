import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMapModel, labelFitOf, pickLabels, labelForms, polygonsOf, project, HOME_BOUNDS } from '../src/map/geo.js';
import { fitLabel, splitName, shortName, CHAR_W, TEXT_H, LINE_STEP } from '../src/map/labelfit.js';

// Forme alternative dei nomi (due righe, sigla) per le province il cui nome intero non entra con corpo comodo.

const inside = (x, y, rings) => {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
};
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

test('splitName: due righe bilanciate; null se non c\'è un punto di rottura sensato', () => {
  assert.deepEqual(splitName('Anatoliki Makedonia kai Thraki'), ['Anatoliki Makedonia', 'kai Thraki']);
  assert.deepEqual(splitName('Rabat - Salé - Zemmour - Zaer').length, 2);
  assert.equal(splitName('Brecknockshire'), null, 'una parola sola non si spezza');
  assert.equal(splitName('Ain'), null);
  const [a, b] = splitName('Caernarvonshire e Merionethshire');
  assert.equal(`${a} ${b}`.replace(/\s+/g, ' '), 'Caernarvonshire e Merionethshire');
});

test('shortName: il campo short dei dati ha la precedenza; altrimenti iniziali o prime lettere; mai più lungo del nome', () => {
  assert.equal(shortName('Anatoliki Makedonia kai Thraki'), 'AMT');
  assert.equal(shortName('Brecknockshire'), 'Brec.');
  assert.equal(shortName('Westfalen-Süd'), 'WS');
  assert.equal(shortName('Marrakech - Tensift - Al Haouz', 'MTH'), 'MTH');
  assert.equal(shortName('Roma', 'LAZIO'), null, 'una sigla più lunga del nome non serve');
  assert.equal(shortName('Roma'), null, 'nome già breve: nessuna sigla');
  for (const n of ['Montgomeryshire, Radnorshire e Brecknockshire', 'Protettorato spagnolo del Marocco (zona nord)']) {
    const s = shortName(n);
    assert.ok(s && s.length < n.length, n);
  }
});

test('fitLabel con due righe: in una forma tozza il corpo cresce rispetto a una riga sola', () => {
  const sq = [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]];
  const one = fitLabel(sq, 20);
  const two = fitLabel(sq, 10, { lines: 2 });
  assert.ok(one && two);
  assert.ok(two.size > one.size * 1.5, `una riga ${one.size.toFixed(3)} / due righe ${two.size.toFixed(3)}`);
  // il blocco a due righe (altezza TEXT_H + LINE_STEP em) sta dentro il rettangolo
  const w = 10 * CHAR_W * two.size;
  const h = (TEXT_H + LINE_STEP) * two.size;
  assert.ok(w <= 10 && h <= 8, `blocco ${w.toFixed(2)} x ${h.toFixed(2)}`);
});

test('labelForms: dall\'intero alla sigla, con la riga più lunga indicata', () => {
  const f = labelForms('ANATOLIKI MAKEDONIA KAI THRAKI');
  assert.equal(f[0].lines.length, 1);
  assert.equal(f[1].lines.length, 2);
  assert.equal(f[1].longest, Math.max(...f[1].lines.map((l) => l.length)));
  assert.ok(f[2].abbr && f[2].lines[0] === 'AMT');
  assert.equal(labelForms('ROMA').length, 1);
});

test('pickLabels con variants su province reali: più nomi, nessuna sovrapposizione, blocchi dentro la provincia', async () => {
  const provinces = await loadProvinces();
  const model = buildMapModel(provinces);
  const byId = new Map(model.items.map((it) => [it.id, it]));
  const vb = { ...HOME_BOUNDS };
  const pxPerUnit = 360 / vb.w;
  let multi = 0;
  let abbr = 0;
  let gained = 0;
  for (const k of [3, 5, 8]) {
    for (const [fx, fy] of [[0.55, 0.2], [0.45, 0.4]]) {
      const view = { k, x: -(vb.x + vb.w * fx) * k + vb.w / 2 + vb.x, y: -(vb.y + vb.h * fy) * k + vb.h / 2 + vb.y };
      const base = pickLabels(model.items, view, vb, pxPerUnit, [0], { minPx: 5 });
      const rich = pickLabels(model.items, view, vb, pxPerUnit, [0], { minPx: 5, variants: true });
      assert.ok(rich.length >= base.length - 2, `k=${k}: ${rich.length} con forme alternative, ${base.length} senza`);
      gained += Math.max(0, rich.length - base.length);
      for (let i = 0; i < rich.length; i += 1) for (let j = i + 1; j < rich.length; j += 1) {
        assert.ok(!overlap(rich[i].rect, rich[j].rect), `k=${k}: ${rich[i].name} / ${rich[j].name}`);
      }
      const abbrs = rich.filter((l) => l.abbr).map((l) => l.lines[0]);
      assert.equal(new Set(abbrs).size, abbrs.length, `k=${k}: sigle ripetute ${abbrs.join(',')}`);
      for (const l of rich) {
        assert.ok(l.lines && l.lineLengths && l.lines.length === l.lineLengths.length);
        if (l.lines.length > 1) multi += 1;
        if (l.abbr) abbr += 1;
        // il blocco di testo (tutte le righe) sta dentro la provincia: campionamento fitto
        const it = byId.get(l.id);
        const polys = polygonsOf(it.feature).map((p) => p.map((r) => r.map(([lon, lat]) => project(lon, lat))));
        const host = polys.find((p) => inside(l.x, l.y, p)) ?? polys[0];
        const n = l.lines.length;
        const a = (l.angle * Math.PI) / 180;
        const hh = l.size * (TEXT_H + (n - 1) * LINE_STEP) * 0.97;
        const ww = Math.max(...l.lineLengths) * 0.97;
        for (let i = 0; i <= 20; i += 1) for (let j = 0; j <= 4; j += 1) {
          const u = -ww / 2 + (ww * i) / 20;
          const v = -hh / 2 + (hh * j) / 4;
          assert.ok(inside(l.x + Math.cos(a) * u - Math.sin(a) * v, l.y + Math.sin(a) * u + Math.cos(a) * v, host), `k=${k}: ${l.name} esce dalla provincia`);
        }
      }
    }
  }
  console.log(`# forme alternative: ${multi} su due righe, ${abbr} sigle, ${gained} nomi in più rispetto al solo nome intero`);
  assert.ok(multi + abbr > 0, 'nessuna forma alternativa scelta: la cascata non serve a niente su questi dati');
  assert.ok(gained > 0, 'nessun nome guadagnato rispetto al solo nome intero');
});

test('pickLabels senza variants resta identico (la mappa SVG non cambia)', async () => {
  const provinces = await loadProvinces();
  const model = buildMapModel(provinces);
  const vb = { ...HOME_BOUNDS };
  const view = { k: 5, x: -(vb.x + vb.w * 0.55) * 5 + vb.w / 2 + vb.x, y: -(vb.y + vb.h * 0.2) * 5 + vb.h / 2 + vb.y };
  const out = pickLabels(model.items, view, vb, 360 / vb.w);
  for (const l of out) assert.ok(!('lines' in l) && !('abbr' in l), l.name);
  assert.ok(out.length > 0);
});

test('assignShortNames: ogni sigla è unica nella sua nazione e livello; il campo short dei dati vince; mai più lunga del nome', async () => {
  const { assignShortNames } = await import('../src/map/labelfit.js');
  const provinces = await loadProvinces();
  const entries = provinces.features.map((f) => ({ id: f.properties.id, name: f.properties.nameLocal ?? f.properties.name, group: f.properties.owner, area: 1, explicit: f.properties.short }));
  const map = assignShortNames(entries);
  assert.equal(map.size, entries.length);
  const seen = new Map();
  let withExplicit = 0;
  let withCompact = 0;
  let naiveClash = 0;
  const naive = new Map();
  for (const e of entries) {
    const list = map.get(e.id);
    assert.ok(Array.isArray(list));
    for (const [i, sg] of list.entries()) {
      assert.ok(sg.length < e.name.length, `${e.name} -> ${sg}`);
      const key = `${e.group}|${i}|${sg.toUpperCase()}`;
      assert.ok(!seen.has(key), `sigla ripetuta in ${e.group}: ${sg} (${seen.get(key)} / ${e.name})`);
      seen.set(key, e.name);
    }
    if (list.length) withExplicit += 1;
    if (list.some((x) => /^[A-ZÀ-Ý]{2,}$/.test(x))) withCompact += 1;
    const n = shortName(e.name);
    if (n) { const k = `${e.group}|${n.toUpperCase()}`; if (naive.has(k)) naiveClash += 1; else naive.set(k, e.name); }
  }
  console.log(`# sigle: ${withExplicit} province con almeno una sigla (${withCompact} anche compatta); con il metodo semplice le collisioni nella stessa nazione erano ${naiveClash}`);
  assert.ok(withExplicit > 300);
  // il campo short dei dati ha la precedenza e non viene toccato
  const m2 = assignShortNames([{ id: 'a', name: 'Pohjois-Savo', group: 'FIN', area: 5, explicit: 'P-S' }, { id: 'b', name: 'Pohjois-Karjala', group: 'FIN', area: 9 }]);
  assert.deepEqual(m2.get('a'), ['P-S']);
  assert.ok(m2.get('b').length >= 1 && m2.get('b')[0] !== 'P-S');
  // due province con le stesse iniziali nella stessa nazione ricevono sigle diverse; la più grande ha la più semplice
  const m3 = assignShortNames([{ id: 'x', name: 'Pohjois-Savo', group: 'FIN', area: 2 }, { id: 'y', name: 'Pohjois-Karjala', group: 'FIN', area: 8 }, { id: 'z', name: 'Pohjois-Pohjanmaa', group: 'FIN', area: 9 }]);
  const all = ['x', 'y', 'z'].map((k) => m3.get(k));
  const compacts = all.map((l) => l.find((q) => /^[A-Z]{2}$/.test(q))).filter(Boolean);
  assert.equal(new Set(compacts).size, compacts.length, `sigle compatte ripetute: ${compacts}`);
  assert.equal(m3.get('z')[0].startsWith('P.'), true);
});
