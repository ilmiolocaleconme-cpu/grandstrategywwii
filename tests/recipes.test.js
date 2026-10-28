// Ricette di trasformazione e scala di estrazione (Fase 0 di Risorse + Industria: solo dati, nessuna regola di gioco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { validateRecipes, validateExtractionScale, fullCapacityFlows, pointsToUnits, derivedIds } from '../src/data/recipes.js';
import { PRODUCT_IDS, PRODUCT_META, RESOURCE_ORDER } from '../src/data/provinceResources.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const catalog = () => loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const ctx = () => ({ factoriesById: catalog().byId, resources: json('resources.json') });
const clone = (x) => JSON.parse(JSON.stringify(x));

test('ricette reali: valide, ogni prodotto ha una ricetta', () => {
  assert.deepEqual(validateRecipes(json('industry/recipes.json'), ctx()), []);
  const derived = derivedIds(json('resources.json'));
  for (const id of ['steel', 'aluminium', 'fuel', 'processed_rubber', 'chemicals', 'electricity']) assert.ok(derived.has(id), id);
  assert.ok(!derived.has('hydro'), 'l\'idroelettrica è una fonte di energia, non un prodotto');
});

test('catene richieste: ferro, bauxite, petrolio, gomma, carbone, idro', () => {
  const f = json('industry/recipes.json');
  const by = (p) => f.recipes.filter((r) => r.output.product === p);
  assert.deepEqual(by('steel')[0].inputs.map((i) => i.resource).sort(), ['coal', 'iron_ore']);
  assert.deepEqual(by('aluminium')[0].inputs.map((i) => i.resource), ['bauxite']);
  assert.equal(by('fuel').length, 2, 'un solo carburante, due vie: petrolio raffinato e carbone liquefatto');
  assert.deepEqual(by('fuel').map((r) => r.factory).sort(), ['FCT-REFINERY', 'FCT-SYNFUEL']);
  assert.deepEqual(by('processed_rubber')[0].inputs.map((i) => i.resource), ['rubber']);
  assert.deepEqual(by('electricity')[0].inputs.map((i) => i.resource), ['coal']);
  const hydro = f.flows.find((x) => x.source === 'hydro');
  assert.deepEqual(hydro.inputs, [], 'l\'idroelettrica non consuma e non diventa uno stock materiale');
  assert.equal(hydro.quality, 'MISSING_DATA');
});

test('coerenza con PRODUCT_META: acciaio e alluminio', () => {
  const f = json('industry/recipes.json');
  for (const id of PRODUCT_IDS) {
    const r = f.recipes.find((x) => x.output.product === id);
    assert.equal(r.factory, PRODUCT_META[id].factory);
    assert.deepEqual(r.inputs.map((i) => i.resource).sort(), [...PRODUCT_META[id].inputs].sort());
  }
});

test('flussi a pieno regime dalla capacità del catalogo (nessuna duplicazione dei dati)', () => {
  const cat = catalog(); const f = json('industry/recipes.json');
  const steel = fullCapacityFlows(f.recipes.find((r) => r.id === 'REC-STEEL-001'), cat.byId.get('FCT-STEEL'));
  assert.equal(steel.outputPerDay, 100);
  assert.deepEqual(steel.inputsPerDay, { iron_ore: 160, coal: 80 });
  assert.equal(steel.energyMw, 12);
  const power = fullCapacityFlows(f.recipes.find((r) => r.factory === 'FCT-POWER'), cat.byId.get('FCT-POWER'));
  assert.equal(power.outputPerDay, 120);
  assert.deepEqual(power.inputsPerDay, { coal: 60 });
  assert.equal(power.outputUnit, 'MW', 'l\'elettricità è una potenza');
  assert.equal(steel.outputUnit, 't/day');
});

test('la capacità non si ridefinisce nelle ricette se la fabbrica ce l\'ha già', () => {
  const f = clone(json('industry/recipes.json'));
  f.recipes.find((r) => r.id === 'REC-STEEL-001').nominalOutputMw = 200;
  assert.ok(validateRecipes(f, ctx()).some((e) => e.includes('ridefinisce la capacità')));
});

test('errori rilevati: fabbrica, risorsa, prodotto, duplicati, valori', () => {
  const base = json('industry/recipes.json');
  const withRec = (fn) => { const f = clone(base); fn(f); return validateRecipes(f, ctx()); };
  assert.ok(withRec((f) => { f.recipes[0].factory = 'FCT-NOPE'; }).some((e) => e.includes('fabbrica inesistente')));
  assert.ok(withRec((f) => { f.recipes[0].inputs[0].resource = 'unobtainium'; }).some((e) => e.includes('non esiste in resources.json')));
  assert.ok(withRec((f) => { f.recipes[0].inputs[0].resource = 'steel'; }).some((e) => e.includes('ciclo tra prodotti')), 'l\'acciaio non può servire a produrre acciaio');
  assert.ok(withRec((f) => { f.recipes.find((r) => r.id === 'REC-MACHINERY-001').inputs.push({ resource: 'munitions', perUnit: 1 }); f.recipes.find((r) => r.id === 'REC-MUNITIONS-001').inputs.push({ resource: 'machinery', perUnit: 1 }); }).some((e) => e.includes('ciclo tra prodotti')), 'ciclo indiretto');
  assert.ok(withRec((f) => { f.recipes[0].inputs[0].resource = 'electricity'; }).some((e) => e.includes('flusso, non un materiale')));
  assert.ok(withRec((f) => { f.recipes[0].output.product = 'iron_ore'; }).some((e) => e.includes('non è un prodotto')));
  assert.ok(withRec((f) => { f.recipes[1].id = f.recipes[0].id; }).some((e) => e.includes('id duplicato')));
  assert.ok(withRec((f) => { f.recipes[0].inputs[0].perUnit = 0; }).some((e) => e.includes('perUnit non valido')));
  assert.ok(withRec((f) => { f.recipes[0].quality = 'HISTORICAL'; }).some((e) => e.includes('qualità sconosciuta')));
  assert.ok(withRec((f) => { f.recipes[0].rationale = ' '; }).some((e) => e.includes('senza motivazione')));
  assert.ok(withRec((f) => { f.recipes = f.recipes.filter((r) => r.output.product !== 'fuel'); }).some((e) => e.includes('fuel') && e.includes('nessuna ricetta')));
  assert.ok(withRec((f) => { f.recipes[0].inputs[0].resource = 'bauxite'; }).some((e) => e.includes('PRODUCT_META')));
  assert.ok(withRec((f) => { delete f.recipes.find((r) => r.factory === 'FCT-POWER').nominalOutputMw; }).some((e) => e.includes('senza capacità giornaliera')));
  assert.ok(withRec((f) => { f.flows[0].inputs = [{ resource: 'coal', perUnit: 1 }]; }).some((e) => e.includes('non può consumare')));
  assert.deepEqual(validateRecipes({ schema: 'x' }, ctx()).length, 1);
});

test('scala di estrazione: valida, copre ogni materia prima consumata, null = N/D', () => {
  const rec = json('industry/recipes.json'); const resources = json('resources.json'); const scale = json('resources/extraction_scale.json');
  assert.deepEqual(validateExtractionScale(scale, { recipes: rec, resources }), []);
  for (const id of RESOURCE_ORDER) assert.ok(id in scale.unitsPerPoint, id);
  assert.equal(pointsToUnits(10, 'coal', scale), 1250);
  assert.equal(pointsToUnits(10, 'tungsten', scale), null, 'senza scala: N/D, non zero');
  assert.equal(pointsToUnits(0, 'coal', scale), 0);
  const s2 = clone(scale); s2.unitsPerPoint.coal = null;
  assert.ok(validateExtractionScale(s2, { recipes: rec, resources }).some((e) => e.includes('coal') && e.includes('senza scala')));
  const s3 = clone(scale); s3.unitsPerPoint.steel = 5;
  assert.ok(validateExtractionScale(s3, { recipes: rec, resources }).some((e) => e.includes('non si estrae')));
});

test('bilanciamento di partenza: i grandi produttori alimentano più impianti, la Germania dipende dall\'estero per il ferro', () => {
  const cat = catalog(); const rec = json('industry/recipes.json'); const scale = json('resources/extraction_scale.json');
  const pts = json('resources/resource_points.json').byProvince;
  const nation = (own) => { const t = {}; for (const [p, rs] of Object.entries(pts)) if (p.split('_')[1] === own) for (const [r, v] of Object.entries(rs)) t[r] = (t[r] ?? 0) + v.base; return t; };
  const plants = (own, recipeId) => {
    const r = rec.recipes.find((x) => x.id === recipeId); const flows = fullCapacityFlows(r, cat.byId.get(r.factory)); const t = nation(own);
    return Math.min(...Object.entries(flows.inputsPerDay).map(([res, need]) => pointsToUnits(t[res] ?? 0, res, scale) / need));
  };
  assert.ok(plants('USA', 'REC-STEEL-001') >= 5, 'USA: almeno 5 acciaierie a pieno regime con le sole risorse nazionali');
  assert.ok(plants('DEU', 'REC-STEEL-001') < 3, 'Germania: poco minerale di ferro, deve importare');
  assert.ok(plants('DEU', 'REC-FUEL-COAL-001') >= 3, 'Germania: carbone a sufficienza per i carburanti sintetici');
  assert.ok(plants('DEU', 'REC-FUEL-OIL-001') < 1, 'Germania: quasi nessun petrolio');
});

test('ricette militari intermedie: macchinari, componenti, motori, munizioni (approvate 26/10/2026)', () => {
  const cat = catalog(); const f = json('industry/recipes.json');
  const flows = (id) => { const r = f.recipes.find((x) => x.id === id); return fullCapacityFlows(r, cat.byId.get(r.factory)); };
  assert.deepEqual(flows('REC-MACHINERY-001'), { outputPerDay: 70, outputUnit: 't/day', inputsPerDay: { steel: 84 }, energyMw: cat.byId.get('FCT-MACHINERY').energy_consumption });
  assert.deepEqual(flows('REC-COMPONENTS-001').inputsPerDay, { steel: 48, aluminium: 16, processed_rubber: 8 });
  assert.deepEqual(flows('REC-ENGINES-001').inputsPerDay, { steel: 48, aluminium: 18 });
  assert.deepEqual(flows('REC-MUNITIONS-001').inputsPerDay, { steel: 60, chemicals: 40, copper: 33, sulphur: 5 }); // rame e zolfo aggiunti il 28/10/2026
  assert.equal(flows('REC-COMPONENTS-001').outputPerDay, 80);
  assert.equal(flows('REC-ENGINES-001').outputPerDay, 60);
  assert.equal(flows('REC-MUNITIONS-001').outputPerDay, 100);
});

test('gomma sintetica: stessa merce della gomma lavorata, via carbone, più costosa in ingressi (27/10/2026)', () => {
  const cat = catalog(); const f = json('industry/recipes.json');
  const nat = f.recipes.find((r) => r.id === 'REC-RUBBER-001'); const syn = f.recipes.find((r) => r.id === 'REC-RUBBER-SYN-001');
  assert.equal(syn.output.product, nat.output.product);
  assert.equal(syn.factory, 'FCT-CHEMICAL');
  assert.deepEqual(syn.inputs.map((i) => i.resource), ['coal']);
  assert.ok(syn.inputs[0].perUnit > nat.inputs[0].perUnit, 'ingressi per tonnellata superiori alla via naturale');
  assert.equal(fullCapacityFlows(syn, cat.byId.get('FCT-CHEMICAL')).outputPerDay, cat.byId.get('FCT-CHEMICAL').base_capacity_per_day);
  assert.deepEqual(validateRecipes(f, ctx()), []);
});
