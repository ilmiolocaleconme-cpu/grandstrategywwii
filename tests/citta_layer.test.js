// Livello delle città a parte (src/map/citta.js): dati, modello e punto toccato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withCities, markCapitals, cityNamesAt, nearestCityAt, citySnapTolerance, CITY_SNAP_ZOOM, CITY_SNAP_PX, CAPITAL_NAME_ZOOM, CITY_NAME_ZOOM, PART_NAME_ZOOM } from '../src/map/citta.js';
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
  const it = cityModel.items.find((i) => i.props.cittaId === 'P_DEU_BERLINO_CITTA' && i.props.name === 'Berlino');
  assert.ok(it, 'manca Berlino città');
  const [x, y] = centre(cityModel, it);
  const hit = pickCityAt(cityModel, x, y);
  assert.ok(hit, 'nessuna città sotto il centro di Berlino');
  assert.equal(hit.props.cittaId, 'P_DEU_BERLINO_CITTA');
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
  const parti = markCapitals(cities, nations).filter((f) => f.properties.capitale);
  assert.ok(parti.some((f) => /^Roma (sud|nord|est|ovest)/.test(f.properties.name) && !f.properties.capital), 'le altre zone di Roma hanno il nome, senza stella');
  assert.equal(new Set(nomi).size, nomi.length, 'una capitale è marcata una sola volta');
  assert.ok(marcate.length <= nations.length, `capitali marcate: ${marcate.length}`);
  assert.ok(marcate.length < cities.length / 5, 'il nome sulla mappa solo per le capitali');
});

test('zoom dei nomi: lontano nessuna città, da zoom medio solo le capitali, da vicino tutte le città', () => {
  const fake = [
    { props: { kind: 'citta', capitale: true, capital: true, name: 'Roma' } },
    { props: { kind: 'citta', capitale: true, name: 'Roma sud' } },
    { props: { kind: 'citta', name: 'Milano' } },
    { props: { kind: 'sponda', name: 'X' } },
  ];
  assert.deepEqual(cityNamesAt(fake, 1).length, 0, 'zoom basso');
  assert.deepEqual(cityNamesAt(fake, CAPITAL_NAME_ZOOM).map((i) => i.props.name), ['Roma'], 'zoom medio: solo la capitale a nord');
  assert.deepEqual(cityNamesAt(fake, CITY_NAME_ZOOM).map((i) => i.props.name), ['Roma', 'Milano'], 'zoom vicino: le parti sud solo al massimo');
  assert.deepEqual(cityNamesAt(fake, PART_NAME_ZOOM).map((i) => i.props.name), ['Roma', 'Roma sud', 'Milano'], 'massimo zoom');
});

test('tocco città: la più vicina entro la tolleranza, altrimenti niente', () => {
  const box = (x, y, w, h, name) => ({ props: { kind: 'citta', name }, bbox: { x, y, w, h }, id: name });
  const items = [box(-5, -5, 1, 1, 'A'), box(10, 10, 0.2, 0.2, 'B'), box(0.4, 0.4, 0.1, 0.1, 'C')];
  assert.equal(nearestCityAt(items, 0.5, 0.5, 0.3)?.id, 'C');
  assert.equal(nearestCityAt(items, 50, 50, 1), null);
});

test('massimo zoom più alto del minimo di tocco: tutte le città si possono toccare da vicino', async () => {
  const { MAX_K } = await import('../src/map/geo.js');
  assert.ok(MAX_K >= 100, `zoom massimo ${MAX_K}`);
  assert.ok(PART_NAME_ZOOM < MAX_K, 'le parti secondarie hanno un nome solo prima del massimo');
});

test('aggancio alla città: solo da vicino; a vista d\'insieme il tocco va alla provincia', () => {
  const items = [{ id: 'C', props: { kind: 'citta' }, bbox: { x: 0, y: 0, w: 1, h: 1 } }];
  assert.equal(citySnapTolerance(1, 10), 0, 'zoom 1: nessun aggancio');
  assert.equal(citySnapTolerance(CITY_SNAP_ZOOM - 0.01, 10), 0, 'appena sotto la soglia: nessun aggancio');
  assert.equal(citySnapTolerance(CITY_SNAP_ZOOM, 10), CITY_SNAP_PX / (10 * CITY_SNAP_ZOOM), 'dalla soglia: 16 px');
  assert.ok(citySnapTolerance(20, 10) < citySnapTolerance(CITY_SNAP_ZOOM, 10), 'più si ingrandisce, meno unità di mappa vale il margine');
  // senza aggancio nemmeno un tocco quasi sul centro sceglie la città (sceglie la provincia: ci pensa pickProvinceAt)
  assert.equal(nearestCityAt(items, 0.5, 0.5, citySnapTolerance(1, 10)), null);
  assert.equal(nearestCityAt(items, 0.5, 0.5, 0), null);
  assert.equal(nearestCityAt(items, 0.5, 0.5, citySnapTolerance(CITY_SNAP_ZOOM, 10) * 1000)?.id, 'C');
});

test('zone urbane: contorni puliti (meno di 90 000 vertici in tutto) e 2089 zone (732 di prima + città del resto del mondo)', async () => {
  const { readFileSync } = await import('node:fs');
  const z = JSON.parse(readFileSync(new URL('../data/citta_grandi.json', import.meta.url), 'utf8')).features;
  assert.equal(z.length, 2089);
  const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  assert.ok(z.reduce((n, f) => n + polys(f.geometry).reduce((m, p) => m + p.reduce((k, r) => k + r.length, 0), 0), 0) < 90000);
});
