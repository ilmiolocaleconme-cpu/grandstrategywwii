// Industria iniziale 1/1/1936 (27/10/2026): fasce A e B con impianti, fascia C senza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { validateInitialIndustry, facilityCounts, baseGridMw } from '../src/data/initialIndustry.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, withEquipmentRecipes } from '../src/data/equipmentProduction.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const catalog = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') });
const file = json('industry/initial_industry.json');
const equipmentRecipes = buildEquipmentRecipes(mergeEquipmentCatalogs(['catalog', 'catalog_deu', 'catalog_fra', 'catalog_gbr', 'catalog_ita', 'catalog_ussr', 'catalog_jpn', 'catalog_usa', 'catalog_minors'].map((n) => json(`units/equipment/${n}.json`))), json('units/equipment/equipment_production.json'));
const ctx = () => ({ factoriesById: catalog.byId, recipes: withEquipmentRecipes(json('industry/recipes.json'), equipmentRecipes), entityIds: new Set(json('political_1936.json').map((e) => e.id)), nationIds: json('nations.json').map((n) => n.id) });

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
  // 20/11/2026: con le fabbriche d'armi dei battaglioni sovietici e le linee riservate ai modelli futuri la domanda (606 MW) supera l'idroelettrico
  // dei CSV (558 MW): serve UNA centrale a carbone (prima nessuna). Approvata dall'utente il 20/11/2026.
  assert.equal(facilityCounts(file, 'USSR')['FCT-POWER'], 1);
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

test('armi leggere e artiglieria (10/11/2026): una fabbrica di ciascun tipo per DEU, FRA, GBR, ITA, USSR, JPN, USA con ricetta della propria nazione', () => {
  for (const n of ['DEU', 'FRA', 'GBR', 'ITA', 'USSR', 'JPN', 'USA']) {
    const c = facilityCounts(file, n);
    // 19/11/2026: la Germania ha un impianto per ogni arma delle divisioni (4 di armi leggere, 7 di artiglieria); l'URSS (stesso giorno, battaglioni
    // sovietici) 4 di armi leggere (fucile, TT-33, DT, Maxim) e 11 di artiglieria (76, mortaio da 82, 76 reggimentale, AT 45, obici da 122 e 152, contraerea da 76; dal 20/11/2026 anche 4 linee riservate
    // ai mortai da 50 e 120, alla contraerea da 37 e ai fucili anticarro, src/game/retoolSystem.js); gli USA (21/11/2026, battaglioni americani,
    // scelte dell'utente 1B-2A-3A) 8 di armi leggere (2 fucili, poi Garand e carabina; pistola; Thompson; BAR; .30; .50; .30 poi bazooka) e 5 di
    // artiglieria (75 poi 105; mortaio da 81; 75 poi 37 anticarro; 81 poi 60; M1918 poi M1 da 155); il Regno Unito (24/11/2026, passo 3, scelta A)
    // 4 di armi leggere (fucile poi No. 4; Webley; Lewis poi Bren; Vickers) e 6 di artiglieria (18 poi 25 libbre; mortaio da 3; 3 poi 2 pollici;
    // 3 pollici poi Boys; 18 libbre poi 2 libbre anticarro; obice da 4,5 poi 5,5); l'Italia (24/11/2026, passo 3) 5 di armi leggere (fucile poi 91/38; Beretta 34;
    // Beretta poi MAB 38; Breda 30; Fiat 14/35 poi Breda 37) e 6 di artiglieria (75/27; Brixia; 65/17 poi 47/32; 100/17; 75/27 poi 75/18; Breda 20/65); le altre ancora uno
    const [w, a] = n === 'DEU' ? [4, 7] : n === 'USSR' ? [4, 11] : n === 'USA' ? [8, 5] : n === 'GBR' ? [4, 6] : n === 'ITA' ? [5, 6] : n === 'FRA' ? [6, 7] : n === 'JPN' ? [6, 6] : [1, 1]; // Giappone dal 25/11/2026 (passo 3): 6 + 6 // Francia dal 25/11/2026 (passo 3): 6 linee di armi leggere e 7 di artiglieria
    assert.equal(c['FCT-WEAPONS'], w, n); assert.equal(c['FCT-ARTILLERY'], a, n);
    for (const f of file.nations[n].facilities.filter((x) => x.factory === 'FCT-WEAPONS' || x.factory === 'FCT-ARTILLERY')) assert.ok(f.recipeId.split('-').includes(n), `${n}: ${f.recipeId}`);
  }
});

test('USA (21/11/2026, scelte dell\'utente 1B-2A-3A): 2 fabbriche di veicoli e linee riservate con piano storico', () => {
  const fs = file.nations.USA.facilities;
  const plan = (recipeId, to) => fs.find((f) => f.recipeId === recipeId && f.plannedRecipe?.recipeId === to)?.plannedRecipe.from;
  assert.equal(fs.filter((f) => f.factory === 'FCT-VEHICLES').reduce((s, f) => s + (f.count ?? 1), 0), 2);
  assert.equal(plan('REC-INW-USA-RIFLE-1940', 'REC-INW-USA-GARAND'), '1937-01-01', 'Springfield passa al Garand');
  assert.equal(plan('REC-INW-USA-RIFLE-1940', 'REC-INW-USA-CARBINE-M1'), '1941-10-01');
  assert.equal(plan('REC-ART-USA-GUN75-1940', 'REC-ART-USA-HOW105-1940'), '1940-01-01');
  assert.equal(plan('REC-ART-USA-HOW155-M1918', 'REC-ART-USA-HOW155-1940'), '1942-01-01', 'il vecchio M1918 fino all\'M1');
  assert.equal(plan('REC-VEH-USA-TRUCK15', 'REC-VEH-USA-GMC-CCKW'), '1941-01-01');
});
