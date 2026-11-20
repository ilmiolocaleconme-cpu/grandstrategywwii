// Editor a moduli (18/11/2026, decisioni dell'utente: limiti storici, riorganizzazione graduale). Dati reali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { designProblems, designCategory, designTemplate, validateEditorRules, validateModules, moduleAvailable } from '../src/data/modules.js';
import { createDesign, deleteDesign, reorganizeDivision, reorganizePreview, validateDesignsState, divisionsUsing, designsOf } from '../src/game/designsState.js';
import { moduleGroups, bump, designSummary, divisionRows, reorgNeeds } from '../src/ui/designView.js';
import { initForces } from '../src/rules/forces.js';
import { unitOf } from '../src/rules/unitRegistry.js';
import { validateTemplate } from '../src/data/templates.js';
import { reinforcementNeeds } from '../src/rules/reinforcementView.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/modules/modules_deu.json');
const modules = doc.modules;
const rules = json('units/modules/editor_rules.json');
const map = json('units/equipment/upgrade_map.json');
const units = json('units/units.json').units;
const tplInf = json('units/templates/divisione_fanteria_germania_1936.json');
const researched = new Set(['TECH-MOT-INF', 'TECH-ARM-GUN-3750', 'TECH-ARM-GUN-75S', 'TECH-ARM-RADIO', 'TECH-INF-AIRBORNE']);
const ctx = { modules, rules, researched };
const PZ = [['MOD-DEU-TANK', 2], ['MOD-DEU-MOT-INF', 4], ['MOD-DEU-ART-MOT', 3], ['MOD-DEU-AT-MOT', 1], ['MOD-DEU-REGT-HVY-MOT', 2], ['MOD-DEU-SUPPORT-MOT', 1]];
const INF = [['MOD-DEU-INF', 9], ['MOD-DEU-REGT-HVY', 3], ['MOD-DEU-ART', 3], ['MOD-DEU-ART-HVY', 1], ['MOD-DEU-AT-MOT', 1], ['MOD-DEU-SUPPORT', 1]];
const infUnit = units.find((u) => u.nation === 'DEU' && u.echelon === 'division' && u.category === 'infantry' && u.startYear <= 1936 && !u.endYear);

function game() {
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const f = initForces({ divisions: {} }, { units: [infUnit], templates: [tplInf], ratio: 1, date: '1936-01-01' });
  return { date: '1936-03-01', forces: { schema: 6, initialized: true, ...f.state }, nations: { DEU: { stocks: { 'equipment.TNK-DEU-TANK': 50 } } }, unitsById };
}
const reCtx = (s, id) => ({ modules, unit: unitOf(s, id, s.unitsById), upgradeMap: map, isStockItem: (p) => p === 'horses' || /^equipment\.[A-Z]+-DEU-/.test(p) });

test('regole e battaglioni validi; composizioni storiche e modelli di partenza dentro i limiti', () => {
  for (const pr of doc.presets) assert.deepEqual(designProblems(pr.modules, { ...ctx, nation: 'DEU', date: '1939-09-01', researched }), [], pr.id);
  assert.deepEqual(validateEditorRules(rules), []);
  assert.deepEqual(validateModules(doc), []);
  for (const c of doc.compositions) assert.deepEqual(designProblems(c.modules, { ...ctx, nation: 'DEU', date: c.activeFrom, researched: new Set([...researched, 'TECH-MECH-HT']) }), [], c.templateId);
  assert.equal(modules.filter((m) => m.divisional).length, 2);
  for (const m of modules) assert.ok(m.name_de, `${m.id} senza nome tedesco`);
});

test('limiti storici: servizi, combattimento, massimi, data e tecnologia', () => {
  const p = (list, date = '1940-06-01', r = researched) => designProblems(list, { ...ctx, nation: 'DEU', date, researched: r });
  assert.deepEqual(p(PZ), []);
  assert.ok(p(PZ.filter(([id]) => id !== 'MOD-DEU-SUPPORT-MOT')).some((x) => /servizi/.test(x)));
  assert.ok(p([...PZ, ['MOD-DEU-SUPPORT', 1]]).some((x) => /servizi/.test(x)), 'un solo reparto di servizi');
  assert.ok(p([['MOD-DEU-ART', 3], ['MOD-DEU-SUPPORT', 1]]).some((x) => /combattimento/.test(x)));
  assert.ok(p([['MOD-DEU-TANK', 5], ['MOD-DEU-SUPPORT-MOT', 1]]).some((x) => /tank/.test(x)));
  assert.ok(p([['MOD-DEU-INF', 12], ['MOD-DEU-ART', 6], ['MOD-DEU-REGT-HVY', 4], ['MOD-DEU-SUPPORT', 1]]).some((x) => /troppi uomini/.test(x)));
  // 20/11/2026: il motivo è preciso («ricerca …», «disponibile dal …») invece di «non disponibile (data o tecnologia)»
  assert.ok(p([...PZ, ['MOD-DEU-STUG', 1]], '1940-06-01').some((x) => /ricerca «TECH-ARM-ASSAULT»/.test(x)), 'StuG senza tecnologia');
  assert.deepEqual(p([...PZ, ['MOD-DEU-STUG', 1]], '1940-06-01', new Set([...researched, 'TECH-ARM-ASSAULT'])), []);
  assert.ok(p([...PZ, ['MOD-DEU-STUG', 1]], '1939-12-01', new Set([...researched, 'TECH-ARM-ASSAULT'])).some((x) => /disponibile dal 01\/02\/1940/.test(x)), 'prima del 1940');
  assert.ok(!moduleAvailable(modules.find((m) => m.id === 'MOD-DEU-MOT-INF'), { nation: 'DEU', date: '1936-01-01', researched: new Set() }));
});

test('categoria dai battaglioni e template valido', () => {
  assert.equal(designCategory(PZ, modules), 'armored');
  assert.equal(designCategory(INF, modules), 'infantry');
  assert.equal(designCategory([['MOD-DEU-MOT-INF', 9], ['MOD-DEU-SUPPORT-MOT', 1]], modules), 'motorized');
  const t = designTemplate({ id: 'DSG-DEU-001', nation: 'DEU', name: 'Pz 1940', category: 'armored', modules: PZ, createdOn: '1940-01-01' }, modules);
  assert.equal(t.id, 'DSG-DEU-001'); assert.equal(t.equipment['TNK-DEU-TANK'].value, 160);
  assert.deepEqual(validateTemplate({ ...t, id: 'TPL-DEU-DSG-1940', status: 'RECONSTRUCTED_TEMPLATE' }), [], 'stesso formato dei template storici');
});

test('crea, elenca ed elimina un modello; errori chiari', () => {
  let s = game();
  const r = createDesign(s, { nation: 'DEU', name: '  Fanteria 1936 ', modules: INF }, ctx);
  s = r.state;
  assert.equal(r.id, 'DSG-DEU-001');
  assert.equal(s.designs.byId[r.id].name, 'Fanteria 1936');
  assert.deepEqual(validateDesignsState(s.designs), []);
  assert.throws(() => createDesign(s, { nation: 'DEU', name: 'fanteria 1936', modules: INF }, ctx), /esiste già/);
  assert.throws(() => createDesign(s, { nation: 'DEU', name: 'X', modules: [['MOD-DEU-INF', 9]] }, ctx), /servizi/);
  assert.throws(() => createDesign(s, { nation: 'DEU', name: '', modules: INF }, ctx), /nome/);
  const r2 = createDesign(s, { nation: 'DEU', name: 'Panzer', modules: PZ }, ctx);
  assert.equal(r2.id, 'DSG-DEU-002');
  assert.equal(designsOf(r2.state, 'DEU').length, 2);
  assert.deepEqual(deleteDesign(r2.state, 'DSG-DEU-002').designs.byId['DSG-DEU-002'], undefined);
  assert.ok(validateDesignsState({ schema: 'x', byId: {} }).length > 0);
});

test('riorganizzazione graduale: si tiene ciò che c\'è, manca il resto, l\'eccedenza torna in magazzino; categoria cambiata', () => {
  let s = game();
  s = createDesign(s, { nation: 'DEU', name: 'Panzer', modules: PZ }, ctx).state;
  const before = s.forces.divisions[infUnit.id];
  const rifles = before.items['equipment.fucili'].effective;
  const prev = reorganizePreview(s, infUnit.id, 'DSG-DEU-001', reCtx(s, infUnit.id));
  assert.equal(prev.missing['equipment.TNK-DEU-TANK'], 160, 'i carri non arrivano gratis');
  const r = reorganizeDivision(s, infUnit.id, 'DSG-DEU-001', reCtx(s, infUnit.id));
  const d = r.state.forces.divisions[infUnit.id];
  assert.equal(d.templateId, 'DSG-DEU-001');
  assert.equal(d.items['equipment.TNK-DEU-TANK'].effective, 0);
  const planned = d.items['equipment.INW-DEU-RIFLE-1939'].planned;
  assert.equal(d.items['equipment.INW-DEU-RIFLE-1939'].effective, Math.min(rifles, planned), 'fucili portati con la mappa');
  if (rifles > planned) assert.equal(r.state.nations.DEU.stocks['equipment.INW-DEU-RIFLE-1939'], rifles - planned, 'fucili in più in magazzino');
  assert.ok(r.state.nations.DEU.stocks.horses > 0, 'i cavalli tornano in magazzino');
  assert.equal(r.state.nations.DEU.stocks['equipment.TNK-DEU-TANK'], 50, 'le scorte non si toccano: le preleveranno i rinforzi');
  assert.equal(unitOf(r.state, infUnit.id, s.unitsById).category, 'armored');
  assert.equal(d.upgrade.design, 'DSG-DEU-001');
  assert.deepEqual(divisionsUsing(r.state, 'DSG-DEU-001'), [infUnit.id]);
  assert.throws(() => deleteDesign(r.state, 'DSG-DEU-001'), /usato/);
  assert.throws(() => reorganizeDivision(r.state, infUnit.id, 'DSG-DEU-001', reCtx(r.state, infUnit.id)), /già/);
  // i rinforzi vedono i carri mancanti
  const needs = reinforcementNeeds({ forces: r.state.forces, stocks: r.state.nations.DEU.stocks, divisionId: infUnit.id });
  assert.ok(JSON.stringify(needs).includes('TNK-DEU-TANK'));
});

test('vista del pannello: gruppi, contatori, riepilogo, divisioni e fabbisogno', () => {
  const g = moduleGroups(modules, [['MOD-DEU-INF', 2]], { nation: 'DEU', date: '1936-01-01', researched: new Set(), techName: (x) => `«${x}»` });
  const inf = g.find((x) => x.type === 'infantry').rows.find((r) => r.id === 'MOD-DEU-INF');
  assert.equal(inf.count, 2); assert.ok(inf.available);
  const stug = g.find((x) => x.type === 'anti_tank').rows.find((r) => r.id === 'MOD-DEU-STUG');
  assert.ok(!stug.available); assert.match(stug.reason, /«TECH-ARM-ASSAULT»/); assert.match(stug.reason, /dal 01\/02\/1940/);
  assert.deepEqual(bump(bump([], 'A', 1), 'A', -1), []);
  assert.deepEqual(bump([['A', 1]], 'B', 1), [['A', 1], ['B', 1]]);
  const sum = designSummary(PZ, { ...ctx, nation: 'DEU', date: '1940-06-01' });
  assert.equal(sum.category, 'armored'); assert.deepEqual(sum.problems, []);
  assert.equal(sum.highlights.find((h) => h.label === 'Carri').qty, 160);
  let s = game();
  s = createDesign(s, { nation: 'DEU', name: 'Panzer', modules: PZ }, ctx).state;
  const rows = divisionRows(s, 'DEU', [infUnit], designsOf(s, 'DEU'));
  assert.equal(rows.length, 1); assert.equal(rows[0].designId, null);
  const n = reorgNeeds(s, 'DEU', [infUnit.id], (id) => reorganizePreview(s, id, 'DSG-DEU-001', reCtx(s, id)));
  assert.equal(n.count, 1);
  const tank = n.rows.find((r) => r.item === 'equipment.TNK-DEU-TANK');
  assert.deepEqual([tank.need, tank.stock], [160, 50]);
});

test('riepilogo: potenza di fuoco a dotazione piena dalla funzione della battaglia', () => {
  let seen = null;
  const firepowerOf = (equipment, men) => { seen = { equipment, men }; return { small: { soft: 10, hard: 1 }, artillery: { soft: 5, hard: 2 }, direct: { soft: 3, hard: 7 }, armor: 0.9 }; };
  const s = designSummary(PZ, { ...ctx, nation: 'DEU', date: '1940-06-01', firepowerOf });
  assert.deepEqual(s.firepower, { soft: 18, hard: 10, armor: 0.9 });
  assert.equal(seen.equipment['TNK-DEU-TANK'], 160); assert.equal(seen.men, s.men);
  assert.equal(designSummary([], { ...ctx, nation: 'DEU', date: '1940-06-01', firepowerOf }).firepower, null);
});

test('illustrazioni: ogni battaglione ne ha una esistente, ogni file c\'è ed è un PNG trasparente', () => {
  const art = json('assets/unit_illustrations.json');
  const ids = new Set(art.items.map((x) => x.id));
  assert.equal(ids.size, art.items.length);
  for (const m of modules) assert.ok(ids.has(m.illustration), `${m.id} senza illustrazione`);
  for (const it of art.items) {
    const buf = readFileSync(new URL(`../${art.folder}/${it.file}`, import.meta.url));
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', it.file);
    assert.ok(buf.length < 120000, `${it.file} troppo pesante`);
  }
});

test('battaglioni del 19/11/2026: categorie montagna, cavalleria, paracadutisti; modelli di partenza validi', () => {
  assert.equal(designCategory([['MOD-DEU-GEB-JAEGER', 6], ['MOD-DEU-GEB-ART', 3], ['MOD-DEU-SUPPORT', 1]], modules), 'mountain');
  assert.equal(designCategory([['MOD-DEU-REITER', 6], ['MOD-DEU-INF', 2], ['MOD-DEU-SUPPORT', 1]], modules), 'cavalry');
  assert.equal(designCategory([['MOD-DEU-FJ', 9], ['MOD-DEU-SUPPORT', 1]], modules), 'airborne');
  assert.equal(designCategory([['MOD-DEU-INF', 9], ['MOD-DEU-GEB-JAEGER', 2], ['MOD-DEU-SUPPORT', 1]], modules), 'infantry', 'pochi alpini: resta fanteria');
  assert.equal(designCategory([['MOD-DEU-KRADSCHUETZEN', 2], ['MOD-DEU-SUPPORT-MOT', 1]], modules), 'motorized');
  const all = new Set([...researched, 'TECH-MECH-HT']);
  for (const pr of doc.presets) assert.deepEqual(designProblems(pr.modules, { ...ctx, nation: 'DEU', date: '1940-06-01', researched: all }), [], pr.id);
  const fj = designProblems([['MOD-DEU-FJ', 9], ['MOD-DEU-SUPPORT', 1]], { ...ctx, nation: 'DEU', date: '1940-06-01', researched: new Set() });
  assert.ok(fj.some((x) => /ricerca «TECH-INF-AIRBORNE»/.test(x)), 'paracadutisti solo con la tecnologia');
  // 20/11/2026: pochi carri non trasformano una divisione di cavalleria in corazzata
  assert.equal(designCategory([['MOD-DEU-REITER', 6], ['MOD-DEU-TANK', 1], ['MOD-DEU-SUPPORT', 1]], modules), 'cavalry');
  assert.equal(designCategory([['MOD-DEU-REITER', 2], ['MOD-DEU-TANK', 3], ['MOD-DEU-SUPPORT', 1]], modules), 'armored');
});

test('genio: senza Pionier-Bataillon la penalità del fiume cresce; i modelli storici restano come prima', async () => {
  const { battleGround } = await import('../src/game/theaterState.js');
  const tc = json('units/terrain_combat.json');
  const state = { movement: { from: { A: 'X', B: 'X' } } };
  const net = { canon: (x) => x };
  const att = [{ id: 'A', category: 'infantry' }, { id: 'B', category: 'infantry' }];
  const base = { terrainCfg: tc, riverBetween: () => ({ widthClass: 'large' }) };
  const g0 = battleGround(state, base, net, 'Y', att, []);
  assert.deepEqual(g0.attackers.map((u) => u.mult), [tc.river.large, tc.river.large], 'senza informazione sul genio: come prima');
  const g1 = battleGround(state, { ...base, hasEngineers: (s, u) => u.id === 'A' }, net, 'Y', att, []);
  assert.equal(g1.attackers[0].mult, tc.river.large);
  assert.ok(Math.abs(g1.attackers[1].mult - (1 - (1 - tc.river.large) * tc.noEngineerRiverPenalty)) < 1e-9);
});
