// Spionaggio, sabotaggio e difesa (29/10/2026). Parametri DESIGN_DEFAULT; i tiri sono deterministici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createSecurity } from '../src/game/security.js';
import { securityOf } from '../src/game/securityState.js';
import { createEconomySystem } from '../src/game/economySystem.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { serializeSave, parseSave } from '../src/game/save.js';
import { roll01, defenseScore, sabotageChance, detectionChance, catchChance, validateSecurityConfig } from '../src/rules/security.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const cfg = json('security/security.json'); const technologies = json('research/technologies.json');
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json'); const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const mk = (c = cfg, presence = null) => createSecurity({ security: c, economy, political, presence });
const sec = mk();
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const withNation = (s, id, patch) => ({ ...s, nations: { ...s.nations, [id]: { ...s.nations[id], ...patch } } });
const spyTech = { done: ['TECH-SEC-INTEL'], active: null }; const ciTech = { done: ['TECH-SEC-INTEL', 'TECH-SEC-CI'], active: null };
const base = () => withNation(withNation(fresh(), 'ITA', { balance: 1e4, research: spyTech }), 'DEU', { balance: 1e4 });
const tgtFac = (s) => s.nations.DEU.facilities.find((f) => f.type === 'FCT-STEEL');
const run = (s, n) => { let x = s; for (let i = 0; i < n; i += 1) x = sec.securityDay(advanceDay(x, [])); return x; };
const forced = (over) => { const c = structuredClone(cfg); Object.assign(c.sabotage, over); return mk(c); };

test('dati: parametri validi e coerenti con le tecnologie; i difetti del file vengono segnalati', () => {
  assert.deepEqual(validateSecurityConfig(cfg, { techIds: new Set(technologies.technologies.map((t) => t.id)) }), []);
  assert.equal(cfg.quality, 'DESIGN_DEFAULT');
  const bad = structuredClone(cfg); bad.sabotage.minChance = 0.95;
  assert.ok(validateSecurityConfig(bad).length > 0);
  assert.ok(validateSecurityConfig(cfg, { techIds: new Set(['X']) }).some((e) => /non esiste/.test(e)));
});

test('tiro deterministico: stesso input stesso numero, sempre in [0,1), frequenze vicine alla probabilità', () => {
  assert.equal(roll01(3, 'a'), roll01(3, 'a')); assert.notEqual(roll01(3, 'a'), roll01(4, 'a'));
  let hits = 0; const N = 4000;
  for (let i = 0; i < N; i += 1) { const r = roll01(i, 'op', 'esito'); assert.ok(r >= 0 && r < 1); if (r < 0.3) hits += 1; }
  assert.ok(Math.abs(hits / N - 0.3) < 0.03, `frequenza ${hits / N}`);
});

test('difesa: polizia locale + guarnigione + polizia militare, con il controspionaggio la polizia militare vale di più; la probabilità di riuscita cala con la difesa', () => {
  const none = defenseScore(cfg, {}); assert.deepEqual(none, { local: 1, garrison: 0, militaryPolice: 0, total: 1 });
  const all = defenseScore(cfg, { mp: 3, garrison: 2 });
  assert.equal(all.total, 1 + 3 + 6);
  assert.equal(defenseScore(cfg, { mp: 3, counterIntel: true }).militaryPolice, 9);
  assert.ok(sabotageChance(cfg, 1, 0) > sabotageChance(cfg, 11, 0));
  assert.equal(sabotageChance(cfg, 100, 0), cfg.sabotage.minChance);
  assert.ok(sabotageChance(cfg, 5, 3) > sabotageChance(cfg, 5, 0));
  assert.equal(sabotageChance(cfg, 5, 99), sabotageChance(cfg, 5, 3), 'il bonus delle spie ha un tetto');
  assert.ok(detectionChance(cfg, 11) > detectionChance(cfg, 1));
  assert.ok(catchChance(cfg, 5) > catchChance(cfg, 0));
  const presence = { byProvince: { P_X: { garrison: 2 } } };
  assert.equal(mk(cfg, presence).defenseAt({ research: ciTech }, 'P_X').garrison, 3);
});

test('addestramento: serve la tecnologia, paga subito, dopo i giorni previsti gli agenti sono in riserva; stato precedente intatto', () => {
  const s0 = withNation(fresh(), 'ITA', { balance: 1e4 });
  assert.deepEqual(sec.train(s0, 'ITA', 'spy').missing, [{ what: 'tech', need: 'TECH-SEC-INTEL', have: null }]);
  const s1 = base(); const r = sec.train(s1, 'ITA', 'spy', 2);
  assert.equal(r.ok, true); assert.equal(r.state.nations.ITA.balance, 1e4 - 6); assert.equal(s1.nations.ITA.balance, 1e4);
  assert.deepEqual(validateState(r.state), []);
  let s = run(r.state, 29); assert.equal(securityOf(s.nations.ITA).agents.spy, 0);
  s = run(s, 1); assert.equal(securityOf(s.nations.ITA).agents.spy, 2); assert.equal(securityOf(s.nations.ITA).queue.length, 0);
  assert.equal(sec.train(withNation(s1, 'ITA', { balance: 1 }), 'ITA', 'saboteur').reason, 'missing');
  assert.deepEqual(validateState(s), []);
});

test('spie: si schierano dalla riserva, danno la vista sugli impianti e migliorano le probabilità', () => {
  let s = run(sec.train(base(), 'ITA', 'spy').state, 30);
  assert.deepEqual(sec.targetsFor(s, 'ITA', 'DEU'), []);
  assert.equal(sec.deploySpy(s, 'ITA', 'ITA').reason, 'same_nation');
  const dep = sec.deploySpy(s, 'ITA', 'DEU'); assert.equal(dep.ok, true); s = dep.state;
  assert.equal(securityOf(s.nations.ITA).deployed.DEU, 1); assert.equal(securityOf(s.nations.ITA).agents.spy, 0);
  assert.equal(sec.deploySpy(s, 'ITA', 'DEU').reason, 'no_agent');
  const t = sec.targetsFor(s, 'ITA', 'DEU'); assert.ok(t.length > 0);
  const one = t.find((x) => x.facilityId === tgtFac(s).id);
  assert.equal(one.defense, 1); assert.equal(one.chance, sabotageChance(cfg, 1, 1));
  assert.deepEqual(validateState(s), []);
});

function ready(s0 = base()) { // 1 spia schierata, 1 sabotatore, tecnologia
  let s = run(sec.train(sec.train(s0, 'ITA', 'spy').state, 'ITA', 'saboteur').state, 45);
  s = sec.deploySpy(s, 'ITA', 'DEU').state; return s;
}

test('sabotaggio riuscito e non scoperto: il danno sale, il sabotatore rientra, il bersaglio non sa nulla di chi è stato', () => {
  const sure = forced({ baseChance: 1, minChance: 1, maxChance: 1, detectBase: 0, detectPerDefense: 0, minDetect: 0, maxDetect: 0 });
  const s0 = ready(); const f = tgtFac(s0);
  assert.equal(sure.sabotage(withNation(s0, 'ITA', { research: { done: [], active: null } }), 'ITA', { targetNation: 'DEU', facilityId: f.id }).reason, 'missing');
  assert.equal(sure.sabotage(s0, 'ITA', { targetNation: 'DEU', facilityId: 'NOPE' }).reason, 'no_facility');
  const r = sure.sabotage(s0, 'ITA', { targetNation: 'DEU', facilityId: f.id }); assert.equal(r.ok, true);
  assert.equal(securityOf(r.state.nations.ITA).agents.saboteur, 0, 'il sabotatore è impegnato');
  assert.equal(sure.sabotage(r.state, 'ITA', { targetNation: 'DEU', facilityId: f.id }).reason, 'no_agent');
  let s = r.state; for (let i = 0; i < 9; i += 1) s = sure.securityDay(advanceDay(s, []));
  assert.equal(tgtFac(s).damage, 0);
  s = sure.securityDay(advanceDay(s, []));
  assert.ok(Math.abs(tgtFac(s).damage - (0.3 - 0.004)) < 1e-9, `danno ${tgtFac(s).damage}`);
  assert.equal(securityOf(s.nations.ITA).agents.saboteur, 1);
  const log = securityOf(s.nations.ITA).log.at(-1); assert.equal(log.result, 'success'); assert.equal(log.detected, false);
  const inc = securityOf(s.nations.DEU).incidents.at(-1); assert.equal(inc.success, true); assert.equal(inc.attacker, null);
  assert.deepEqual(validateState(s), []);
});

test('sabotaggio fallito e scoperto: nessun danno, sabotatore perso, il bersaglio sa chi è stato', () => {
  const bad = forced({ baseChance: 0, minChance: 0, maxChance: 0, detectBase: 1, minDetect: 1, maxDetect: 1 });
  const s0 = ready(); const f = tgtFac(s0);
  let s = bad.sabotage(s0, 'ITA', { targetNation: 'DEU', facilityId: f.id }).state;
  for (let i = 0; i < 10; i += 1) s = bad.securityDay(advanceDay(s, []));
  assert.equal(tgtFac(s).damage, 0); assert.equal(securityOf(s.nations.ITA).agents.saboteur, 0);
  const inc = securityOf(s.nations.DEU).incidents.at(-1); assert.equal(inc.success, false); assert.equal(inc.attacker, 'ITA');
  assert.equal(securityOf(s.nations.ITA).log.at(-1).detected, true);
});

test('il sabotaggio richiede una spia schierata; esito identico se si ripete dallo stesso stato (riproducibile)', () => {
  const s0 = ready(); const noSpy = withNation(s0, 'ITA', { security: { ...securityOf(s0.nations.ITA), deployed: {} } });
  assert.equal(sec.sabotage(noSpy, 'ITA', { targetNation: 'DEU', facilityId: tgtFac(s0).id }).reason, 'no_intel');
  const go = () => run(sec.sabotage(s0, 'ITA', { targetNation: 'DEU', facilityId: tgtFac(s0).id }).state, 10);
  assert.equal(JSON.stringify(go()), JSON.stringify(go()));
});

test('la difesa conta davvero: con polizia militare e controspionaggio il bersaglio subisce meno danni (frequenze su molte operazioni)', () => {
  const s0 = ready(); const f = tgtFac(s0);
  const weak = s0.nations.DEU; const strongNation = { ...weak, research: ciTech, security: { ...securityOf(weak), mp: { [sec.placeOf(f)]: 5 } } };
  const dW = sec.defenseAt(weak, sec.placeOf(f)).total; const dS = sec.defenseAt(strongNation, sec.placeOf(f)).total;
  assert.ok(dS > dW);
  const rate = (d) => { let k = 0; for (let i = 0; i < 3000; i += 1) if (roll01(i, 'op', 'esito') < sabotageChance(cfg, d, 1)) k += 1; return k / 3000; };
  assert.ok(rate(dS) < rate(dW) - 0.2, `${rate(dS)} contro ${rate(dW)}`);
});

test('polizia militare: serve controllare il luogo, costa, si completa, ha un massimo per luogo', () => {
  const s0 = base(); const place = tgtFac(s0).territory; const own = s0.nations.ITA.facilities[0].territory;
  assert.equal(sec.trainMilitaryPolice(s0, 'ITA', place).reason, 'not_controlled');
  let s = s0;
  for (let i = 0; i < 5; i += 1) { const r = sec.trainMilitaryPolice(s, 'ITA', own); assert.equal(r.ok, true, JSON.stringify(r)); s = r.state; }
  assert.equal(sec.trainMilitaryPolice(s, 'ITA', own).reason, 'max_level');
  assert.equal(s.nations.ITA.balance, 1e4 - 5 * 4);
  s = run(s, 20); assert.equal(securityOf(s.nations.ITA).mp[own], 5); assert.equal(sec.defenseAt(s.nations.ITA, own).total, 1 + 10);
  assert.deepEqual(validateState(s), []);
});

test('controspionaggio: la nazione con la tecnologia scopre le spie straniere; senza tecnologia no', () => {
  const sure = (() => { const c = structuredClone(cfg); c.counterintelligence.catchBase = 1; c.counterintelligence.maxCatch = 1; return mk(c); })();
  const s0 = ready();
  const caught = sure.securityDay(advanceDay(withNation(s0, 'DEU', { research: ciTech }), []));
  assert.equal(securityOf(caught.nations.ITA).deployed.DEU, undefined);
  assert.equal(securityOf(caught.nations.ITA).log.at(-1).kind, 'spy_caught');
  assert.equal(securityOf(caught.nations.DEU).incidents.at(-1).attacker, 'ITA');
  const kept = sure.securityDay(advanceDay(s0, []));
  assert.equal(securityOf(kept.nations.ITA).deployed.DEU, 1);
});

test('riparazione lenta: il danno cala di 0,004 al giorno fino a zero', () => {
  let s = withNation(fresh(), 'DEU', { facilities: fresh().nations.DEU.facilities.map((f, i) => (i === 0 ? { ...f, damage: 0.01 } : f)) });
  s = run(s, 1); assert.ok(Math.abs(s.nations.DEU.facilities[0].damage - 0.006) < 1e-9);
  s = run(s, 5); assert.equal(s.nations.DEU.facilities[0].damage, 0);
});

test('effetto economico: un impianto sabotato produce meno (stesso sistema economico, solo il danno cambia)', () => {
  const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
  const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json') };
  const eco = createEconomySystem({ catalog, economy, baseline: json('resources/extraction_baseline.json'), hydro: json('resources/hydro_plants.json'), political, cash: start.cash, sites: json('resources/mine_sites.json') });
  const s0 = fresh(); const dmg = (d) => withNation(s0, 'DEU', { facilities: s0.nations.DEU.facilities.map((f) => (f.type === 'FCT-STEEL' ? { ...f, damage: d } : f)) });
  const steel = (s) => eco(advanceDay(s, [])).nations.DEU.stocks.steel;
  assert.ok(steel(dmg(0.6)) < steel(dmg(0)), `${steel(dmg(0.6))} deve essere minore di ${steel(dmg(0))}`);
});

test('salvataggio: forma della sicurezza controllata', () => {
  const s = ready(); assert.deepEqual(validateState(s), []);
  const bad = withNation(s, 'ITA', { security: { ...securityOf(s.nations.ITA), agents: { spy: -1, saboteur: 0 } } });
  assert.notDeepEqual(validateState(bad), []);
  const bad2 = withNation(s, 'ITA', { security: { ...securityOf(s.nations.ITA), queue: [{ kind: 'zzz', daysLeft: 1 }] } });
  assert.notDeepEqual(validateState(bad2), []);
});

test('salvataggio: ricerca, agenti, polizia, coda e registri sopravvivono a salva e ricarica; uno stato senza questi campi (vecchio salvataggio) si carica', () => {
  let s = ready(); s = sec.trainMilitaryPolice(s, 'ITA', s.nations.ITA.facilities[0].territory).state;
  s = run(sec.sabotage(s, 'ITA', { targetNation: 'DEU', facilityId: tgtFac(s).id }).state, 12);
  const back = parseSave(serializeSave(s, { savedAt: 'x' }));
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(JSON.stringify(back.state), JSON.stringify(s));
  assert.ok(securityOf(back.state.nations.ITA).log.length > 0);
  const old = parseSave(serializeSave(fresh()));
  assert.equal(old.ok, true); assert.equal(old.state.nations.ITA.security, undefined);
  assert.equal(sec.train(old.state, 'ITA', 'spy').reason, 'missing');
});
