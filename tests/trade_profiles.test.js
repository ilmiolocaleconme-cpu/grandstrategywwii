import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateTradeProfiles, importsByClass } from '../src/data/tradeProfiles.js';

const read = async (p) => JSON.parse(await readFile(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const ctx = async () => ({
  nationIds: new Set((await read('political_1936.json')).map((e) => e.id)),
  productIds: new Set((await read('resources.json')).map((r) => r.id)),
});

test('scambi 1930: il file reale è valido (nazioni, prodotti e partner esistenti)', async () => {
  const doc = await read('trade/trade_profiles_1930.json');
  assert.deepEqual(validateTradeProfiles(doc, await ctx()), []);
  assert.equal(doc.quality, 'hypothesis');
  assert.equal(doc.profiles.length, 16);
});

test('scambi 1930: la copia del testo ricevuto non è stata modificata (sha256)', async () => {
  const src = await read('trade/SOURCE.json');
  const bytes = await readFile(new URL(`../${src.file}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), src.sha256);
});

test('scambi 1930: errore del testo corretto — il Regno Unito importa gomma dalla Malesia, non da sé stesso', async () => {
  const doc = await read('trade/trade_profiles_1930.json');
  const rubber = importsByClass(doc, 'GBR').rubber;
  assert.equal(rubber.length, 1);
  assert.deepEqual(rubber[0].partners, ['MAL']);
  assert.ok(rubber[0].flags.includes('source_error'));
  assert.deepEqual(importsByClass(doc, 'CHE').coal[0].flags.slice(0, 1), ['source_error']);
});

test('scambi 1930: il carburante è un solo prodotto e il carbone è il carbone del catalogo', async () => {
  const doc = await read('trade/trade_profiles_1930.json');
  const ids = new Set(doc.profiles.flatMap((p) => [...p.produces, ...p.imports]).map((i) => i.productId).filter(Boolean));
  assert.ok([...ids].every((id) => ['coal', 'fuel', 'rubber', 'processed_rubber', 'chemicals'].includes(id)), [...ids].join(','));
  assert.ok(ids.has('fuel') && ids.has('coal'));
});

test('scambi 1930: il validatore segnala nazione doppia, partner uguale alla nazione, quantità inventate, partner mancante e qualità storica', async () => {
  const c = await ctx();
  const base = await read('trade/trade_profiles_1930.json');
  const mod = (f) => { const d = structuredClone(base); f(d); return validateTradeProfiles(d, c); };
  assert.ok(mod((d) => d.profiles.push(d.profiles[0])).some((e) => e.includes('nazione doppia')));
  assert.ok(mod((d) => { d.profiles[1].imports[0].partners = ['FRA']; }).some((e) => e.includes('la nazione stessa')));
  assert.ok(mod((d) => { d.profiles[0].imports[0].tonnellate = 100; }).some((e) => e.includes('nessuna quantità inventata')));
  assert.ok(mod((d) => { d.profiles[0].imports[2].partners = []; }).some((e) => e.includes('senza partner')));
  assert.ok(mod((d) => { d.quality = 'verified'; }).some((e) => e.includes('qualità')));
  assert.ok(mod((d) => { d.profiles[0].produces[0].productId = 'xyz'; }).some((e) => e.includes('prodotto inesistente')));
  assert.ok(mod((d) => { d.profiles[0].nation = 'ZZZ'; }).some((e) => e.includes('nazione inesistente')));
});
