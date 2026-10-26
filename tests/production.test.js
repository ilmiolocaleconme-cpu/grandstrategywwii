// Produzione giornaliera: collo di bottiglia, energia, danno, bilancio, determinismo (scenari A, B, D, F della specifica).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { produceDay, checkBalance } from '../src/rules/production.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const recipesFile = JSON.parse(text('industry/recipes.json'));
const fact = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const catalog = { recipes: new Map(recipesFile.recipes.map((r) => [r.id, r])), factories: fact.byId };
const mill = (extra = {}) => ({ id: 'M1', type: 'FCT-STEEL', recipeId: 'REC-STEEL-001', ...extra });
const power = (extra = {}) => ({ id: 'P1', type: 'FCT-POWER', recipeId: 'REC-ELECTRIC-COAL-001', ...extra });
const FULL = { iron_ore: 160, coal: 80 }; // fabbisogno giornaliero di un'acciaieria a pieno regime
const run = (facilities, stock, hydroMw = 100) => produceDay({ facilities, stock, hydroMw }, catalog);

test('A — produzione normale: ingressi ed energia pieni → 100 t di acciaio, bilancio che torna', () => {
  const r = run([mill()], FULL);
  assert.equal(r.facilities[0].efficiency, 1);
  assert.equal(r.facilities[0].state, 'operativo');
  assert.equal(r.facilities[0].bottleneck, null);
  assert.equal(r.stock.steel, 100);
  assert.equal(r.stock.iron_ore, 0); assert.equal(r.stock.coal, 0);
  assert.deepEqual(checkBalance(r.balance), []);
});

test('B — carenza di input: carbone 32/80 → efficienza 40%, collo di bottiglia carbone, il ferro in eccesso resta', () => {
  const r = run([mill()], { iron_ore: 160, coal: 32 });
  const f = r.facilities[0];
  assert.equal(f.efficiency, 0.4);
  assert.equal(f.bottleneck, 'coal');
  assert.deepEqual(f.inputRatios, { iron_ore: 1, coal: 0.4 });
  assert.equal(f.state, 'ridotta capacità');
  assert.equal(r.stock.steel, 40);
  assert.equal(r.stock.iron_ore, 96, 'consuma solo il 40% del ferro: 64 usati, 96 restano');
  assert.equal(r.stock.coal, 0);
  assert.deepEqual(checkBalance(r.balance), []);
});

test('B2 — energia insufficiente: 6 MW su 12 → 50%, collo di bottiglia "energy"', () => {
  const r = run([mill()], FULL, 6);
  assert.equal(r.powerMw.ratio, 0.5);
  assert.equal(r.facilities[0].efficiency, 0.5);
  assert.equal(r.facilities[0].bottleneck, 'energy');
  assert.equal(r.stock.steel, 50);
});

test('centrale a carbone: 120 MW netti consumano 60 t di carbone; il pool alimenta le fabbriche, nessuno stock di elettricità', () => {
  const r = run([power(), mill()], { ...FULL, coal: 80 + 60 }, 0);
  assert.equal(r.powerMw.supply, 120);
  assert.equal(r.powerMw.demand, 12, 'la centrale non ha autoconsumo e non conta nella domanda');
  assert.equal(r.facilities.find((f) => f.id === 'P1').produced.electricity_mw, 120);
  assert.equal(r.facilities.find((f) => f.id === 'M1').efficiency, 1);
  assert.equal('electricity' in r.stock, false, 'l\'elettricità è un flusso: mai in scorta');
  assert.equal(r.stock.coal, 0);
  assert.deepEqual(checkBalance(r.balance), []);
});

test('centrale senza carbone: potenza zero, un\'altra fabbrica (alluminio, senza carbone) si ferma per carenza di energia', () => {
  const alu = { id: 'A1', type: 'FCT-ALUMINIUM', recipeId: 'REC-ALU-001' };
  const r = run([power(), alu], { bauxite: 280 }, 0);
  assert.equal(r.facilities.find((f) => f.id === 'P1').produced.electricity_mw, 0);
  assert.equal(r.facilities.find((f) => f.id === 'P1').bottleneck, 'coal');
  const a = r.facilities.find((f) => f.id === 'A1');
  assert.equal(a.efficiency, 0); assert.equal(a.state, 'fermo'); assert.equal(a.bottleneck, 'energy');
  assert.equal(r.stock.bauxite, 280, 'senza energia non consuma nulla');
  assert.deepEqual(checkBalance(r.balance), []);
});

test('D — impianto danneggiato: danno 40% → capacità 60 (100 nominali × 0,6), consumi proporzionali', () => {
  const r = run([mill({ damage: 0.4 })], FULL);
  assert.equal(r.facilities[0].efficiency, 0.6);
  assert.equal(r.stock.steel, 60);
  assert.equal(r.stock.iron_ore, 160 - 96);
  assert.equal(r.facilities[0].bottleneck, null, 'non è un collo di bottiglia ma un danno: la UI li distingue');
  const heavy = run([mill({ damage: 0.6 })], FULL).facilities[0];
  assert.equal(heavy.state, 'danneggiato');
});

test('E — riparazione: danno 0 → capacità piena; la riparazione non crea prodotti da sola', () => {
  const damaged = run([mill({ damage: 0.4 })], {});
  assert.equal(damaged.stock.steel ?? 0, 0, 'senza ingressi non si produce nulla, danneggiato o no');
  const repaired = run([mill({ damage: 0 })], FULL);
  assert.equal(repaired.facilities[0].efficiency, 1);
  assert.equal(repaired.stock.steel, 100);
});

test('priorità: con ingressi per una sola acciaieria prima serve quella a priorità più bassa (numero minore)', () => {
  const a = mill({ id: 'MA', priority: 50 }); const b = mill({ id: 'MB', priority: 10 });
  const r = run([a, b], FULL);
  assert.equal(r.facilities[0].id, 'MB');
  assert.equal(r.facilities[0].efficiency, 1);
  assert.equal(r.facilities.find((f) => f.id === 'MA').efficiency, 0);
  assert.equal(r.stock.steel, 100);
});

test('catena: ferro+carbone → acciaio → macchinari nello stesso giorno, in ordine di priorità, bilancio che torna', () => {
  const machinery = { id: 'MC', type: 'FCT-MACHINERY', recipeId: 'REC-MACHINERY-001', priority: 200 };
  const r = run([machinery, mill()], FULL, 1000);
  assert.equal(r.facilities[0].id, 'M1', 'priorità 100 prima di 200');
  assert.equal(r.stock.machinery, 70, '84 t di acciaio su 100 bastano per la capacità piena (70 t)');
  assert.equal(r.stock.steel, 16, '100 prodotte − 84 usate');
  assert.equal(r.balance.produced.steel, 100);
  assert.deepEqual(checkBalance(r.balance), []);
});

test('F — più giorni: deterministico, nessuna duplicazione, bilancio cumulativo', () => {
  let stock = { iron_ore: 480, coal: 240 }; let steel = 0;
  const first = run([mill()], stock);
  for (let d = 0; d < 3; d += 1) { const r = run([mill()], stock); assert.deepEqual(checkBalance(r.balance), []); stock = r.stock; }
  assert.equal(stock.steel, 300);
  assert.equal(stock.iron_ore, 0); assert.equal(stock.coal, 0);
  assert.deepEqual(run([mill()], { iron_ore: 480, coal: 240 }), first, 'stesso ingresso → stesso risultato');
  assert.equal(steel, 0);
  const again = run([mill()], stock);
  assert.equal(again.facilities[0].efficiency, 0, 'senza ingressi non si produce: nessun prodotto dal nulla');
  assert.equal(again.stock.steel, 300);
});

test('input non mutati e errori espliciti', () => {
  const stock = { iron_ore: 160, coal: 80 }; const facilities = [mill()];
  const snap = JSON.stringify([stock, facilities]);
  run(facilities, stock);
  assert.equal(JSON.stringify([stock, facilities]), snap);
  assert.throws(() => run([mill({ recipeId: 'REC-NOPE' })], stock), /sconosciuta/);
  assert.throws(() => run([mill({ recipeId: 'REC-ALU-001' })], stock), /non di FCT-STEEL/);
  assert.throws(() => run([mill({ damage: 1.5 })], stock), RangeError);
  assert.equal(run([mill({ active: false })], stock).facilities.length, 0, 'fabbrica spenta: ignorata');
});

test('checkBalance rileva una risorsa dal nulla', () => {
  assert.ok(checkBalance({ initial: { coal: 10 }, produced: {}, consumed: {}, final: { coal: 99 } }).length > 0);
  assert.ok(checkBalance({ initial: { coal: 1 }, produced: {}, consumed: { coal: 5 }, final: { coal: -4 } }).some((e) => e.includes('negativo')));
});
