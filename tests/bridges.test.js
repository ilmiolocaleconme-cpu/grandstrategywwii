// I ponti che contano nel gioco vengono dal grafo dei collegamenti (data/links.json), non dai 9 attraversamenti curati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { bridgedPairs, bridgeKey } from '../src/data/links.js';

const links = JSON.parse(readFileSync(new URL('../data/links.json', import.meta.url), 'utf8'));

test('bridgedPairs: sintetico, chiave simmetrica e ignora i collegamenti senza ponte', () => {
  const f = { links: [{ id: 'L1', a: 0, b: 1 }, { id: 'L2', a: 1, b: 2 }], bridges: [{ link: 'L1' }, { link: 'L9' }] };
  const s = bridgedPairs(f, ['A', 'B', 'C']);
  assert.deepEqual([...s], ['A|B']);
  assert.ok(s.has(bridgeKey('B', 'A')));
  assert.ok(!s.has(bridgeKey('B', 'C')));
});

test('dati reali: ci sono molte coppie con ponte e fra le sponde dello stesso fiume ce ne sono di collegate e di no', async () => {
  const provinces = await loadProvinces();
  const ids = provinces.features.map((f) => f.properties.id);
  const mother = new Map(provinces.features.map((f) => [f.properties.id, f.properties.parentProvince ?? null]));
  const pairs = bridgedPairs(links, ids);
  assert.ok(pairs.size > 1000, `coppie con ponte: ${pairs.size}`);
  let bankPairs = 0;
  for (const k of pairs) { const [a, b] = k.split('|'); if (mother.get(a) && mother.get(a) === mother.get(b)) bankPairs += 1; }
  assert.ok(bankPairs > 0, 'almeno una coppia di sponde della stessa provincia ha un ponte');
  console.log(`coppie con ponte ${pairs.size}, fra sponde della stessa provincia ${bankPairs}`);
});
