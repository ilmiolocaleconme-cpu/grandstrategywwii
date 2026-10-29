// Template fanteria britannica 1936: previsto provvisorio (cifre 1939-40, ipotesi), parte come quadro al 30% (esempio dell'utente), mobilitazione al 100% con le risorse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTemplate, leaves } from '../src/data/templates.js';
import { initialEffective } from '../src/rules/readiness.js';
import { initForces, createForcesState, enlistedManpower } from '../src/rules/forces.js';
import { planReinforcements, dispatch, applyArrivals, mobilize, MANPOWER_ITEM } from '../src/rules/reinforcements.js';
import { validateForcesShape } from '../src/game/forcesState.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const t = json('units/templates/divisione_fanteria_gran_bretagna_1936.json');
const units = json('units/units.json').units;
const ratio = json('units/readiness.json').initialFillRatio.value;
const init = () => initForces(createForcesState(), { units, templates: [t], ratio, date: '1936-01-01' });

test('template GBR: valido, 3 brigate × 3 battaglioni, previsto = cifre 1939-40 marcate ipotesi con fonte e anno', () => {
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.structure.brigateFanteria.value * t.structure.battaglioniPerBrigata.value, 9);
  assert.equal(t.manpower.war.value, t.referenceFigures.uominiTotali1939_40.value);
  assert.equal(t.equipment.artiglieriaCampale.value, t.referenceFigures.cannoni25libbre1939_40.value);
  assert.equal(t.equipment.controcarro.value, t.referenceFigures.controcarro2libbre1939_40.value);
  assert.equal(t.equipment.antiaerei.value, t.referenceFigures.antiaerei20mm1939_40.value);
  for (const [, l] of leaves(t).filter(([, x]) => typeof x.value === 'number')) { assert.equal(l.basis, 'ipotesi'); assert.match(String(l.referenceYear), /^1939/); assert.ok(l.source.length > 20); }
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
    assert.deepEqual(d.items[MANPOWER_ITEM], { planned: 13863, effective: Math.round(13863 * 0.3), source: 'ratio' });
    assert.equal(d.items['equipment.artiglieriaCampale'].effective, Math.round(72 * 0.3));
  }
  assert.equal(enlistedManpower(r.state, units, 'GBR'), 5 * 4159);
  assert.deepEqual(validateForcesShape(r.state), []);
  assert.deepEqual(initialEffective(t, ratio)[MANPOWER_ITEM].effective, Math.round(13863 * ratio), 'senza initialFillRatio varrebbe la frazione globale: il template la sovrascrive solo in buildDivision');
});

test('il quadro non riceve rinforzi; con la mobilitazione sale al 100% solo se ci sono le risorse, mai oltre il previsto', () => {
  const f0 = init().state;
  const [id] = Object.keys(f0.divisions);
  const ctx = { units, nation: 'GBR', date: '1936-02-01', transitDays: () => 7 };
  const before = planReinforcements(f0, { ...ctx, poolAvailable: 1e6, stocks: { 'equipment.artiglieriaCampale': 1000 } });
  assert.equal(before.transfers.length, 0); assert.ok(before.skipped.every((s) => s.reason === 'cadre'));
  assert.throws(() => mobilize(mobilize(f0, id), id), /non è un quadro/);
  const f1 = mobilize(f0, id);
  assert.equal(f0.divisions[id].cadre, true, 'stato originale intatto');
  // risorse insufficienti: sale solo in parte
  const poor = planReinforcements(f1, { ...ctx, poolAvailable: 1000, stocks: { 'equipment.artiglieriaCampale': 10 } });
  assert.deepEqual(poor.transfers.filter((t2) => t2.divisionId === id).map((t2) => [t2.item, t2.qty]).sort(), [[MANPOWER_ITEM, 1000], ['equipment.artiglieriaCampale', 10]].sort());
  assert.ok(poor.skipped.some((s) => s.divisionId === id && s.reason === 'no_resources'));
  // risorse sufficienti: 100% dopo il trasferimento
  const rich = planReinforcements(f1, { ...ctx, poolAvailable: 1e6, stocks: { 'equipment.artiglieriaCampale': 1000, 'equipment.controcarro': 1000, 'equipment.antiaerei': 1000 } });
  const done = applyArrivals(dispatch(f1, rich.transfers), '1936-02-08').forces.divisions[id];
  for (const it of Object.values(done.items)) assert.equal(it.effective, it.planned);
  assert.equal(done.items[MANPOWER_ITEM].effective, 13863);
  assert.ok(!rich.transfers.some((x) => x.divisionId !== id), 'le altre 4 restano quadri');
});
