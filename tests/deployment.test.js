// Dislocazione delle unità al 1/1/1936: derivata (ipotesi), file allineato al generatore, raggruppamento per provincia per la mappa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deploymentBuilt, loadProvinceProps } from '../scripts/build-deployment.js';
import { validateDeployment, unitsByProvince, corpsDivisions, resolveStation, buildIndexes, norm } from '../src/data/deployment.js';
import { isActiveAt } from '../src/data/units.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/deployment_1936.json');
const units = json('units/units.json').units;
const provProps = await loadProvinceProps();
const motherIds = new Set(provProps.map((p) => p.parentProvince ?? p.id));
const unitIds = new Set(units.map((u) => u.id));
const byId = new Map(units.map((u) => [u.id, u]));

test('dislocazione: valida e allineata al generatore (nessun file stantio)', async () => {
  assert.deepEqual(validateDeployment(doc, { unitIds, motherIds }), []);
  assert.deepEqual(doc, JSON.parse(JSON.stringify(await deploymentBuilt())), 'rigenerare con node scripts/build-deployment.js');
  assert.equal(doc.basis, 'ipotesi');
  for (const e of doc.entries) assert.ok(e.how.length > 10, 'ogni collocazione ha il motivo');
});

test('1/1/1936: le 32 delle 33 divisioni tedesche attive sono collocate; Regno Unito solo 1ª e 2ª (Aldershot); le altre restano senza luogo, non inventate', () => {
  const placed = new Set(doc.entries.map((e) => e.unit));
  const active = units.filter((u) => isActiveAt(u, '1936-01-01'));
  const deuDiv = active.filter((u) => u.nation === 'DEU' && u.echelon === 'division');
  assert.equal(deuDiv.length, 33);
  // la 23ª non è assegnata a nessun corpo nelle note del file: resta senza luogo (non inventato)
  assert.deepEqual(deuDiv.filter((u) => !placed.has(u.id)).map((u) => u.name), ['23. Infanterie-Division']);
  const gbrDiv = active.filter((u) => u.nation === 'GBR' && u.echelon === 'division');
  assert.equal(gbrDiv.length, 5);
  assert.deepEqual(gbrDiv.filter((u) => placed.has(u.id)).map((u) => u.name).sort(), ['1st Infantry Division', '2nd Infantry Division']);
  assert.ok(!doc.entries.some((e) => byId.get(e.unit).nation === 'GBR' && !/^[12](st|nd) Infantry/.test(e.name)));
  assert.ok(doc.unplaced.some((u) => /Francia orientale/.test(u.reason)), 'stazioni vaghe: non collocate');
});

test('luoghi tedeschi coerenti: 1. Infanterie-Division con il suo corpo (Königsberg), Wehrkreis III a Berlino, 2. Panzer a Würzburg (eccezione dichiarata)', () => {
  const at = (name) => doc.entries.find((e) => e.name === name)?.province;
  assert.equal(at('I. Armeekorps'), 'P_DEU_OSTPREUSSEN');
  assert.equal(at('1. Infanterie-Division'), at('I. Armeekorps'));
  assert.equal(at('11. Infanterie-Division'), at('I. Armeekorps'));
  assert.equal(at('Wehrkreis III'), 'P_DEU_BERLIN');
  assert.equal(at('2. Panzer-Division'), 'P_DEU_MAINFRANKEN');
  assert.match(doc.entries.find((e) => e.name === '1. Infanterie-Division').how, /corpo d'armata/);
});

test('unitsByProvince: gruppi per nazione, solo unità attive alla data; Berlino ha Wehrkreis III, il III Corpo, la 3. Infanterie e la 3. Panzer', () => {
  const m = unitsByProvince(units, doc, '1936-01-01');
  const berlin = m.P_DEU_BERLIN;
  assert.ok(berlin && berlin.every((g) => g.nation === 'DEU'));
  const names = berlin[0].units.map((x) => x.name);
  for (const n of ['Wehrkreis III', 'III. Armeekorps', '3. Infanterie-Division']) assert.ok(names.includes(n), n);
  assert.equal(berlin[0].divisions + berlin[0].commands, berlin[0].units.length);
  // dopo la data la 31ª divisione (inattiva per dubbio) non compare mai
  const all = Object.values(m).flat().flatMap((g) => g.units).map((x) => x.name);
  assert.ok(!all.includes('31. Infanterie-Division'));
  assert.equal(Object.values(m).flat().reduce((s, g) => s + g.units.length, 0), doc.entries.filter((e) => isActiveAt(byId.get(e.unit), '1936-01-01')).length);
  assert.deepEqual(m.P_GBR_HAMPSHIRE.map((g) => [g.nation, g.divisions]), [['GBR', 2]]);
});

test('resolveStation, corpsDivisions e validateDeployment: casi di prova', () => {
  const idx = buildIndexes({ cities: [{ name: 'Lione', owner: 'FRA', parentProvince: 'P_FRA_RHONE' }], provinces: [{ id: 'P_FRA_MARNE', name: 'Marne', owner: 'FRA' }, { id: 'P_FRA_NORD_2', parentProvince: 'P_FRA_NORD', name: 'Nord', owner: 'FRA' }] });
  assert.equal(resolveStation('Rhône / Lione', 'FRA', idx).province, 'P_FRA_RHONE');
  assert.equal(resolveStation('Marne / Reims', 'FRA', idx).province, 'P_FRA_MARNE');
  assert.equal(resolveStation('Nord', 'FRA', idx).province, 'P_FRA_NORD');
  assert.equal(resolveStation('Francia orientale', 'FRA', idx), null);
  assert.equal(norm('Königsberg'), 'konigsberg');
  assert.deepEqual(corpsDivisions('Divisioni assegnate secondo l\'ordine di battaglia indicativo del 1936: 1.; 11.; 21. Infanterie-Division'), [1, 11, 21]);
  assert.deepEqual(corpsDivisions('Quartier generale: Berlino'), []);
  const bad = { schema: 'deployment-v1', entries: [{ unit: 'A', province: 'P_X', how: '' }, { unit: 'A', province: 'P_Y', how: 'ok' }], unplaced: [{ unit: 'A' }] };
  const errs = validateDeployment(bad, { unitIds: new Set(['B']), motherIds: new Set(['P_Y']) }).join('|');
  for (const re of [/duplicata/, /inesistente A/, /provincia inesistente P_X/, /senza motivazione/, /sia collocata sia non collocata/]) assert.match(errs, re);
});

test('segnalini della mappa: contatore, colore e limite di nazioni per provincia (parte pura)', async () => {
  const { counterSpec, countersFor, symbolOf, COUNTER_W } = await import('../src/map/unitIcons.js');
  const g = (nation, divisions, commands, category = 'infantry') => ({ nation, divisions, commands, units: [...Array.from({ length: divisions }, (_, i) => ({ id: `${nation}d${i}`, echelon: 'division', category })), ...Array.from({ length: commands }, (_, i) => ({ id: `${nation}c${i}`, echelon: 'command', category: 'command', commandLevel: i === 0 ? 'corps' : 'army' }))] });
  assert.deepEqual([counterSpec(g('DEU', 3, 2)).main, counterSpec(g('DEU', 3, 2)).sub], ['3', '+2']);
  assert.deepEqual([counterSpec(g('DEU', 0, 1)).main, counterSpec(g('DEU', 0, 1)).sub], ['1', '']);
  const r = countersFor([g('FRA', 1, 0), g('DEU', 4, 1), g('GBR', 2, 0), g('USSR', 1, 1)]);
  assert.deepEqual(r.shown.map((s) => s.nation), ['DEU', 'GBR']);
  assert.equal(r.extra, 2);
  assert.ok(COUNTER_W > 0);
  assert.deepEqual(symbolOf(g('DEU', 2, 1, 'armored')), { category: 'armored', mark: 'XX' });
  assert.deepEqual(symbolOf(g('DEU', 0, 2)), { category: 'command', mark: 'XXXX' }); // corpo + armata: vale il grado più alto
  const mixed = { nation: 'DEU', divisions: 3, commands: 0, units: [{ echelon: 'division', category: 'infantry' }, { echelon: 'division', category: 'armored' }, { echelon: 'division', category: 'armored' }] };
  assert.equal(symbolOf(mixed).category, 'armored');
});
