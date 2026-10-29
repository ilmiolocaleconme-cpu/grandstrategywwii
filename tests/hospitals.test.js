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
