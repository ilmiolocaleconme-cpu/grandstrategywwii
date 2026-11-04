// Aggiornamento del template delle divisioni già create (03/11/2026): dotazione portata con la mappa, mai creata; eccedenza alla scorta; rinforzi con i prodotti del 1939.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newGame } from '../src/game/state.js';
import { initForcesState, createForcesActivationSystem, validateForcesShape } from '../src/game/forcesState.js';
import { advanceDays } from '../src/game/engine.js';
import { validateForcesState, templateFor } from '../src/rules/forces.js';
import { planReinforcements, mobilize } from '../src/rules/reinforcements.js';
import { validateUpgradeMap, upgradeDivision, upgradeTarget } from '../src/rules/templateUpgrade.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = json('units/units.json').units;
const names = ['divisione_fanteria_germania_1936', 'divisione_corazzata_germania_1936', 'divisione_fanteria_gran_bretagna_1936', 'divisione_fanteria_francia_1936', 'divisione_fanteria_germania_1939', 'divisione_fanteria_francia_1939', 'divisione_fanteria_italia_1940'];
const templates = names.map((f) => json(`units/templates/${f}.json`));
const upgradeMap = json('units/equipment/upgrade_map.json');
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((f) => json(`units/equipment/${f}`)));
const ratio = json('units/readiness.json').initialFillRatio.value;
const ctx = { units, templates, ratio, upgradeMap };
const political = json('political_1936.json');
const nationList = json('nations.json').map((n) => n.id);
const start = () => initForcesState(newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state, ctx).state;
const of = (s, nation) => Object.entries(s.forces.divisions).filter(([id]) => units.find((u) => u.id === id).nation === nation);
const unitOf = (id) => units.find((u) => u.id === id);

test('la mappa dei dati è valida; categoria o calibro diversi, doppioni e alias mancanti vengono rifiutati', () => {
  assert.deepEqual(validateUpgradeMap(upgradeMap, { catalog, templates }), []);
  const bad = (entries) => validateUpgradeMap({ ...upgradeMap, entries }, { catalog, templates });
  assert.match(bad([{ nation: 'DEU', from: 'fucili', to: 'ART-DEU-GRW34', basis: 'ipotesi' }]).join(), /categoria diversa/);
  assert.match(bad([{ nation: 'DEU', from: 'mortaiLeggeri50mm', to: 'ART-DEU-GRW34', basis: 'ipotesi' }]).join(), /calibro diverso/);
  assert.match(bad([upgradeMap.entries[0], upgradeMap.entries[0]]).join(), /due volte/);
  assert.match(bad([{ nation: 'DEU', from: 'nonEsiste', to: 'INW-DEU-RIFLE-1939', basis: 'ipotesi' }]).join(), /alias/);
  assert.match(bad([{ nation: 'DEU', from: 'fucili', to: 'INW-DEU-RIFLE-1939', basis: 'boh' }]).join(), /basis/);
});

test('upgradeDivision sintetico: porta la dotazione con la mappa, tronca al nuovo previsto (eccedenza), registra le voci perse, le nuove partono da 0', () => {
  const leaf = (value) => ({ value, effective: { value: null } });
  const tpl = { id: 'TPL-XXX-INF-1939', appliesTo: { nation: 'XXX' }, manpower: { war: leaf(1000) }, horses: leaf(100), equipment: { NEW_A: leaf(50), NEW_B: leaf(30), ONLY_NEW: leaf(10) } };
  const division = { templateId: 'TPL-XXX-INF-1936', since: '1936-01-01', reinforce: false, items: {
    'manpower.war': { planned: 900, effective: 950 - 100, source: 'ratio' }, 'horses': { planned: 120, effective: 110, source: 'ratio' },
    'equipment.old_a': { planned: 70, effective: 64, source: 'ratio' }, 'equipment.old_b1': { planned: 20, effective: 12, source: 'ratio' }, 'equipment.old_b2': { planned: 20, effective: 15, source: 'ratio' },
    'equipment.lost': { planned: 5, effective: 4, source: 'ratio' } } };
  const map = { entries: [
    { nation: 'XXX', from: 'old_a', to: 'NEW_A' }, { nation: 'XXX', from: 'old_b1', to: 'NEW_B' }, { nation: 'XXX', from: 'old_b2', to: 'NEW_B' },
    { nation: 'YYY', from: 'lost', to: 'ONLY_NEW' }] }; // riga di un'altra nazione: ignorata
  const r = upgradeDivision(division, tpl, { nation: 'XXX', map, date: '1939-09-01' });
  const d = r.division;
  assert.equal(d.templateId, 'TPL-XXX-INF-1939');
  assert.equal(d.since, '1936-01-01'); assert.equal(d.reinforce, false, 'interruttore dei rinforzi conservato');
  assert.deepEqual(d.items['manpower.war'], { planned: 1000, effective: 850, source: 'upgrade' });
  assert.deepEqual(d.items.horses, { planned: 100, effective: 100, source: 'upgrade' }, 'effettivo troncato al nuovo previsto');
  assert.deepEqual(r.surplus, { horses: 10, 'equipment.NEW_A': 14 }, 'eccedenza: cavalli 110−100, voce A 64−50');
  assert.deepEqual(d.items['equipment.NEW_B'], { planned: 30, effective: 27, source: 'upgrade' }, 'due voci vecchie sulla stessa nuova si sommano');
  assert.deepEqual(d.items['equipment.ONLY_NEW'], { planned: 10, effective: 0, source: 'upgrade' }, 'voce nuova: da 0, non creata');
  assert.deepEqual(r.dropped, { 'equipment.lost': 4 });
  assert.deepEqual(d.upgrade, { from: 'TPL-XXX-INF-1936', on: '1939-09-01', surplus: { horses: 10, 'equipment.NEW_A': 14 }, dropped: { 'equipment.lost': 4 } });
  // conservazione: ciò che entra nelle voci nuove + eccedenza + perso = ciò che c'era (uomini esclusi, il pool è derivato)
  const oldTotal = ['horses', 'equipment.old_a', 'equipment.old_b1', 'equipment.old_b2', 'equipment.lost'].reduce((s, k) => s + division.items[k].effective, 0);
  const newTotal = ['horses', 'equipment.NEW_A', 'equipment.NEW_B', 'equipment.ONLY_NEW'].reduce((s, k) => s + d.items[k].effective, 0);
  assert.equal(newTotal + 10 + 14 + 4, oldTotal, 'nessuna dotazione creata o duplicata');
  assert.deepEqual(division.items['manpower.war'], { planned: 900, effective: 850, source: 'ratio' }, 'input non modificato');
});

test('upgradeTarget: solo verso un template più recente; anche i quadri; mai se il template attuale è sconosciuto', () => {
  const deu = units.find((u) => u.nation === 'DEU' && u.category === 'infantry' && u.echelon === 'division');
  const d = { templateId: 'TPL-DEU-INF-1936', since: '1936-01-01', items: {} };
  assert.equal(upgradeTarget(d, deu, templates, '1939-08-31', templateFor), null);
  assert.equal(upgradeTarget(d, deu, templates, '1939-09-01', templateFor).id, 'TPL-DEU-INF-1939');
  assert.equal(upgradeTarget({ ...d, cadre: true }, deu, templates, '1939-09-01', templateFor).id, 'TPL-DEU-INF-1939', 'un quadro segue la versione');
  assert.equal(upgradeTarget({ ...d, templateId: 'TPL-DEU-INF-1939' }, deu, templates, '1939-09-01', templateFor), null, 'già aggiornata');
  assert.equal(upgradeTarget({ ...d, templateId: 'TPL-DEU-INF-1939' }, deu, templates, '1937-01-01', templateFor), null, 'mai a una versione più vecchia');
  assert.equal(upgradeTarget({ ...d, templateId: 'TPL-ZZZ-INF-1936' }, deu, templates, '1939-09-01', templateFor), null);
});

test('dati reali: dal 1/9/1939 le divisioni tedesche e francesi già create passano al template 1939; la dotazione portata non supera il vecchio effettivo', () => {
  const s0 = { ...start(), date: '1939-08-30' };
  const before = Object.fromEntries(Object.entries(s0.forces.divisions));
  const sys = createForcesActivationSystem(ctx);
  const mid = advanceDays(s0, 1, [sys]);
  for (const nation of ['DEU', 'FRA']) for (const [id, d] of of(mid, nation)) assert.equal(d.templateId, before[id]?.templateId ?? d.templateId, `${id}: 31/8/1939 ancora invariata`);
  const c = advanceDays(mid, 3, [sys]);
  let upgradedDeu = 0; let upgradedFra = 0;
  for (const nation of ['DEU', 'FRA']) {
    for (const [id, d] of of(c, nation)) {
      const old = before[id];
      if (!old) continue;
      if (unitOf(id).category !== 'infantry') { assert.deepEqual(d, old, `${id}: non di fanteria, nessuna versione più recente`); continue; }
      assert.equal(d.templateId, `TPL-${nation}-INF-1939`, id);
      assert.equal(d.since, old.since); assert.equal(d.upgrade.from, old.templateId); assert.equal(d.upgrade.on, '1939-09-01');
      assert.equal(d.items['manpower.war'].planned, nation === 'DEU' ? 17200 : 16400);
      assert.equal(d.items['manpower.war'].effective, Math.min(old.items['manpower.war'].effective, d.items['manpower.war'].planned), 'uomini portati, non creati');
      for (const [k, it] of Object.entries(d.items)) assert.ok(it.effective <= it.planned, `${id} ${k}`);
      if (nation === 'DEU') upgradedDeu += 1; else upgradedFra += 1;
    }
  }
  assert.ok(upgradedDeu >= 30 && upgradedFra >= 20, `aggiornate DEU ${upgradedDeu}, FRA ${upgradedFra}`);
  assert.deepEqual(validateForcesState(c.forces, units), []);
  assert.deepEqual(validateForcesShape(c.forces), []);
  assert.equal(sys(c), c, 'idempotente: nessuna nuova modifica, stesso oggetto');
});

test('dati reali Germania: dotazione dal vecchio template alla voce 1939 mappata (fucili → INW-DEU-RIFLE-1939); antiaerei senza corrispondenza registrati come persi; voci nuove da 0', () => {
  const sys = createForcesActivationSystem(ctx);
  const s0 = { ...start(), date: '1939-08-31' };
  const [id, old] = of(s0, 'DEU').find(([i, d]) => d.templateId === 'TPL-DEU-INF-1936');
  const after = advanceDays(s0, 1, [sys]).forces.divisions[id];
  assert.equal(after.templateId, 'TPL-DEU-INF-1939');
  assert.equal(after.items['equipment.INW-DEU-RIFLE-1939'].effective, Math.min(old.items['equipment.fucili'].effective, 12609));
  assert.equal(after.items['equipment.ART-DEU-GRW34'].effective, Math.min(old.items['equipment.mortaiPesanti81mm'].effective, 58));
  assert.equal(after.upgrade.dropped['equipment.antiaerei20mm'], old.items['equipment.antiaerei20mm'].effective);
  assert.equal(after.items['equipment.fucili'], undefined, 'le chiavi vecchie non restano');
  assert.deepEqual(Object.keys(after.items).filter((k) => k.startsWith('equipment.')).sort(), templates.find((t) => t.id === 'TPL-DEU-INF-1939') && Object.keys(templates.find((t) => t.id === 'TPL-DEU-INF-1939').equipment).map((k) => `equipment.${k}`).sort());
});

test('Francia (quadri al 30%): il template 1936 non ha quantità di equipaggiamento, quindi le voci del 1939 partono da 0; gli uomini si portano; restano quadri', () => {
  const sys = createForcesActivationSystem(ctx);
  const s0 = { ...start(), date: '1939-08-31' };
  const [id, old] = of(s0, 'FRA')[0];
  assert.deepEqual(Object.keys(old.items), ['manpower.war']);
  const after = advanceDays(s0, 1, [sys]).forces.divisions[id];
  assert.equal(after.templateId, 'TPL-FRA-INF-1939');
  assert.equal(after.items['manpower.war'].effective, Math.min(old.items['manpower.war'].effective, 16400));
  for (const [k, it] of Object.entries(after.items)) if (k.startsWith('equipment.') || k === 'horses') assert.equal(it.effective, 0, k);
  assert.equal(after.upgrade.dropped, undefined);
  assert.equal(after.cadre, true, 'resta un quadro: nessun rinforzo finché non è mobilitato');
  assert.equal(after.items['manpower.war'].effective, old.items['manpower.war'].effective, 'l\'effettivo non cresce da solo');
});

test('la Gran Bretagna (nessun template più recente) non cambia; con la divisione sospesa dai rinforzi l\'interruttore resta', () => {
  const sys = createForcesActivationSystem(ctx);
  const s0 = { ...start(), date: '1939-08-31' };
  const gbr = of(s0, 'GBR');
  assert.ok(gbr.length > 0 && gbr.every(([, d]) => d.cadre === true));
  const [did] = of(s0, 'DEU').find(([i]) => unitOf(i).category === 'infantry');
  s0.forces = { ...s0.forces, divisions: { ...s0.forces.divisions, [did]: { ...s0.forces.divisions[did], reinforce: false } } };
  const after = advanceDays(s0, 1, [sys]);
  for (const [id, d] of gbr) assert.deepEqual(after.forces.divisions[id], d);
  assert.equal(after.forces.divisions[did].reinforce, false);
  assert.equal(after.forces.divisions[did].templateId, 'TPL-DEU-INF-1939');
});

test('effetto reale: prima dell\'aggiornamento una scorta di fucili 1939 non arriva alla divisione; dopo sì (il motore dei rinforzi usa le chiavi del nuovo template)', () => {
  const sys = createForcesActivationSystem(ctx);
  const s0 = { ...start(), date: '1939-08-31' };
  const [id] = of(s0, 'DEU').find(([i, d]) => d.templateId === 'TPL-DEU-INF-1936');
  const plan = (s) => planReinforcements(s.forces, { units: units.filter((u) => u.id === id), nation: 'DEU', date: s.date, poolAvailable: 0, stocks: { 'equipment.INW-DEU-RIFLE-1939': 500 }, transitDays: () => 3 });
  assert.equal(plan(s0).transfers.filter((t) => t.item === 'equipment.INW-DEU-RIFLE-1939').length, 0, 'prima: la divisione non ha quella voce');
  const after = advanceDays(s0, 1, [sys]);
  const t = plan(after).transfers.filter((x) => x.item === 'equipment.INW-DEU-RIFLE-1939');
  assert.equal(t.length, 1);
  const it = after.forces.divisions[id].items['equipment.INW-DEU-RIFLE-1939'];
  assert.equal(t[0].qty, Math.min(it.planned - it.effective, 500));
});

test('l\'eccedenza troncata torna nella scorta della nazione (stato delle nazioni) senza duplicazioni', () => {
  const sys = createForcesActivationSystem(ctx);
  const s0 = { ...start(), date: '1939-08-31' };
  const [id] = of(s0, 'DEU').find(([i, d]) => d.templateId === 'TPL-DEU-INF-1936');
  // dotazione artificiale: 15000 fucili effettivi (previsto 1936 13500 è il tetto di validità, quindi si alza anche il previsto del solo test) contro 12609 del 1939
  const d = s0.forces.divisions[id];
  s0.forces = { ...s0.forces, divisions: { ...s0.forces.divisions, [id]: { ...d, items: { ...d.items, 'equipment.fucili': { planned: 15000, effective: 15000, source: 'template' } } } } };
  s0.nations = { DEU: { stocks: { 'equipment.INW-DEU-RIFLE-1939': 7 } } };
  const before = 7;
  const after = advanceDays(s0, 1, [sys]);
  assert.equal(after.forces.divisions[id].items['equipment.INW-DEU-RIFLE-1939'].effective, 12609);
  assert.equal(after.forces.divisions[id].upgrade.surplus['equipment.INW-DEU-RIFLE-1939'], 15000 - 12609);
  assert.equal(after.nations.DEU.stocks['equipment.INW-DEU-RIFLE-1939'], before + 15000 - 12609);
  assert.deepEqual(validateForcesShape(after.forces), []);
});

test('un quadro segue la versione del template ma resta quadro (nessun rinforzo) finché non è mobilitato', () => {
  const sys = createForcesActivationSystem(ctx);
  const s0 = { ...start(), date: '1939-08-31' };
  const [id] = of(s0, 'DEU').find(([i]) => unitOf(i).category === 'infantry');
  const cadre = { ...s0, forces: { ...s0.forces, divisions: { ...s0.forces.divisions, [id]: { ...s0.forces.divisions[id], cadre: true } } } };
  const a = advanceDays(cadre, 1, [sys]);
  assert.equal(a.forces.divisions[id].templateId, 'TPL-DEU-INF-1939');
  assert.equal(a.forces.divisions[id].cadre, true);
  const plan = (s) => planReinforcements(s.forces, { units: units.filter((u) => u.id === id), nation: 'DEU', date: s.date, poolAvailable: 99999, stocks: { 'equipment.INW-DEU-RIFLE-1939': 99999 }, transitDays: () => 1 });
  assert.equal(plan(a).transfers.length, 0, 'quadro: nessun rinforzo');
  assert.ok(plan({ ...a, forces: mobilize(a.forces, id) }).transfers.length > 0, 'mobilitato: i rinforzi colmano il nuovo previsto');
});
