// Template fanteria britannica 1936. Dal 24/11/2026 (schema unico, scelta A dell'utente) è la somma dei battaglioni di
// data/units/modules/modules_gbr.json: 3 brigate su 4 battaglioni, 15.160 uomini (prima: voci generiche con le cifre 1939-40, 13.863 uomini).
// Restano le regole del quadro: parte al 30% (esempio dell'utente del 29/10/2026), mobilitazione al 100% con le risorse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTemplate } from '../src/data/templates.js';
import { initialEffective } from '../src/rules/readiness.js';
import { initForces, createForcesState, enlistedManpower } from '../src/rules/forces.js';
import { planReinforcements, dispatch, applyArrivals, mobilize, MANPOWER_ITEM } from '../src/rules/reinforcements.js';
import { validateForcesShape } from '../src/game/forcesState.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const t = json('units/templates/divisione_fanteria_gran_bretagna_1936.json');
const units = json('units/units.json').units;
const ratio = json('units/readiness.json').initialFillRatio.value;
const init = () => initForces(createForcesState(), { units, templates: [t], ratio, date: '1936-01-01' });
const MEN = 15160;

test('template GBR 1936: valido, dai battaglioni (12 battaglioni di fanteria), stime segnalate, quadro al 30%', () => {
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.modules.find((m) => m.id === 'MOD-GBR-INF-1936').count, 12);
  assert.equal(t.manpower.war.value, MEN);
  assert.equal(t.equipment['ART-GBR-18PDR'].value, 36);
  assert.equal(t.equipment['ART-GBR-HOW45'].value, 12);
  assert.equal(t.equipment['MG-GBR-LEWIS'].value, 384);
  assert.equal(t.manpower.war.reliability, 'ESTIMATED');
  assert.equal(t.initialFillRatio.value, 0.3); assert.equal(t.initialFillRatio.basis, 'USER_EXAMPLE'); assert.equal(t.startsAsCadre, true);
  assert.equal(t.manpower.peace.value, null, 'organico di pace 1936 non trovato: non inventato');
});

test('al 1/1/1936: 5 divisioni regolari britanniche come quadro al 30% (non 0,915); Germania invariata', () => {
  const r = init();
  const ids = Object.keys(r.state.divisions);
  assert.equal(ids.length, 5);
  for (const id of ids) {
    const u = units.find((x) => x.id === id);
    assert.equal(u.nation, 'GBR');
    const d = r.state.divisions[id];
    assert.equal(d.cadre, true);
    assert.deepEqual(d.items[MANPOWER_ITEM], { planned: MEN, effective: Math.round(MEN * 0.3), source: 'ratio' });
    assert.equal(d.items['equipment.ART-GBR-18PDR'].effective, Math.round(36 * 0.3));
  }
  assert.equal(enlistedManpower(r.state, units, 'GBR'), 5 * Math.round(MEN * 0.3));
  assert.deepEqual(validateForcesShape(r.state), []);
  assert.deepEqual(initialEffective(t, ratio)[MANPOWER_ITEM].effective, Math.round(MEN * ratio), 'senza initialFillRatio varrebbe la frazione globale: il template la sovrascrive solo in buildDivision');
});

test('il quadro non riceve rinforzi; con la mobilitazione sale al 100% solo se ci sono le risorse, mai oltre il previsto', () => {
  const f0 = init().state;
  const [id] = Object.keys(f0.divisions);
  const ctx = { units, nation: 'GBR', date: '1936-02-01', transitDays: () => 7 };
  const before = planReinforcements(f0, { ...ctx, poolAvailable: 1e6, stocks: { 'equipment.ART-GBR-18PDR': 1000 } });
  assert.equal(before.transfers.length, 0); assert.ok(before.skipped.every((s) => s.reason === 'cadre'));
  assert.throws(() => mobilize(mobilize(f0, id), id), /non è un quadro/);
  const f1 = mobilize(f0, id);
  assert.equal(f0.divisions[id].cadre, true, 'stato originale intatto');
  // risorse insufficienti: sale solo in parte
  const poor = planReinforcements(f1, { ...ctx, poolAvailable: 1000, stocks: { 'equipment.ART-GBR-18PDR': 10 } });
  const mine = poor.transfers.filter((x) => x.divisionId === id);
  assert.deepEqual(mine.find((x) => x.item === MANPOWER_ITEM)?.qty, 1000);
  assert.deepEqual(mine.find((x) => x.item === 'equipment.ART-GBR-18PDR')?.qty, 10);
  assert.ok(poor.skipped.some((s) => s.divisionId === id && s.reason === 'no_resources'));
  // risorse sufficienti: 100% dopo il trasferimento
  const stocks = Object.fromEntries(Object.keys(t.equipment).map((k) => [`equipment.${k}`, 100000]));
  const rich = planReinforcements(f1, { ...ctx, poolAvailable: 1e6, stocks: { ...stocks, horses: 10000 } });
  const done = applyArrivals(dispatch(f1, rich.transfers), '1936-02-08').forces.divisions[id];
  for (const [k, it] of Object.entries(done.items)) assert.equal(it.effective, it.planned, k);
  assert.equal(done.items[MANPOWER_ITEM].effective, MEN);
  assert.ok(!rich.transfers.some((x) => x.divisionId !== id), 'le altre 4 restano quadri');
});
