// Dato «costiera» delle città (29/10/2026): ogni zona ha distanza dalla costa e un flag coerente; le forme restano valide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COSTIERA_KM, MAX_DIST_KM, SNAP_KM, MAX_AREA_CHANGE } from '../scripts/snap-cities-to-coast.js';

const cities = JSON.parse(readFileSync(new URL('../data/citta_grandi.json', import.meta.url), 'utf8')).features;
const zones = (prefix) => cities.filter((f) => f.properties.id.startsWith(prefix));

test('ogni zona ha distanzaCostaKm (numero ≥ 0 o null oltre i 30 km) e costiera coerente con la soglia', () => {
  for (const f of cities) {
    const { distanzaCostaKm: d, costiera, id } = f.properties;
    assert.ok(d === null || (typeof d === 'number' && d >= 0 && d <= MAX_DIST_KM), `${id}: distanza ${d}`);
    const fonte = f.properties.costieraFonte;
    assert.ok(fonte === 'geometria' || fonte === 'conoscenza', `${id}: fonte ${fonte}`);
    if (fonte === 'geometria') assert.equal(costiera, d !== null && d <= COSTIERA_KM, `${id}: flag incoerente con la distanza ${d}`);
  }
});

test('porti noti: costiere; città interne note: no', () => {
  for (const id of ['P_ITA_GENOVA_CITTA', 'P_ITA_NAPOLI_CITTA', 'P_ITA_TARANTO_CITTA', 'P_ITA_SALERNO_CITTA', 'P_POL_GDYNIA_CITTA', 'P_ITA_VENEZIA_CITTA', 'P_DEU_AMBURGO_CITTA', 'P_GBR_LONDRA_CITTA', 'P_NLD_ROTTERDAM_CITTA', 'P_DEU_KIEL_CITTA', 'P_USSR_MURMANSK_CITTA']) {
    assert.ok(zones(id).some((f) => f.properties.costiera), `${id} dovrebbe essere costiera`);
  }
  for (const id of ['P_CHE_ZURIGO_CITTA', 'P_ITA_ROMA_CITTA', 'P_USA_WASHINGTON_CITTA', 'P_TUR_BURSA_CITTA']) assert.ok(zones(id).every((f) => !f.properties.costiera), `${id} non è sul mare`);
});

test('le zone che il confine non tocca per 0,15–4 km sono poche (quelle a forma falsata restano ferme di proposito)', () => {
  const floating = cities.filter((f) => f.properties.distanzaCostaKm > 0.15 && f.properties.distanzaCostaKm <= SNAP_KM);
  assert.ok(floating.length <= 15, `troppe zone vicine alla costa ma staccate: ${floating.length}`);
  assert.ok(MAX_AREA_CHANGE > 0 && MAX_AREA_CHANGE < 1);
});

test('geometrie valide dopo l\'allineamento: anelli chiusi, almeno 4 punti, coordinate finite', () => {
  for (const f of cities) {
    for (const poly of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) {
      for (const ring of poly) {
        assert.ok(ring.length >= 4, `${f.properties.id}: anello con ${ring.length} punti`);
        assert.deepEqual(ring[0], ring[ring.length - 1], `${f.properties.id}: anello non chiuso`);
        assert.ok(ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), `${f.properties.id}: coordinate non valide`);
      }
    }
  }
});
