// Giappone, passo 3 (25/11/2026, scelta dell'utente: una linea per arma): armi della quadrata 1936 e riconversioni alle date storiche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const jpn = json('industry/initial_industry.json').nations.JPN.facilities;
const chain = (p) => (p ? [p.recipeId, ...chain(p.then)] : []);
const lines = (factory) => jpn.filter((f) => f.factory === factory).map((f) => [f.recipeId, ...chain(f.plannedRecipe)]);

test('linee giapponesi: armi della quadrata 1936 e piani storici (Arisaka Tipo 99, Tipo 96 → Tipo 99, Tipo 100, Tipo 90, mortaio da 81, contraerea, moto Tipo 97)', () => {
  assert.deepEqual(lines('FCT-WEAPONS'), [
    ['REC-INW-JPN-RIFLE-1939', 'REC-INW-JPN-ARISAKA-T99'], ['REC-INW-JPN-PISTOL-T14'], ['REC-INW-JPN-PISTOL-T14', 'REC-INW-JPN-SMG-T100'],
    ['REC-MG-JPN-T11', 'REC-MG-JPN-T96', 'REC-MG-JPN-T99'], ['REC-MG-JPN-T92'], ['REC-GL-JPN-T89']]);
  const art = lines('FCT-ARTILLERY');
  assert.deepEqual(art[0], ['REC-ART-JPN-GUN75-T38', 'REC-ART-JPN-GUN75-T90']);
  for (const r of ['REC-ART-JPN-MOR81-T97', 'REC-ART-JPN-AA20-T98', 'REC-ART-JPN-GUN75-REG-1939']) assert.ok(art.some((x) => x.includes(r)), r);
  assert.deepEqual(lines('FCT-VEHICLES'), [['REC-VEH-JPN-ISUZU-T94'], ['REC-VEH-JPN-MOTO-RIKUO', 'REC-VEH-JPN-MOTO-T97']]);
});

test('ogni arma della quadrata giapponese del 1936 ha una linea che la produce o la produrrà', () => {
  const tpl = json('units/templates/divisione_fanteria_giappone_1936.json');
  const made = new Set(jpn.flatMap((f) => [f.recipeId, ...chain(f.plannedRecipe)]));
  for (const id of Object.keys(tpl.equipment)) assert.ok(made.has(`REC-${id}`), id);
});
