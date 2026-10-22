// data/terrain.json: valido, completo (tranne la Chukotka, a cavallo dell'antimeridiano), coerente con la tinta del terreno
// e con luoghi noti. Il terreno è una STIMA da raster Natural Earth (3,7 km): i test controllano coerenza, non quote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { TERRAIN_COLORS, TERRAIN_LABEL, TERRAIN_TYPES, motherId, terrainOf, validateTerrain, withTerrain } from '../src/data/terrain.js';
import { provinceFill, LAYERS } from '../src/map/geo.js';

const doc = JSON.parse(readFileSync(new URL('../data/terrain.json', import.meta.url), 'utf8'));
const collection = await loadProvinces();
const motherIds = [...new Set(collection.features.map((f) => motherId(f.properties)))];
const SENZA_DATO = ['P_USSR_CHUKCHI_AUTONOMOUS_OKRUG'];

test('terrain.json è valido e copre tutte le province madri tranne la Chukotka', () => {
  assert.deepEqual(validateTerrain(doc, motherIds, SENZA_DATO), []);
  assert.equal(Object.keys(doc.province).length, motherIds.length - SENZA_DATO.length);
  for (const id of SENZA_DATO) assert.ok(motherIds.includes(id) && !(id in doc.province));
});

test('il validatore rifiuta dati rotti', () => {
  const clone = () => JSON.parse(JSON.stringify(doc));
  const a = clone(); a.province.P_AUT_TIROL.terreno = 'lava';
  assert.ok(validateTerrain(a, motherIds, SENZA_DATO).some((e) => e.includes('P_AUT_TIROL')));
  const b = clone(); b.province.P_AUT_TIROL.frazioni = { montagna: 0.3 };
  assert.ok(validateTerrain(b, motherIds, SENZA_DATO).some((e) => e.includes('sommano')));
  const c = clone(); c.province.P_FALSA = c.province.P_AUT_TIROL;
  assert.ok(validateTerrain(c, motherIds, SENZA_DATO).some((e) => e.includes('P_FALSA')));
  const d = clone(); delete d.province.P_AUT_TIROL;
  assert.ok(validateTerrain(d, motherIds, SENZA_DATO).some((e) => e.includes('senza terreno')));
  const e = clone(); e.province.P_AUT_TIROL.secondario = e.province.P_AUT_TIROL.terreno;
  assert.ok(validateTerrain(e, motherIds, SENZA_DATO).some((x) => x.includes('secondario')));
});

test('ogni tipo ha colore ed etichetta, tutti distinti', () => {
  for (const t of [...TERRAIN_TYPES, 'urbano']) { assert.ok(TERRAIN_COLORS[t], t); assert.ok(TERRAIN_LABEL[t], t); }
  assert.equal(new Set(Object.values(TERRAIN_COLORS)).size, TERRAIN_TYPES.length + 1);
});

test('luoghi noti (soglie larghe: è una stima)', () => {
  const t = (id) => doc.province[id]?.terreno;
  assert.equal(t('P_AUT_TIROL'), 'montagna');
  assert.equal(t('P_CHE_VALAIS'), 'montagna');
  assert.equal(t('P_NLD_ZUID_HOLLAND'), 'pianura');
  assert.equal(t('P_NLD_NOORD_HOLLAND'), 'pianura');
  assert.equal(t('P_BEL_BRABANT'), 'pianura');
  assert.equal(t('P_USSR_KIEV'), 'pianura');
  assert.equal(t('P_LBA_TRIPOLI'), 'deserto');
  assert.equal(t('P_POL_POLESIE_VOIVODESHIP'), 'palude');
  assert.equal(t('P_USSR_KARELIA'), 'foresta');
  assert.equal(t('P_FIN_NORTH_KARELIA'), 'foresta');
  assert.ok(doc.province.P_FIN_LAPLAND.frazioni.tundra > 0.1, 'la Lapponia ha tundra a nord');
  assert.ok(doc.province.P_ITA_LOMBARDY.frazioni.pianura > 0.3 && doc.province.P_ITA_LOMBARDY.frazioni.montagna > 0.3, 'Lombardia: pianura e Alpi');
});

test('rugosità e tinta sono coerenti col tipo: le montagne sono più rugose delle pianure', () => {
  const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const rug = (tipo) => med(Object.values(doc.province).filter((v) => v.terreno === tipo).map((v) => v.rugosita));
  assert.ok(rug('montagna') > rug('collina') && rug('collina') > rug('pianura'), `${rug('montagna')} ${rug('collina')} ${rug('pianura')}`);
});

test('sponde dei fiumi ereditano il terreno della madre; la collezione in ingresso non cambia', () => {
  const sponde = collection.features.filter((f) => f.properties.parentProvince && f.properties.kind !== 'citta');
  assert.ok(sponde.length > 700); // 778 dopo la fusione delle sponde sotto 200 km²
  const prima = JSON.stringify(collection.features[0].properties);
  const merged = withTerrain(collection, doc);
  assert.notEqual(merged, collection);
  assert.equal(JSON.stringify(collection.features[0].properties), prima);
  assert.ok(!('terreno' in collection.features[0].properties));
  let conTerreno = 0;
  for (const f of merged.features) {
    if (f.properties.kind === 'citta') continue; // le zone urbane restano come sono (urbano) e non ricevono il terreno della madre
    const atteso = terrainOf(f.properties, doc);
    assert.equal(f.properties.terreno, atteso);
    if (atteso) conTerreno += 1;
  }
  const nonUrbane = merged.features.filter((f) => f.properties.kind !== 'citta').length;
  assert.ok(conTerreno >= nonUrbane - 20, `${conTerreno} su ${nonUrbane}`);
  const tirol = merged.features.find((f) => f.properties.parentProvince === 'P_AUT_TIROL');
  if (tirol) assert.equal(tirol.properties.terreno, 'montagna');
});

test('livello Terreno: colore per tipo, grigio senza dato', () => {
  assert.ok(LAYERS.some((l) => l.id === 'terrain'));
  assert.equal(provinceFill({ terreno: 'foresta' }, 'terrain'), TERRAIN_COLORS.foresta);
  assert.equal(provinceFill({}, 'terrain'), '#777');
  assert.equal(withTerrain(null, doc), null);
  assert.equal(withTerrain(collection, null), collection);
});
