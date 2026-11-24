// Italia, passo 3 (24/11/2026, scelta dell'utente: una linea per arma): armi dei battaglioni del 1936 e piani storici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const ita = json('industry/initial_industry.json').nations.ITA.facilities;
const lines = (factory) => ita.filter((f) => f.factory === factory).map((f) => [f.recipeId, f.plannedRecipe?.recipeId ?? null, f.plannedRecipe?.from ?? null]);
const MODS = json('units/modules/modules_ita.json').modules;

test('linee italiane: armi dei battaglioni 1936 e piani storici (91/38, Breda 37, MAB 38, 47/32, 75/18, Alce)', () => {
  assert.deepEqual(lines('FCT-WEAPONS'), [
    ['REC-INW-ITA-RIFLE-1940', 'REC-INW-ITA-CARCANO-9138', '1938-01-01'], ['REC-INW-ITA-PISTOL-BERETTA34', null, null],
    ['REC-INW-ITA-PISTOL-BERETTA34', 'REC-INW-ITA-SMG-MAB38', '1938-06-01'], ['REC-MG-ITA-BREDA30', null, null],
    ['REC-MG-ITA-FIAT1435', 'REC-MG-ITA-BREDA37', '1937-06-01']]);
  const art = lines('FCT-ARTILLERY');
  assert.deepEqual(art[0], ['REC-ART-ITA-GUN75-27-ARM-1940', null, null]);
  for (const r of ['REC-ART-ITA-AT47-1940', 'REC-ART-ITA-HOW75-18']) assert.ok(art.some((x) => x[1] === r), r);
  assert.deepEqual(lines('FCT-VEHICLES').map((x) => x[1] ?? x[0]), ['REC-VEH-ITA-SPA-DOV35', 'REC-VEH-ITA-MOTO-ALCE']);
});

test('ogni arma dei battaglioni del 1936 (fanteria ternaria) ha una linea che la produce o la produrrà', () => {
  const tpl = json('units/templates/divisione_fanteria_italia_1936.json');
  const made = new Set(ita.flatMap((f) => [f.recipeId, f.plannedRecipe?.recipeId].filter(Boolean)));
  for (const id of Object.keys(tpl.equipment)) assert.ok(made.has(`REC-${id}`), id);
  assert.ok(MODS.length > 0);
});
