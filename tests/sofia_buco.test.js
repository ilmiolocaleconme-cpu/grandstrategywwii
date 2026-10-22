// Sofia: la regione intorno alla città non ha buchi (erano ≈746 e ≈78 km² di territorio non assegnato a nessuno).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pointInPolygon } from '../src/data/polyclip.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const inside = (g, lon, lat) => polysOf(g).some((rings) => pointInPolygon(lon, lat, rings));

test('Sofia: i punti dei due vecchi buchi cadono nella regione o nelle zone urbane', () => {
  const regione = read('provinces/BGR.json').features.filter((f) => f.properties.id.startsWith('P_BGR_SOFIA'));
  const zone = read('citta_grandi.json').features.filter((f) => f.properties.parentProvince === 'P_BGR_SOFIA');
  assert.ok(regione.length >= 1 && zone.length >= 1);
  for (const [lon, lat] of [[23.372, 42.629], [23.502, 42.833], [23.30, 42.68], [23.45, 42.72]]) {
    const coperto = [...regione, ...zone].some((f) => inside(f.geometry, lon, lat));
    assert.ok(coperto, `punto ${lon},${lat} non coperto da regione né zone urbane`);
  }
});

test('Sofia: le zone urbane restano zone a parte (non diventano regione)', () => {
  const zone = read('citta_grandi.json').features.filter((f) => f.properties.parentProvince === 'P_BGR_SOFIA');
  assert.ok(zone.every((f) => f.properties.kind === 'citta'));
});
