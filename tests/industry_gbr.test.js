// Regno Unito, passo 3 (24/11/2026, scelta A dell'utente): una linea per ogni arma dei battaglioni del 1936, con i piani storici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const gbr = json('industry/initial_industry.json').nations.GBR.facilities;
const lines = (factory) => gbr.filter((f) => f.factory === factory).map((f) => [f.recipeId, f.plannedRecipe?.recipeId ?? null, f.plannedRecipe?.from ?? null]);

test('linee britanniche: armi dei battaglioni 1936 e piani storici (Bren, 25 libbre, 2 libbre, Boys, No. 4, Universal Carrier)', () => {
  assert.deepEqual(lines('FCT-WEAPONS'), [
    ['REC-INW-GBR-RIFLE', 'REC-INW-GBR-NO4', '1941-07-01'], ['REC-INW-GBR-PISTOL-WEBLEY', null, null],
    ['REC-MG-GBR-LEWIS', 'REC-MG-GBR-BREN', '1937-09-01'], ['REC-MG-GBR-VICKERS', null, null]]);
  const art = lines('FCT-ARTILLERY');
  assert.deepEqual(art[0], ['REC-ART-GBR-18PDR', 'REC-ART-GBR-25PDR-ARM-1939', '1940-01-01']);
  for (const r of ['REC-ART-GBR-MOR2IN', 'REC-ART-GBR-BOYS', 'REC-ART-GBR-2PDR-ARM-1939', 'REC-ART-GBR-HOW55']) assert.ok(art.some((x) => x[1] === r), r);
  assert.deepEqual(lines('FCT-VEHICLES').map((x) => x[1] ?? x[0]), ['REC-VEH-GBR-TRUCK15', 'REC-VEH-GBR-TRUCK3T', 'REC-VEH-GBR-CARRIER']);
  assert.ok(!gbr.some((f) => /GBR-(FIELD|MORTAR|MG|AT|AA)$/.test(f.recipeId)), 'niente più voci generiche in produzione');
});
