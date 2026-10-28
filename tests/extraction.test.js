import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resourceExtraction, totalByPrefix, validateExtractionFactors, validateLocationsExtra } from '../src/data/extraction.js';

const j = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const production = j('data/resources/production_1936.json');
const factors = j('data/resources/extraction_factors.json');
const scaleFile = j('data/resources/extraction_scale.json');
const resources = j('data/resources.json');
const pointsByProvince = j('data/resources/resource_points.json').byProvince;
const extra = j('data/resources/resource_locations_extra.json');
const ctx = { production, factors, scaleFile, pointsByProvince };
const ctxExtra = { ...ctx, extra };

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

test('territorio con produzione ma senza province con punti: senza posizioni extra finisce in unallocated, con le extra viene assegnato', () => {
  const e = resourceExtraction('iron_ore', ctx);
  const names = e.unallocated.map((u) => u.territory);
  assert.ok(names.includes('India Britannica') && names.includes('Algeria (Colonia Francese)'));
  const copper = resourceExtraction('copper', ctx);
  assert.equal(copper.byProvince.size, 0);
  assert.equal(copper.unallocated.length, production.rows.filter((r) => r.resource === 'copper').length);
  // con le posizioni extra approvate non resta nulla di non assegnato
  for (const r of ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur', 'copper']) assert.deepEqual(resourceExtraction(r, ctxExtra).unallocated, [], r);
  const x = resourceExtraction('iron_ore', ctxExtra);
  assert.ok(Math.abs(x.byProvince.get('P_IND_JHARKHAND') - 78.2) < 0.2);
  assert.equal(x.byProvince.get('P_IND_JHARKHAND'), x.byProvince.get('P_IND_ODISHA'));
  assert.ok(Math.abs(x.byProvince.get('P_ALG_TEBESSA') - 137.6) < 0.2);
});

test('le posizioni extra sono solo aggiunte: nessuna provincia già esistente cambia valore e nessuna risorsa vecchia sparisce', () => {
  for (const r of ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber', 'sulphur']) {
    const before = resourceExtraction(r, ctx);
    const after = resourceExtraction(r, ctxExtra);
    for (const [id, v] of before.byProvince) assert.equal(after.byProvince.get(id), v, `${r} ${id}`);
    assert.ok(after.byProvince.size >= before.byProvince.size);
    assert.ok(after.total >= before.total);
  }
  // il file dei punti originale non è toccato: Minnesota ha ancora i suoi punti di ferro
  assert.equal(pointsByProvince.P_USA_MINNESOTA.iron_ore.base > 19, true);
});

test('posizioni extra: valide sui dati reali e il validatore rifiuta province inesistenti, doppioni e territori già coperti', () => {
  const provinceIds = new Set(Object.keys(pointsByProvince).concat(extra.rows.flatMap((r) => r.provinces)));
  assert.deepEqual(validateLocationsExtra(extra, { resources, production, provinceIds, pointsByProvince }), []);
  const bad = structuredClone(extra);
  bad.rows.push({ ...bad.rows[0] });
  bad.rows.push({ resource: 'coal', territory: 'Stati Uniti', provinces: ['P_XXX_NONE'], quality: 'APPROXIMATE' });
  const e = validateLocationsExtra(bad, { resources, production, provinceIds, pointsByProvince }).join('|');
  assert.match(e, /duplicato/);
  assert.match(e, /provincia inesistente/);
  assert.match(e, /già province con punti/);
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

test('zolfo e gomma (alzati il 27/10/2026): offerta mondiale vicina al fabbisogno delle fasce A e B', () => {
  const total = (r) => resourceExtraction(r, ctxExtra).total;
  assert.ok(total('sulphur') > 500 && total('sulphur') < 600, `zolfo ${total('sulphur')} t/giorno (prima 201)`);
  assert.ok(total('rubber') > 1500 && total('rubber') < 1750, `gomma ${total('rubber')} t/giorno (prima 1.235)`);
});
