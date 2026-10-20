// data/labels.json: il file è valido, è quello che produce lo script, e ogni nome sta davvero dentro il suo territorio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildLabelsFile } from '../scripts/build-labels.js';
import { validateLabels } from '../src/data/labels.js';
import { project, polygonsOf } from '../src/map/geo.js';
import { pointInRings, textRectOk, TEXT_H, LINE_STEP } from '../src/map/labelfit.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const labels = read('labels.json');
const sea = read('sea_zones.json');
const collection = await loadProvinces();
const ids = collection.features.map((f) => f.properties.id);
const seaIds = sea.zones.map((z) => z.id);
const owners = [...new Set(collection.features.map((f) => f.properties.owner))];
const proj = (poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat)));
const boxOf = (e, charW) => ({ w: Math.max(...e.l.map((l) => l.length)) * charW * e.s, h: (TEXT_H + (e.l.length - 1) * LINE_STEP) * e.s });
// angoli del rettangolo del testo (centro, rotazione in gradi) più il centro
const cornersOf = (e, charW) => {
  const { w, h } = boxOf(e, charW);
  const a = (e.r * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
  return [[0, 0], ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [(u * w) / 2, (v * h) / 2])].map(([u, v]) => [e.x + u * c - v * s, e.y + u * s + v * c]);
};

test('nomi: il file è valido (somme di controllo, id noti, corpi e righe)', () => {
  assert.deepEqual(validateLabels(labels, ids, seaIds, owners), []);
  assert.equal(labels.nations.length, owners.length, 'ogni nazione ha un nome');
  assert.equal(labels.seas.length, sea.zones.length, 'ogni zona marittima ha un nome');
  // ogni provincia non divisa ha una variante; una provincia divisa in sponde ne ha una sola (sulla sponda più grande)
  const madri = new Set(collection.features.filter((f) => !f.properties.sponda_fiume).map((f) => f.properties.id));
  const famiglie = new Set(collection.features.filter((f) => f.properties.sponda_fiume === true).map((f) => f.properties.parentProvince));
  assert.equal(labels.provinces.length, madri.size + famiglie.size, 'ogni provincia (o divisa in sponde) ha una sola variante');
  assert.equal(JSON.stringify(labels).includes('P_IRL_DUBLINO'), false, 'gli id delle province non devono comparire nel file (precache: un file per nazione)');
});

test('nomi: il validatore segnala somma di controllo diversa, id sconosciuti e corpi non validi', () => {
  assert.ok(validateLabels(labels, ids.slice(1), seaIds, owners).some((e) => e.includes('somma di controllo delle province')));
  assert.ok(validateLabels(labels, ids, seaIds.slice(1), owners).some((e) => e.includes('zone marittime')));
  const broken = { ...labels, nations: [{ ...labels.nations[0], s: 0 }, { ...labels.nations[1], id: 'XXX' }, { ...labels.nations[2], l: [] }], seas: labels.seas, provinces: labels.provinces };
  const errs = validateLabels(broken, ids, seaIds, owners);
  assert.ok(errs.some((e) => e.includes('corpo non positivo')) && errs.some((e) => e.includes('XXX sconosciuto')) && errs.some((e) => e.includes('righe non valide')));
  assert.ok(validateLabels({ ...labels, schema: 'x' }, ids, seaIds, owners)[0].includes('schema'));
});

test('nomi: rigenerando lo script si ottiene lo stesso file (nessun dato scritto a mano o vecchio)', async () => {
  const fresh = await buildLabelsFile();
  assert.deepEqual(JSON.parse(JSON.stringify(fresh)), labels, 'data/labels.json è vecchio: npm run build:labels');
});

test('nomi delle province: ogni variante sta dentro la sua provincia (rettangolo del testo ruotato)', () => {
  let checked = 0;
  for (const p of labels.provinces) {
    const f = collection.features[p.i];
    const pid = f.properties.id;
    const polys = polygonsOf(f).map(proj);
    for (const form of p.f) {
      const { w, h } = boxOf(form, labels.charW.provinces);
      const ok = polys.some((rings) => textRectOk(form.x, form.y, (form.r * Math.PI) / 180, w, h, rings));
      assert.ok(ok, `${pid}: la variante ${JSON.stringify(form.l)} esce dalla provincia`);
      checked += 1;
    }
  }
  assert.ok(checked > 1500, `solo ${checked} varianti controllate`);
});

test('nomi delle nazioni: centro e angoli del nome cadono su province della nazione', () => {
  const byOwner = new Map();
  for (const f of collection.features) {
    if (!byOwner.has(f.properties.owner)) byOwner.set(f.properties.owner, []);
    byOwner.get(f.properties.owner).push(...polygonsOf(f).map(proj));
  }
  for (const n of labels.nations) {
    const polys = byOwner.get(n.id);
    for (const [x, y] of cornersOf(n, labels.charW.nations)) {
      assert.ok(polys.some((rings) => pointInRings(x, y, rings)), `${n.id}: un punto del nome (${x.toFixed(2)}, ${y.toFixed(2)}) è fuori dalla nazione`);
    }
  }
});

test('nomi dei mari: centro e angoli del nome cadono in acqua, nella zona giusta', () => {
  const ringsOf = new Map(sea.zones.map((z) => [z.id, z.rings.map((r) => r.map(([lon, lat]) => project(lon, lat)))]));
  for (const s of labels.seas) {
    const rings = ringsOf.get(s.id);
    for (const [x, y] of cornersOf(s, labels.charW.seas)) {
      assert.ok(pointInRings(x, y, rings), `${s.id}: un punto del nome (${x.toFixed(2)}, ${y.toFixed(2)}) è fuori dall'acqua della zona`);
    }
  }
});

test('nomi: nazioni e province in maiuscolo, mari come nei dati; sigle uniche per nazione', () => {
  for (const n of labels.nations) assert.equal(n.l.join(' '), n.l.join(' ').toLocaleUpperCase('it'), n.id);
  const seaName = new Map(sea.zones.map((z) => [z.id, z.name]));
  for (const s of labels.seas) assert.equal(s.l.join(' ').replace(/- /g, '-').replace(/\s+/g, ' '), seaName.get(s.id).replace(/\s+/g, ' '), `${s.id}: parole cambiate`); // a capo dopo il trattino: nessuno spazio in più
  const seen = new Map();
  for (const p of labels.provinces) for (const form of p.f) {
    if (!form.a) continue;
    const f = collection.features[p.i];
    const key = `${f.properties.owner}|${form.l[0]}`;
    if (seen.has(key) && seen.get(key) !== p.i) assert.fail(`sigla ${form.l[0]} usata da ${collection.features[seen.get(key)].properties.id} e ${f.properties.id} nella stessa nazione`);
    seen.set(key, p.i);
  }
});
