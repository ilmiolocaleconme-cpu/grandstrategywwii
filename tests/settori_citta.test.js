import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cityNamesAt, markCapitals, SECTOR_NAME_ZOOM, CITY_NAME_ZOOM } from '../src/map/citta.js';
import { areaKm2 } from '../scripts/build-city-sectors.js';

// Settori di Mosca, Leningrado e Stalingrado (scripts/build-city-sectors.js, 25/11/2026): zone vere della città.
const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const zones = read('citta_grandi.json').features;
const src = read('sources/settori_citta.json');
const parti = read('sources/settori_citta_parti.json').features;
const links = read('city_links.json');

test('settori: numero, nome, principale per primo, area uguale alle parti del fiume', () => {
  const attesi = { P_USSR_MOSCA_CITTA: 11, P_USSR_LENINGRADO_CITTA: 8, P_USSR_STALINGRADO_CITTA: 29 };
  for (const c of src.citta) {
    const z = zones.filter((f) => f.properties.cittaId === c.cittaId);
    assert.equal(z.length, attesi[c.cittaId], c.nome);
    assert.equal(z[0].properties.settore, c.principale);
    assert.equal(z[0].properties.principale, true);
    assert.equal(z.filter((f) => f.properties.principale).length, 1);
    assert.equal(new Set(z.map((f) => f.properties.settore)).size, z.length, 'nomi unici');
    assert.ok(z.every((f) => f.properties.name === `${c.nome} – ${f.properties.settore}` && f.properties.parti === z.length));
    const prima = parti.filter((f) => f.properties.cittaId === c.cittaId).reduce((s, f) => s + areaKm2(f.geometry), 0);
    const dopo = z.reduce((s, f) => s + areaKm2(f.geometry), 0);
    assert.ok(Math.abs(dopo - prima) / prima < 0.01, `${c.nome}: ${dopo} vs ${prima}`);
  }
  // Stalingrado in fila lungo il Volga: Rynok a nord, Beketovka a sud, la riva sinistra a parte
  const st = (n) => zones.find((f) => f.properties.name === `Stalingrado – ${n}`);
  const lat = (f) => f.geometry.coordinates[0].reduce((s, p) => s + p[1], 0) / f.geometry.coordinates[0].length;
  assert.ok(lat(st('Rynok')) > lat(st('Mamaev Kurgan (quota 102)')) && lat(st('Mamaev Kurgan (quota 102)')) > lat(st('Beketovka')));
  assert.equal(st('Krasnaja Sloboda (riva sinistra)').properties.partiFiume, 'P_USSR_STALINGRADO_CITTA_P2');
});

test('settori: ogni settore è un nodo di movimento con accesso, i settori di una città sono collegati', () => {
  for (const c of src.citta) {
    const ids = zones.filter((f) => f.properties.cittaId === c.cittaId).map((f) => f.properties.id);
    const nodi = links.nodes.filter((n) => n.cittaId === c.cittaId).map((n) => n.id);
    assert.deepEqual(nodi.sort(), [...ids].sort());
    for (const id of ids) assert.ok(links.links.some((l) => l.type === 'access' && l.a === id), id);
    const adj = new Map(ids.map((i) => [i, []]));
    for (const l of links.links) if (l.type === 'part' && adj.has(l.a)) { adj.get(l.a).push(l.b); adj.get(l.b).push(l.a); }
    const seen = new Set([ids[0]]); const q = [ids[0]];
    while (q.length) for (const v of adj.get(q.pop())) if (!seen.has(v)) { seen.add(v); q.push(v); }
    assert.equal(seen.size, ids.length, c.nome);
  }
  // il Volga separa la riva sinistra: ci si passa solo attraversando il fiume
  const sx = 'P_USSR_STALINGRADO_CITTA_P29';
  assert.ok(links.links.filter((l) => l.type === 'part' && (l.a === sx || l.b === sx)).every((l) => l.crossing));
});

test('settori: nomi sulla mappa (città da lontano, settori da vicino), Mosca resta capitale, Leningrado resta porto', () => {
  const marked = markCapitals(zones.filter((f) => f.properties.cittaId === 'P_USSR_MOSCA_CITTA'), [{ id: 'USSR', capital: 'Mosca' }]);
  assert.ok(marked.every((f) => f.properties.capitale));
  assert.equal(marked.filter((f) => f.properties.capital).map((f) => f.properties.settore)[0], 'Cremlino e Kitaj-gorod');
  const items = marked.map((f) => ({ props: f.properties }));
  assert.equal(cityNamesAt(items, CITY_NAME_ZOOM).length, 1);
  assert.equal(cityNamesAt(items, SECTOR_NAME_ZOOM).length, 11);
  assert.ok(read('ports/ports_1936.json').ports?.P_USSR_LENINGRADO_CITTA ?? read('ports/ports_1936.json').P_USSR_LENINGRADO_CITTA);
});
