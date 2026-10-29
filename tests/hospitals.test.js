// Ospedali e cura dei feriti con la medicina (29/10/2026): regole pure, dati e validatore. Non collegato al ciclo di partita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hospitalCapacity, hospitalDay } from '../src/rules/hospitals.js';
import { validateHospitalCare } from '../src/data/hospitals.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const care = json('medical/hospital_care.json');
const ctx = { resources: json('resources.json'), buildings: json('buildings.json').buildings };
const clone = (x) => JSON.parse(JSON.stringify(x));

test('dati reali validi; l\'ospedale da campo punta all\'edificio esistente', () => {
  assert.deepEqual(validateHospitalCare(care, ctx), []);
  assert.equal(care.kinds.field_hospital.buildingId, 'field_hospital');
});

test('capacità: posti per tipo × numero; tipo o numero non validi sono errori', () => {
  assert.equal(hospitalCapacity({ field_hospital: 3, hospital: 2 }, care), 300 + 2000);
  assert.equal(hospitalCapacity({}, care), 0);
  assert.throws(() => hospitalCapacity({ tent: 1 }, care), RangeError);
  assert.throws(() => hospitalCapacity({ hospital: 1.5 }, care), RangeError);
});

test('con tutta la medicina: guarigione piena, nessun morto, consumo 2 kg a paziente', () => {
  const r = hospitalDay({ wounded: 100, medicine: 10, counts: { field_hospital: 1 } }, care);
  assert.deepEqual(r, { treated: 100, waiting: 0, medicineNeed: 0.2, medicineUsed: 0.2, coverage: 1, recovered: 4, died: 0, wounded: 96 });
});

test('senza medicina: guarigione dimezzata e 0,4% di morti; a metà medicina, a metà', () => {
  const none = hospitalDay({ wounded: 100, medicine: 0, counts: { field_hospital: 1 } }, care);
  assert.equal(none.recovered, 2); assert.equal(none.died, 0.4); assert.equal(none.medicineUsed, 0);
  const half = hospitalDay({ wounded: 100, medicine: 0.1, counts: { field_hospital: 1 } }, care);
  assert.equal(half.coverage, 0.5); assert.equal(half.recovered, 3); assert.equal(half.died, 0.2);
});

test('senza posti i feriti muoiono più in fretta (1%) e nessuna medicina viene usata', () => {
  const r = hospitalDay({ wounded: 1000, medicine: 5, counts: {} }, care);
  assert.equal(r.treated, 0); assert.equal(r.waiting, 1000); assert.equal(r.medicineUsed, 0); assert.equal(r.recovered, 0); assert.equal(r.died, 10);
});

test('oltre la capacità: i posti curano, gli altri attendono; conservazione degli uomini; mai più medicina della scorta', () => {
  const r = hospitalDay({ wounded: 500, medicine: 0.05, counts: { field_hospital: 2, hospital: 1 } }, care);
  assert.equal(r.treated, 500);
  const r2 = hospitalDay({ wounded: 500, medicine: 0.05, counts: { field_hospital: 2 } }, care);
  assert.equal(r2.treated, 200); assert.equal(r2.waiting, 300);
  assert.ok(r2.medicineUsed <= 0.05);
  assert.ok(Math.abs(r2.recovered + r2.died + r2.wounded - 500) < 0.01, 'guariti + morti + rimasti = feriti iniziali');
  assert.throws(() => hospitalDay({ wounded: -1, medicine: 0, counts: {} }, care), RangeError);
});

test('la medicina del repository è la stessa dei cavalli: un solo prodotto, due consumatori', () => {
  const recipes = json('industry/recipes.json').recipes;
  const consumers = recipes.filter((r) => r.inputs.some((i) => i.resource === care.medicine)).map((r) => r.id);
  assert.deepEqual(consumers, ['REC-HORSES-001']);
});

test('validatore: errori espliciti', () => {
  const bad = clone(care); bad.kinds.field_hospital.buildingId = 'nope'; bad.medicinePerPatientPerDay = 0; bad.kinds.hospital.capacityPatients = 0; bad.medicine = 'iron_ore';
  const errs = validateHospitalCare(bad, ctx);
  assert.ok(errs.some((e) => /nope/.test(e)) && errs.some((e) => /medicinePerPatientPerDay/.test(e)) && errs.some((e) => /capacità/.test(e)) && errs.some((e) => /iron_ore/.test(e)));
  assert.match(validateHospitalCare({ schema: 'x' }, ctx)[0], /schema/);
});

// --- costruzione, personale dal pool reclutabile, copertura e retrovie ---
import { hospitalBuildCost, hospitalStaff, coveredProvinces, isRear } from '../src/rules/hospitals.js';
import { createConstruction } from '../src/game/construction.js';
import { nationManpowerPool } from '../src/game/forcesState.js';
import { newGame } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { loadIndustryCatalogFrom } from '../src/data/industry.js';
import { provinceBuildOptions } from '../src/ui/buildOptions.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const cat = loadIndustryCatalogFrom(text);
const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const pop = json('population/population.json');
const units = json('units/units.json').units;
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy: json('economy/economy.json'), population: pop };
const manpowerAvailable = (state, id) => nationManpowerPool(state, id, { units, population: state.nations[id].population, baseShare: pop.recruitment.baseShare }).available;
const build = createConstruction({ catalog, economy: start.economy, sites: { byProvince: {} }, hydro: json('resources/hydro_plants.json'), political, workersShare: pop.workersShare.value, hospitals: { params: care, manpowerAvailable } });
const game = () => newGame({ nation: 'DEU', political, ownersWithProvinces: nationIds, start }).state;
const PROV = 'P_DEU_BERLIN'; // qualunque id di provincia tedesca: il controllo usa l'entità politica

test('costi: ospedale da campo pochissimo (2 ECV, niente acciaio) e 100 uomini; ospedale 30 ECV, 20 t, 300 uomini', () => {
  assert.deepEqual(hospitalBuildCost('field_hospital', care), { ecv: 2, steel: 0, days: 7, staff: 100 });
  assert.deepEqual(hospitalBuildCost('hospital', care), { ecv: 30, steel: 20, days: 45, staff: 300 });
  assert.throws(() => hospitalBuildCost('tent', care), RangeError);
});

test('copertura: l\'ospedale copre la sua provincia; il campo anche le confinanti; ordine stabile e senza doppioni', () => {
  const nb = (id) => ({ A: ['C', 'B', 'B', 'A'], B: ['A'], C: ['A'] }[id]);
  assert.deepEqual(coveredProvinces('hospital', 'A', nb, care), ['A']);
  assert.deepEqual(coveredProvinces('field_hospital', 'A', nb, care), ['A', 'B', 'C']);
});

test('retrovie: nessuna confinante controllata da un nemico', () => {
  const ctrl = { A: 'DEU', B: 'DEU', C: 'POL' };
  const nb = (id) => ({ A: ['B'], B: ['A', 'C'], C: ['B'] }[id]);
  const ops = { neighbors: nb, controllerOf: (id) => ctrl[id], isHostile: (n) => n === 'POL' };
  assert.equal(isRear('A', ops), true);
  assert.equal(isRear('B', ops), false);
});

test('ordine: paga ECV e acciaio, prenota 100 uomini del pool, a fine lavori l\'ospedale da campo esiste e il personale resta fuori dal pool', () => {
  const s0 = game();
  const pool0 = manpowerAvailable(s0, 'DEU');
  const r = build.start(s0, 'DEU', { kind: 'hospital', hospitalKind: 'field_hospital', provinceId: PROV });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.state.nations.DEU.balance, s0.nations.DEU.balance - 2);
  assert.equal(r.state.nations.DEU.stocks.steel, s0.nations.DEU.stocks.steel);
  assert.equal(hospitalStaff(r.state.nations.DEU), 100);
  assert.equal(manpowerAvailable(r.state, 'DEU'), pool0 - 100, 'il personale è prenotato subito');
  let s = r.state;
  for (let i = 0; i < 7; i += 1) s = advanceDay(s, [build.constructionDay]);
  assert.equal(s.nations.DEU.construction.length, 0);
  assert.equal(s.nations.DEU.hospitals.length, 1);
  assert.deepEqual({ kind: s.nations.DEU.hospitals[0].kind, provinceId: s.nations.DEU.hospitals[0].provinceId, staff: s.nations.DEU.hospitals[0].staff }, { kind: 'field_hospital', provinceId: PROV, staff: 100 });
  assert.equal(manpowerAvailable(s, 'DEU'), pool0 - 100, 'finito: il personale resta fuori dal pool, non torna e non si conta due volte');
  assert.equal(s0.nations.DEU.hospitals.length, 0, 'stato precedente intatto');
});

test('ospedale: uno solo per provincia (anche in coda); il campo no, se ne possono fare più', () => {
  const s0 = game();
  const a = build.start(s0, 'DEU', { kind: 'hospital', hospitalKind: 'hospital', provinceId: PROV });
  assert.equal(a.ok, true, JSON.stringify(a));
  const b = build.start(a.state, 'DEU', { kind: 'hospital', hospitalKind: 'hospital', provinceId: PROV });
  assert.deepEqual({ ok: b.ok, reason: b.reason }, { ok: false, reason: 'hospital_exists' });
  const c1 = build.start(a.state, 'DEU', { kind: 'hospital', hospitalKind: 'field_hospital', provinceId: PROV });
  const c2 = build.start(c1.state, 'DEU', { kind: 'hospital', hospitalKind: 'field_hospital', provinceId: PROV });
  assert.equal(c2.ok, true);
  assert.equal(hospitalStaff(c2.state.nations.DEU), 300 + 100 + 100);
});

test('pool esaurito o cassa vuota: rifiuto con l\'elenco di ciò che manca; provincia altrui: rifiuto', () => {
  const s0 = game();
  const poor = { ...s0, nations: { ...s0.nations, DEU: { ...s0.nations.DEU, population: 1000 } } }; // pool = 50 uomini
  const r = build.start(poor, 'DEU', { kind: 'hospital', hospitalKind: 'field_hospital', provinceId: PROV });
  assert.equal(r.ok, false); assert.ok(r.missing.some((m) => m.what === 'manpower' && m.need === 100 && m.have === 50));
  const broke = { ...s0, nations: { ...s0.nations, DEU: { ...s0.nations.DEU, balance: 1 } } };
  assert.ok(build.start(broke, 'DEU', { kind: 'hospital', hospitalKind: 'field_hospital', provinceId: PROV }).missing.some((m) => m.what === 'ecv'));
  assert.equal(build.start(s0, 'DEU', { kind: 'hospital', hospitalKind: 'field_hospital', provinceId: 'P_FRA_PARIS' }).reason, 'not_controlled');
  assert.equal(build.start(s0, 'DEU', { kind: 'hospital', hospitalKind: 'tent', provinceId: PROV }).reason, 'unknown_hospital');
  const noData = createConstruction({ catalog, economy: start.economy, sites: { byProvince: {} }, hydro: json('resources/hydro_plants.json'), political, workersShare: pop.workersShare.value });
  assert.equal(noData.start(s0, 'DEU', { kind: 'hospital', hospitalKind: 'hospital', provinceId: PROV }).reason, 'no_hospital_data');
});

test('retrovie applicate quando il gioco fornisce isRear; opzioni per l\'interfaccia con costo e motivo del rifiuto', () => {
  const guarded = createConstruction({ catalog, economy: start.economy, sites: { byProvince: {} }, hydro: json('resources/hydro_plants.json'), political, workersShare: pop.workersShare.value, hospitals: { params: care, manpowerAvailable, isRear: () => false } });
  const s0 = game();
  assert.equal(guarded.start(s0, 'DEU', { kind: 'hospital', hospitalKind: 'field_hospital', provinceId: PROV }).reason, 'not_rear');
  assert.equal(guarded.start(s0, 'DEU', { kind: 'hospital', hospitalKind: 'hospital', provinceId: PROV }).ok, true, 'l\'ospedale fisso non ha il vincolo delle retrovie');
  const opts = provinceBuildOptions(s0, 'DEU', PROV, { build: guarded, catalog, sites: { byProvince: {} }, economy: start.economy, hospitals: care });
  const field = opts.hospitals.find((o) => o.order.hospitalKind === 'field_hospital');
  assert.deepEqual({ ok: field.ok, cost: field.cost.staff }, { ok: false, cost: 100 });
  assert.match(field.message, /retrovie/);
  assert.equal(opts.hospitals.find((o) => o.order.hospitalKind === 'hospital').ok, true);
});
