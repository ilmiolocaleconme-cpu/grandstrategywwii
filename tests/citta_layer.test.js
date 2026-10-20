// Livello delle città a parte (src/map/citta.js): dati, modello e punto toccato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withCities, markCapitals } from '../src/map/citta.js';
import nations from '../data/nations.json' with { type: 'json' };
import { buildCanvasModel, pickProvinceAt } from '../src/map/canvasModel.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const cities = JSON.parse(readFileSync(new URL('../data/citta_grandi.json', import.meta.url), 'utf8')).features;
const provinces = await loadProvinces();
const provModel = buildCanvasModel(provinces);
const allModel = buildCanvasModel(withCities(provinces, cities));
const cityModel = { items: allModel.items.filter((i) => i.props.kind === 'citta'), coords: allModel.coords, ringOffsets: allModel.ringOffsets };
const pickCityAt = (_m, x, y) => pickProvinceAt(allModel, x, y)?.props.kind === 'citta' ? pickProvinceAt(allModel, x, y) : null;

// centro approssimato di un'area: media dei vertici dell'anello esterno, in unità di mappa
function centre(model, item) {
  const s = model.ringOffsets[item.ringStart];
  const e = model.ringOffsets[item.ringStart + 1];
  let x = 0; let y = 0;
  for (let i = s; i < e; i += 1) { x += model.coords[2 * i]; y += model.coords[2 * i + 1]; }
  return [x / (e - s), y / (e - s)];
}

test('dati: ogni città ha id, nome, nazione e provincia madre esistente', () => {
  const ids = new Set(provinces.features.map((f) => f.properties.id));
  assert.ok(cities.length > 500, `città: ${cities.length}`);
  assert.equal(new Set(cities.map((c) => c.id)).size, cities.length, 'id duplicati');
  for (const c of cities) {
    assert.ok(c.properties.name, c.id);
    assert.ok(c.properties.owner, c.id);
    assert.ok(ids.has(c.properties.parentProvince) || provinces.features.some((f) => f.id?.startsWith(`${c.properties.parentProvince}_SP`)), `${c.id} -> ${c.properties.parentProvince}`);
  }
});

test('modello delle città: una voce per città, con il nome nelle proprietà', () => {
  assert.ok(cityModel.items.length >= cities.length, `voci città nel modello: ${cityModel.items.length}`);
  assert.ok(cityModel.items.every((it) => typeof it.props.name === 'string'));
});

test('toccare dentro Berlino trova la città di Berlino, non il Gau', () => {
  const it = cityModel.items.find((i) => i.id === 'P_DEU_BERLINO_CITTA');
  assert.ok(it, 'manca Berlino città');
  const [x, y] = centre(cityModel, it);
  const hit = pickCityAt(cityModel, x, y);
  assert.ok(hit, 'nessuna città sotto il centro di Berlino');
  assert.equal(hit.id, 'P_DEU_BERLINO_CITTA');
  assert.equal(hit.props.parentProvince, 'P_DEU_BERLIN');
});

test('toccare in mezzo all’Atlantico non trova nessuna città', () => {
  // lon -40, lat 40 in unità di mappa (stessa proiezione di canvasModel: x = lon * COS0, y = -lat)
  const COS0 = 100 / 360;
  assert.equal(pickCityAt(cityModel, -40 * COS0, -40), null);
});

test('il Gau di Berlino resta sotto la città: il tocco sul Gau trova la provincia', () => {
  const gau = provModel.byId.get('P_DEU_BERLIN');
  const [x, y] = centre(provModel, gau);
  assert.equal(pickProvinceAt(provModel, x, y)?.id, 'P_DEU_BERLIN');
});

test('ogni città sta nel riquadro della sua provincia madre (o di una sua sponda)', () => {
  const byId = new Map(provModel.items.map((i) => [i.id, i]));
  for (const it of cityModel.items) {
    const madre = it.props.parentProvince;
    if (!madre) continue; // città già presenti nei dati come province (es. Bucarest): la madre è sé stessa
    const boxes = [byId.get(madre), ...provModel.items.filter((p) => p.id.startsWith(`${madre}_SP`))].filter(Boolean);
    assert.ok(boxes.length > 0, `${it.id}: nessuna provincia madre`);
    const b = it.bbox;
    const dentro = boxes.some((m) => b.x >= m.bbox.x - 0.5 && b.x + b.w <= m.bbox.x + m.bbox.w + 0.5 && b.y >= m.bbox.y - 0.5 && b.y + b.h <= m.bbox.y + m.bbox.h + 0.5);
    assert.ok(dentro, `${it.id} fuori dalla provincia madre ${madre}`);
  }
});

test('le città sono province cliccabili: stesso modello, aggiunte in coda (vincono sul tocco)', () => {
  const ids = allModel.items.map((i) => i.id);
  assert.equal(ids.length, provinces.features.length + cities.length);
  assert.equal(ids.at(-1), cities.at(-1).id);
  const nomi = new Set(nations.map((n) => n.capital));
  assert.ok(nomi.has('Berlino') && nomi.has('Roma'));
});

test('solo le capitali delle nazioni sono marcate (con il nome sulla mappa)', () => {
  const marcate = markCapitals(cities, nations).filter((f) => f.properties.capital);
  const nomi = marcate.map((f) => `${f.properties.owner}:${f.properties.name.replace(/ \(parte .+\)$/, '')}`).sort();
  assert.ok(nomi.includes('DEU:Berlino') && nomi.includes('ITA:Roma'), nomi.join(', '));
  assert.equal(new Set(nomi).size, nomi.length, 'una capitale è marcata una sola volta');
  assert.ok(marcate.length <= nations.length, `capitali marcate: ${marcate.length}`);
  assert.ok(marcate.length < cities.length / 5, 'il nome sulla mappa solo per le capitali');
});
