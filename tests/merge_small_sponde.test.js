// Fusione delle sponde troppo piccole (scripts/merge-small-sponde.js): niente schegge, niente buchi, nessun id perso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SPONDA_KM2, areaKm2, mergeSmall, sharedEdges, stitch } from '../scripts/merge-small-sponde.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const piece = (n, geometry, mother = 'P_X_Y') => ({ type: 'Feature', id: `${mother}_SP${n}`, properties: { id: `${mother}_SP${n}`, name: `Y (sponda ${String.fromCharCode(64 + n)})`, nameLocal: `Y (sponda ${String.fromCharCode(64 + n)})`, owner: 'X', parentProvince: mother, sponda_fiume: true, sponda: String(n) }, geometry });

test('ricucitura: due quadrati che confinano diventano un solo anello, area somma', () => {
  const a = sq(0, 40, 1, 41); const b = sq(1, 40, 2, 41);
  assert.equal(sharedEdges(a, b), 1);
  const m = stitch(a, b);
  assert.equal(m.type, 'Polygon');
  assert.equal(m.coordinates.length, 1, 'un solo anello, nessun buco');
  assert.ok(Math.abs(areaKm2(m) - (areaKm2(a) + areaKm2(b))) < 0.001 * (areaKm2(a) + areaKm2(b)), `${areaKm2(m)} contro ${areaKm2(a) + areaKm2(b)}`);
  assert.equal(stitch(a, sq(5, 40, 6, 41)), null, 'senza lati comuni non si ricuce');
});

test('sponda piccola accanto a una grande: fusa, id nuovi, la provincia torna intera con id e nome della madre', () => {
  const big = sq(0, 40, 1, 41); // ~ 8.500 km²
  const small = sq(1, 40, 1.02, 40.02); // ~ 4 km², confina col lato destro
  const r = mergeSmall([piece(1, big), piece(2, small)], 100);
  assert.equal(r.features.length, 1);
  assert.equal(r.features[0].id, 'P_X_Y');
  assert.equal(r.features[0].properties.name, 'Y');
  assert.equal(r.features[0].properties.sponda_fiume, undefined);
  assert.equal(r.idMap.get('P_X_Y_SP2'), 'P_X_Y');
  assert.equal(r.idMap.get('P_X_Y_SP1'), 'P_X_Y');
  assert.equal(r.letterMap.get('P_X_Y|2'), null, 'le città su quella sponda non hanno più sponda');
  assert.ok(Math.abs(areaKm2(r.features[0].geometry) - areaKm2(big) - areaKm2(small)) < 0.5, 'territorio invariato');
});

test('sponda piccola staccata (isola): accodata come parte della sorella più vicina, nessun territorio perso', () => {
  const r = mergeSmall([piece(1, sq(0, 40, 1, 41)), piece(2, sq(0, 42, 0.5, 42.5)), piece(3, sq(5, 40, 5.02, 40.02))], 100);
  assert.equal(r.features.length, 2, 'la sponda 3 (4 km²) sparisce; la 2 (~2.900 km²) resta');
  const tot = r.features.reduce((s, f) => s + areaKm2(f.geometry), 0);
  assert.ok(Math.abs(tot - areaKm2(sq(0, 40, 1, 41)) - areaKm2(sq(0, 42, 0.5, 42.5)) - areaKm2(sq(5, 40, 5.02, 40.02))) < 0.5);
  assert.equal(r.idMap.get('P_X_Y_SP3') !== undefined, true);
  assert.deepEqual(r.features.map((f) => f.properties.sponda_fiume), [true, true], 'restano due sponde: la provincia resta divisa');
});

test('una provincia tutta fatta di sponde piccole tiene almeno la più grande', () => {
  const r = mergeSmall([piece(1, sq(0, 40, 0.02, 40.02)), piece(2, sq(0.02, 40, 0.03, 40.01))], 100);
  assert.equal(r.features.length, 1);
});

test('dati reali: nessuna sponda sotto la soglia, id unici, ogni sponda ha le sorelle', async () => {
  const merged = await loadProvinces();
  const sponde = merged.features.filter((f) => f.properties.sponda_fiume === true);
  assert.ok(sponde.length > 500, `${sponde.length} sponde`);
  const tiny = sponde.filter((f) => areaKm2(f.geometry) < MIN_SPONDA_KM2 * 0.98);
  assert.equal(tiny.length, 0, `sponde sotto ${MIN_SPONDA_KM2} km²: ${tiny.map((f) => f.properties.id).slice(0, 8).join(', ')}`);
  const perMother = new Map();
  for (const f of sponde) perMother.set(f.properties.parentProvince, (perMother.get(f.properties.parentProvince) ?? 0) + 1);
  assert.ok([...perMother.values()].every((n) => n >= 2), 'una provincia con una sola sponda deve essere tornata intera');
  assert.equal(new Set(merged.features.map((f) => f.properties.id)).size, merged.features.length);
});
