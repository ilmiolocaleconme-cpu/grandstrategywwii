import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resourceExtraction, totalByPrefix, validateExtractionFactors } from '../src/data/extraction.js';

const j = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const production = j('data/resources/production_1936.json');
const factors = j('data/resources/extraction_factors.json');
const scaleFile = j('data/resources/extraction_scale.json');
const resources = j('data/resources.json');
const pointsByProvince = j('data/resources/resource_points.json').byProvince;
const ctx = { production, factors, scaleFile, pointsByProvince };

test('fattori: validi, uno per ogni risorsa con produzione, solo il ferro è tarato', () => {
  assert.deepEqual(validateExtractionFactors(factors, { resources, production }), []);
  assert.equal(factors.factors.iron_ore.status, 'DESIGN_DEFAULT');
  for (const [id, f] of Object.entries(factors.factors)) if (id !== 'iron_ore') assert.equal(f.status, 'PROVISIONAL', id);
  const bad = structuredClone(factors);
  delete bad.factors.coal;
  assert.match(validateExtractionFactors(bad, { resources, production }).join('|'), /manca il fattore di coal/);
});

test('ferro: i totali nazionali seguono i Mt reali (50 Mt USA → 3.128 t/giorno, 6,5 Mt Germania → 407)', () => {
  const e = resourceExtraction('iron_ore', ctx);
  assert.ok(Math.abs(totalByPrefix(e, 'USA') - 3127.5) < 1);
  assert.ok(Math.abs(totalByPrefix(e, 'DEU') - 406.6) < 1);
  assert.ok(Math.abs(totalByPrefix(e, 'SWE') - 687.9) < 1);
  assert.ok(totalByPrefix(e, 'FRA') > totalByPrefix(e, 'GBR'));
});

test('ripartizione: la produzione di una nazione si divide tra le sue province in proporzione ai punti, senza perdere nulla', () => {
  const e = resourceExtraction('coal', ctx);
  const usa = [...e.byProvince].filter(([id]) => id.startsWith('P_USA_'));
  assert.equal(usa.length, 3); // Illinois, Pennsylvania, West Virginia: stessi punti → stessa quota
  const sum = usa.reduce((s, [, v]) => s + v, 0);
  assert.ok(Math.abs(sum - totalByPrefix(e, 'USA')) < 0.5);
  assert.ok(Math.abs(usa[0][1] - usa[1][1]) < 0.2 && Math.abs(usa[1][1] - usa[2][1]) < 0.2);
  // una sola provincia con ferro: prende tutto
  const iron = resourceExtraction('iron_ore', ctx);
  assert.equal([...iron.byProvince].filter(([id]) => id.startsWith('P_USA_')).length, 1);
  assert.ok(Math.abs(iron.byProvince.get('P_USA_MINNESOTA') - 3127.5) < 0.1);
});

test('territorio con produzione ma senza province con punti: non si inventa dove, finisce in unallocated', () => {
  const e = resourceExtraction('iron_ore', ctx);
  const names = e.unallocated.map((u) => u.territory);
  assert.ok(names.includes('India Britannica') && names.includes('Algeria (Colonia Francese)'));
  const copper = resourceExtraction('copper', ctx);
  assert.equal(copper.byProvince.size, 0);
  assert.equal(copper.unallocated.length, production.rows.filter((r) => r.resource === 'copper').length);
});

test('petrolio: le Indie Olandesi contano solo le province EI e gli USA dominano', () => {
  const e = resourceExtraction('oil', ctx);
  assert.ok(totalByPrefix(e, 'USA') > 5 * totalByPrefix(e, 'USSR'));
  const nl = [...e.byProvince].filter(([id]) => id.startsWith('P_NLD_'));
  assert.ok(nl.length > 0 && nl.every(([id]) => id.startsWith('P_NLD_EI_')));
});

test('provvisori: i territori con produzione mantengono il totale di prima (cambia solo la ripartizione)', () => {
  const e = resourceExtraction('coal', ctx);
  const covered = new Set(production.rows.filter((r) => r.resource === 'coal').map((r) => r.scope ?? `P_${r.prefix}_`));
  let oldTotal = 0; let newTotal = 0;
  for (const [id, v] of Object.entries(pointsByProvince)) {
    if (!v.coal) continue;
    if ([...covered].some((s) => id.startsWith(s))) oldTotal += v.coal.base * scaleFile.unitsPerPoint.coal;
  }
  for (const [id, v] of e.byProvince) if ([...covered].some((s) => id.startsWith(s))) newTotal += v;
  assert.ok(Math.abs(newTotal - oldTotal) / oldTotal < 0.02, `${newTotal} vs ${oldTotal}`);
});

test('deterministico: due calcoli uguali danno lo stesso risultato', () => {
  const a = resourceExtraction('oil', ctx);
  const b = resourceExtraction('oil', ctx);
  assert.deepEqual([...a.byProvince], [...b.byProvince]);
  assert.deepEqual(a.unallocated, b.unallocated);
});
