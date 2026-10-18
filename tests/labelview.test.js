// Scelta dei nomi per zoom e vista (src/map/labelview.js) sui dati veri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOME_BOUNDS } from '../src/map/geo.js';
import { LABEL_DEFAULTS, pickStaticLabels } from '../src/map/labelview.js';

const labels = JSON.parse(readFileSync(new URL('../data/labels.json', import.meta.url), 'utf8'));
// come in MapCanvas: viewBox con un margine del 2 %, schermo largo 360 px
const PAD = HOME_BOUNDS.w * 0.02;
const VB = { x: HOME_BOUNDS.x - PAD, y: HOME_BOUNDS.y - PAD, w: HOME_BOUNDS.w + 2 * PAD, h: HOME_BOUNDS.h + 2 * PAD };
const PPU = 360 / VB.w;
// vista con zoom k e il punto (x, y) di mappa al centro dello schermo
const viewAt = (k, x = VB.x + VB.w / 2, y = VB.y + VB.h / 2) => ({ k, x: VB.x + VB.w / 2 - k * x, y: VB.y + VB.h / 2 - k * y });
const nat = (id) => labels.nations.find((n) => n.id === id);
const pick = (view, opts) => pickStaticLabels(labels, view, VB, PPU, [0], opts);
const kinds = (list) => list.reduce((a, l) => ({ ...a, [l.kind]: (a[l.kind] ?? 0) + 1 }), {});

test('zoom 1: si vedono solo nazioni (nessun nome di mare né di provincia)', () => {
  const list = pick(viewAt(1));
  const k = kinds(list);
  assert.ok(k.nation >= 3, `solo ${k.nation} nazioni`);
  assert.equal(k.sea ?? 0, 0);
  assert.equal(k.prov ?? 0, 0);
  assert.ok(list.some((l) => l.id === 'USSR'), 'la nazione più grande si legge a zoom 1');
});

test('una nazione piccola compare solo con più zoom, e prima di zoom 8 se è abbastanza grande', () => {
  const belgio = nat('BEL');
  const at = (k) => pick(viewAt(k, belgio.x, belgio.y)).some((l) => l.id === 'BEL' && l.kind === 'nation');
  assert.equal(at(1), false);
  assert.equal(at(2), false);
  assert.equal(at(5), true);
  // Gibilterra non raggiunge mai il corpo minimo con lo zoom massimo (40): nessun nome di nazione
  const gib = nat('GIB');
  assert.ok(gib.s * 40 * PPU < LABEL_DEFAULTS.nationMinPx);
  assert.equal(pick(viewAt(7.9, gib.x, gib.y)).some((l) => l.id === 'GIB'), false);
});

test('il corpo cresce con lo zoom e non supera il massimo', () => {
  const ussr = nat('USSR');
  const size = (k) => pick(viewAt(k, ussr.x, ussr.y)).find((l) => l.id === 'USSR');
  const a = size(1); const b = size(3);
  assert.ok(a && b);
  assert.ok(a.size * PPU * 1 <= LABEL_DEFAULTS.nationMaxPx + 1e-6 && b.size * PPU * 3 <= LABEL_DEFAULTS.nationMaxPx + 1e-6);
  const dense = nat('BEL');
  const small = (k) => pick(viewAt(k, dense.x, dense.y)).find((l) => l.id === 'BEL');
  assert.ok(small(7).size * 7 * PPU > small(5).size * 5 * PPU - 1e-9, 'a zoom maggiore il testo non si rimpicciolisce');
});

test('mari: compaiono da zoom 3 e solo con il livello ⚓ attivo; le nazioni lasciano il posto alle province da zoom 8', () => {
  const cx = nat('FRA'); // Europa occidentale
  const mid = pick(viewAt(3.2, cx.x - 3, cx.y - 4));
  assert.ok((kinds(mid).sea ?? 0) >= 1, 'nessun mare a zoom 3');
  assert.equal(pick(viewAt(3.2, cx.x - 3, cx.y - 4), { showSeas: false }).some((l) => l.kind === 'sea'), false);
  const deep = pick(viewAt(10, cx.x, cx.y));
  const k = kinds(deep);
  assert.ok((k.prov ?? 0) >= 5, `solo ${k.prov} province a zoom 10`);
  assert.equal(k.nation ?? 0, 0, 'a zoom 10 non restano nomi di nazione');
});

test('ogni nome sta nella vista, con posizione e righe coerenti', () => {
  for (const [k, id] of [[1, 'USSR'], [6, 'FRA'], [12, 'ITA']]) {
    const n = nat(id);
    const list = pick(viewAt(k, n.x, n.y));
    assert.ok(list.length > 0);
    for (const l of list) {
      assert.ok(l.rect[2] > 0 && l.rect[0] < 360 && l.rect[3] > 0 && l.rect[1] < VB.h * PPU, `${l.id}: fuori vista`);
      assert.ok(l.size > 0 && l.length > 0 && l.lines.length === l.lineLengths.length);
    }
  }
});

test('sigle: una sigla già mostrata non si ripete nella stessa schermata', () => {
  const n = nat('ITA');
  const list = pick(viewAt(14, n.x, n.y)).filter((l) => l.abbr);
  const names = list.map((l) => l.name);
  assert.equal(new Set(names).size, names.length, `sigle ripetute: ${names.join(', ')}`);
});

test('nessun nome di provincia a zoom basso e nessuno senza dati', () => {
  assert.equal(pick(viewAt(7.9)).filter((l) => l.kind === 'prov').length, 0);
  assert.deepEqual(pickStaticLabels({ nations: [], provinces: [], seas: [], charW: { nations: 0.66, provinces: 0.66, seas: 0.52 } }, viewAt(1), VB, PPU), []);
});
