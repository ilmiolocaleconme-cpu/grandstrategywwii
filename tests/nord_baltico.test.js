import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { featureAreaKm2 } from '../src/map/geo.js';
import { madreId, vistaProvince } from './famiglie.js';

// Baltici (EST, LVA, LTU con Memel), Danimarca, Norvegia, Svezia, Finlandia.
// Natural Earth 10m admin-1 v5.1.1 (confini attuali), qualita hypothesis. Soglie larghe: intercettano rotture, non certificano precisione.

const provinces = vistaProvince(await loadProvinces());
const index = buildProvinceIndex(provinces);
const byOwner = (o) => provinces.features.filter((f) => f.properties.owner === o);
const at = (lon, lat) => index.provincesAt(lon, lat).map((f) => madreId(f.properties.id));
const total = (fs) => fs.reduce((sum, f) => sum + featureAreaKm2(f), 0);

const N = { EST: 10, LVA: 6, LTU: 11, DNK: 5, NOR: 20, SWE: 21, FIN: 19 };
const AREA = { EST: [42000, 49000], LVA: [60000, 67000], LTU: [51000, 58000], DNK: [40000, 46000], NOR: [300000, 335000], SWE: [425000, 460000], FIN: [315000, 345000] };

test('conteggi, prefisso id, qualita, fonte e licenza', () => {
  for (const [o, n] of Object.entries(N)) {
    const fs = byOwner(o);
    assert.equal(fs.length, n, o);
    assert.ok(fs.every((f) => f.properties.id.startsWith(`P_${o}_`) && f.properties.borderQuality === 'hypothesis' && f.id === f.properties.id), o);
    assert.ok(fs.every((f) => f.properties.source && f.properties.license), o);
  }
});

test('aree totali plausibili (confini attuali, senza territori ceduti o esterni)', () => {
  for (const [o, [lo, hi]] of Object.entries(AREA)) {
    const a = total(byOwner(o));
    assert.ok(a > lo && a < hi, `${o}: ${Math.round(a)} km2`);
  }
});

test('citta note nella provincia attesa', () => {
  const C = [
    [24.75, 59.44, 'P_EST_HARJU'], [28.05, 59.38, 'P_EST_VIRU'],
    [24.1, 56.95, 'P_LVA_RIGA'], [26.52, 55.87, 'P_LVA_LATGALE'],
    [23.9, 54.9, 'P_LTU_KAUNAS'],
    [12.52, 55.68, 'P_DNK_HOVEDSTADEN'], [10.2, 56.15, 'P_DNK_MIDTJYLLAND'], [9.92, 57.05, 'P_DNK_NORDJYLLAND'], [9.8, 54.95, 'P_DNK_SYDDANMARK'], [14.7, 55.1, 'P_DNK_HOVEDSTADEN'],
    [10.75, 59.91, 'P_NOR_OSLO'], [19.1, 69.7, 'P_NOR_TROMS'], [17.5, 68.42, 'P_NOR_NORDLAND'], [5.7, 58.93, 'P_NOR_ROGALAND'], [30.05, 69.73, 'P_NOR_FINNMARK'],
    [18.07, 59.33, 'P_SWE_STOCKHOLM'], [13.0, 55.6, 'P_SWE_SKANE'], [20.2, 67.85, 'P_SWE_NORRBOTTEN'], [18.3, 57.64, 'P_SWE_GOTLAND'], [11.97, 57.7, 'P_SWE_VASTRA_GOTALAND'],
    [24.94, 60.17, 'P_FIN_UUSIMAA'], [19.94, 60.1, 'P_FIN_ALAND'], [25.7, 66.5, 'P_FIN_LAPLAND'], [22.27, 60.45, 'P_FIN_FINLAND_PROPER'],
  ];
  for (const [lon, lat, id] of C) assert.deepEqual(at(lon, lat), [id], `${lon},${lat}`);
});

test('Memel (Klaipeda) e provincia della Lituania, stima a mano dichiarata hypothesis', () => {
  assert.deepEqual(at(21.13, 55.71), ['P_LTU_MEMEL']);
  const m = provinces.features.find((f) => f.properties.id === 'P_LTU_MEMEL');
  assert.equal(m.properties.owner, 'LTU');
  assert.equal(m.properties.borderQuality, 'hypothesis');
  const a = featureAreaKm2(m);
  assert.ok(a > 1800 && a < 2700, `Memel: ${Math.round(a)} km2`);
});

test('Vilnius resta polacca nel 1936', () => {
  assert.deepEqual(at(25.28, 54.69), ['P_POL_WILNO_VOIVODESHIP']);
});

test('nessuna sovrapposizione (campionamento 0,02 gradi) tra nuovi Stati e con POL, DEU, DANZIG', () => {
  const near = new Set(['EST', 'LVA', 'LTU', 'DNK', 'NOR', 'SWE', 'FIN', 'POL', 'DEU', 'DANZIG']);
  let multi = 0;
  for (let lat = 53.5; lat <= 71.2; lat += 0.02) {
    for (let lon = 4.5; lon <= 31.6; lon += 0.02) {
      const hits = index.provincesAt(lon, lat).filter((f) => near.has(f.properties.owner));
      if (new Set(hits.map((f) => f.properties.owner)).size > 1 || hits.filter((f) => f.properties.owner in N).length > 1) multi++;
    }
  }
  assert.ok(multi <= 5, // le sovrapposizioni DEU/DEU sull'Elba sono preesistenti e qui ignorate
     `punti con piu province: ${multi}`);
});
