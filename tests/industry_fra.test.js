// Francia, passo 3 (25/11/2026, scelta dell'utente: una linea per arma): armi della fanteria 1936 e riconversioni alle date storiche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const fra = json('industry/initial_industry.json').nations.FRA.facilities;
const lines = (factory) => fra.filter((f) => f.factory === factory).map((f) => [f.recipeId, f.plannedRecipe?.recipeId ?? null, f.plannedRecipe?.from ?? null]);

test('linee francesi: armi della fanteria 1936 e piani storici (MAS 36, Mle 1935, MAS 38, 105 L, 47 mm, contraerea 25 mm, AX2)', () => {
  assert.deepEqual(lines('FCT-WEAPONS'), [
    ['REC-INW-FRA-RIFLE-1939', 'REC-INW-FRA-MAS36', '1937-01-01'], ['REC-INW-FRA-PISTOL-1939', 'REC-INW-FRA-PISTOL-MAS35', '1937-06-01'],
    ['REC-INW-FRA-PISTOL-1939', 'REC-INW-FRA-SMG-MAS38', '1939-01-01'], ['REC-MG-FRA-FM2429', null, null], ['REC-MG-FRA-HOTCHKISS1914', null, null], ['REC-GL-FRA-VB1916', null, null]]);
  const art = lines('FCT-ARTILLERY');
  assert.deepEqual(art[0], ['REC-ART-FRA-ART75M1897', null, null]);
  for (const r of ['REC-ART-FRA-GUN105L', 'REC-ART-FRA-AT47-ARM-1940', 'REC-ART-FRA-AA25']) assert.ok(art.some((x) => x[1] === r), r);
  assert.deepEqual(lines('FCT-VEHICLES').map((x) => x[1] ?? x[0]), ['REC-VEH-FRA-CITROEN23', 'REC-VEH-FRA-RENAULT-3T', 'REC-VEH-FRA-MOTO-AX2']);
});

test('ogni arma della fanteria francese del 1936 ha una linea che la produce o la produrrà', () => {
  const tpl = json('units/templates/divisione_fanteria_francia_1936.json');
  const made = new Set(fra.flatMap((f) => [f.recipeId, f.plannedRecipe?.recipeId].filter(Boolean)));
  for (const id of Object.keys(tpl.equipment)) assert.ok(made.has(`REC-${id}`) || (id === 'VEH-FRA-MOTO-RG' && made.has('REC-VEH-FRA-MOTO-RG')), id);
});
