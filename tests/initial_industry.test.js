// Industria iniziale 1/1/1936 (27/10/2026): fasce A e B con impianti, fascia C senza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { validateInitialIndustry, facilityCounts, baseGridMw } from '../src/data/initialIndustry.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const catalog = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const file = json('industry/initial_industry.json');
const ctx = () => ({ factoriesById: catalog.byId, recipes: json('industry/recipes.json'), entityIds: new Set(json('political_1936.json').map((e) => e.id)), nationIds: json('nations.json').map((n) => n.id) });

test('valido: 12 entità in fascia A, 13 in B, le nazioni restanti in C senza impianti', () => {
  assert.deepEqual(validateInitialIndustry(file, ctx()), []);
  const tiers = Object.values(file.nations).map((n) => n.tier);
  assert.equal(tiers.filter((t) => t === 'A').length, 12);
  assert.equal(tiers.filter((t) => t === 'B').length, 13);
  assert.equal(file.tierC.length, 51);
});

test('numeri approvati: USA 30 acciaierie e 20 raffinerie, Germania 12 e 2 sintetiche, URSS senza centrali a carbone', () => {
  assert.equal(facilityCounts(file, 'USA')['FCT-STEEL'], 30);
  assert.equal(facilityCounts(file, 'USA')['FCT-REFINERY'], 20);
  assert.equal(facilityCounts(file, 'DEU')['FCT-STEEL'], 12);
  assert.equal(facilityCounts(file, 'DEU')['FCT-SYNFUEL'], 2);
  assert.equal(facilityCounts(file, 'USSR')['FCT-POWER'], undefined);
  assert.equal(file.nations.MAL.owner, 'GBR');
  assert.equal(facilityCounts(file, 'MAL')['FCT-RUBBER'], 6);
});

test('gli errori sono segnalati: ricetta di un\'altra fabbrica, fascia C con impianti, nazione senza fascia', () => {
  const bad = structuredClone(file);
  bad.nations.USA.facilities[0].recipeId = 'REC-ALU-001';
  assert.match(validateInitialIndustry(bad, ctx()).join('|'), /non è di FCT-STEEL/);
  const c = structuredClone(file);
  c.nations[c.tierC[0]] = structuredClone(c.nations.USA);
  assert.match(validateInitialIndustry(c, ctx()).join('|'), /fascia C ma ha impianti/);
  const m = structuredClone(file);
  m.tierC.pop();
  assert.match(validateInitialIndustry(m, ctx()).join('|'), /non è in nessuna fascia/);
});

test('rete di base: 40 MW (MISSING_DATA) solo per la fascia C', () => {
  assert.equal(baseGridMw(file, file.tierC[0]), 40);
  assert.equal(baseGridMw(file, 'USA'), 0);
  const bad = structuredClone(file); bad.baseGrid.quality = 'DESIGN_DEFAULT';
  assert.match(validateInitialIndustry(bad, ctx()).join('|'), /MISSING_DATA/);
  delete bad.baseGrid;
  assert.match(validateInitialIndustry(bad, ctx()).join('|'), /rete di base mancante/);
});
