// Livelli dei porti (29/10/2026): costruzione e miglioramento L1-L3, tecnologia del grande porto, controllo, salvataggio. Valori DESIGN_DEFAULT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createConstruction } from '../src/game/construction.js';
import { serializeSave, parseSave } from '../src/game/save.js';
import { workersState } from '../src/rules/workers.js';
import { validatePortLevels, portCost, maxPortLevel } from '../src/data/portLevels.js';
import { validateTechnologies, consumersOf } from '../src/data/technologies.js';
import { portLevelIn, validatePortsShape } from '../src/game/portsState.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const levels = json('ports/port_levels.json'); const base = json('ports/ports_1936.json'); const coastal = json('ports/coastal_cities.json').cities;
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json') };
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json'); const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const share = population.workersShare.value;
const build = createConstruction({ catalog, economy, sites: json('resources/mine_sites.json'), hydro: json('resources/hydro_plants.json'), political, workersShare: share, ports: { levels, coastal, base } });
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const rich = (s, patch = {}) => ({ ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, balance: 1e7, population: 1e9, stocks: { ...s.nations.ITA.stocks, steel: 1e7 }, ...patch } } });
const city = (name, owner = 'ITA') => Object.entries(coastal).find(([, c]) => c.name === name && c.owner === owner)[0];
const finish = (s, days) => { let x = s; for (let i = 0; i < days; i += 1) x = build.constructionDay(advanceDay(x, [])); return x; };

test('dati: livelli validi, la tecnologia richiesta esiste ed è usata; difetti segnalati', () => {
  const techs = json('research/technologies.json'); const ids = new Set(techs.technologies.map((t) => t.id));
  assert.deepEqual(validatePortLevels(levels, { techIds: ids }), []);
  assert.deepEqual(validateTechnologies(techs, { consumers: consumersOf({ levels: json('industry/factory_levels.json'), security: json('security/security.json'), ports: levels }) }), []);
  const bad = structuredClone(levels); bad.levels[2].ecv = 10; bad.levels[1].requires = 'TECH-NO';
  const errors = validatePortLevels(bad, { techIds: ids });
  assert.ok(errors.some((e) => /costa meno/.test(e)) && errors.some((e) => /TECH-NO/.test(e)));
  assert.equal(maxPortLevel(levels), 3);
});

test('costo: livello 1 = 40 ECV, 100 t acciaio, 150 lavoratori, 40 giorni (media); Reale più caro e lungo; oltre L3 nulla', () => {
  assert.deepEqual(portCost(levels, economy, 0, 'media'), { ecv: 40, steel: 100, workers: 150, days: 40 });
  const real = portCost(levels, economy, 0, 'reale'); assert.equal(real.ecv, 60); assert.equal(real.days, 52);
  assert.equal(portCost(levels, economy, 3, 'media'), null);
});

test('costruzione da zero: Pescara (senza porto) → L1 → L2; paga, riserva i lavoratori, salva e ricarica', () => {
  const id = city('Pescara'); const s0 = rich(fresh());
  assert.equal(portLevelIn(s0, base, id), 0);
  const cost = portCost(levels, economy, 0, 'media');
  const r = build.start(s0, 'ITA', { kind: 'port', cittaId: id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.state.nations.ITA.balance, 1e7 - cost.ecv); assert.equal(s0.nations.ITA.balance, 1e7);
  assert.equal(workersState(r.state.nations.ITA, { factoriesById: cat.byId, share, levels: catalog.levels }).building, cost.workers);
  assert.equal(build.start(r.state, 'ITA', { kind: 'port', cittaId: id }).reason, 'already_building');
  assert.deepEqual(validateState(r.state), []);
  let s = finish(r.state, cost.days - 1); assert.equal(portLevelIn(s, base, id), 0, 'ancora nessun porto');
  s = finish(s, 1); assert.equal(portLevelIn(s, base, id), 1); assert.equal(s.nations.ITA.construction.length, 0);
  const back = parseSave(serializeSave(s)); assert.equal(back.ok, true, JSON.stringify(back)); assert.equal(portLevelIn(back.state, base, id), 1);
  const r2 = build.start(s, 'ITA', { kind: 'port', cittaId: id }); assert.equal(r2.ok, true);
  s = finish(r2.state, portCost(levels, economy, 1, 'media').days); assert.equal(portLevelIn(s, base, id), 2);
});

test('grande porto: serve TECH-LOG-HARBOUR; con la tecnologia Genova (L3 nel 1936) è già al massimo, Bari (L2) sale a L3', () => {
  const bari = city('Bari'); const genova = city('Genova');
  assert.equal(portLevelIn(fresh(), base, bari), 2); assert.equal(portLevelIn(fresh(), base, genova), 3);
  const no = build.start(rich(fresh()), 'ITA', { kind: 'port', cittaId: bari });
  assert.equal(no.ok, false); assert.equal(no.reason, 'missing'); assert.ok(no.missing.some((m) => m.what === 'tech' && m.need === 'TECH-LOG-HARBOUR'));
  const ok = build.start(rich(fresh(), { research: { done: ['TECH-LOG-HARBOUR'], active: null } }), 'ITA', { kind: 'port', cittaId: bari });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(build.start(rich(fresh(), { research: { done: ['TECH-LOG-HARBOUR'], active: null } }), 'ITA', { kind: 'port', cittaId: genova }).reason, 'max_level');
});

test('rifiuti: città non costiera o inesistente, città non controllata, risorse insufficienti, senza dati dei porti', () => {
  const s0 = rich(fresh());
  assert.equal(build.start(s0, 'ITA', { kind: 'port', cittaId: 'P_ITA_ROMA_CITTA' }).reason, 'not_coastal');
  assert.equal(build.start(s0, 'ITA', { kind: 'port', cittaId: 'X' }).reason, 'not_coastal');
  assert.equal(build.start(s0, 'ITA', { kind: 'port', cittaId: city('Amburgo', 'DEU') }).reason, 'not_controlled');
  assert.equal(build.start(rich(fresh(), { balance: 1 }), 'ITA', { kind: 'port', cittaId: city('Pescara') }).reason, 'missing');
  const none = createConstruction({ catalog, economy, sites: json('resources/mine_sites.json'), hydro: json('resources/hydro_plants.json'), political, workersShare: share });
  assert.equal(none.start(s0, 'ITA', { kind: 'port', cittaId: city('Pescara') }).reason, 'no_port_data');
});

test('stato: forma valida e difetti segnalati', () => {
  assert.deepEqual(validatePortsShape(undefined), []); assert.deepEqual(validatePortsShape({ levels: { X: 2 } }), []);
  assert.ok(validatePortsShape({ levels: { X: 4 } }).length > 0 && validatePortsShape(null).length > 0 && validatePortsShape({ levels: [] }).length > 0);
});

test('vista: righe dei porti di una provincia, riepilogo nazionale, etichetta della coda e messaggi', async () => {
  const { provincePortRows, portSummary } = await import('../src/ui/portView.js');
  const { economySummary, describeBuildFailure } = await import('../src/ui/buildOptions.js');
  const { entityOfProvinceId } = await import('../src/data/provinceOwner.js');
  const entityIds = political.map((e) => e.id); const entityOf = (id) => entityOfProvinceId(id, entityIds);
  const ports = { levels, coastal, base };
  const s0 = rich(fresh());
  const mother = coastal[city('Pescara')].parentProvince;
  const rows = provincePortRows(s0, mother, { ports, build, nationId: 'ITA' });
  const row = rows.find((r) => r.name === 'Pescara'); assert.ok(row && row.level === 0 && row.ok && row.nextName === 'Porto locale' && row.cost.ecv === 40);
  assert.equal(provincePortRows(s0, 'P_NONE', { ports, build, nationId: 'ITA' }).length, 0);
  assert.equal(provincePortRows(s0, mother, { ports: null, build, nationId: 'ITA' }).length, 0);
  const sum = portSummary(s0, 'ITA', { ports, entityOf }); assert.ok(sum.total > 5 && sum.count[3] >= 1 && sum.names[1] === 'Porto locale');
  const r = build.start(s0, 'ITA', { kind: 'port', cittaId: city('Pescara') });
  const q = economySummary(r.state, 'ITA', { build, catalog, workersShare: share, portLevels: levels, provinceName: (id) => id }).queue[0];
  assert.equal(q.label, 'Porto locale (porto)'); assert.equal(q.where, mother);
  assert.equal(describeBuildFailure({ ok: false, reason: 'not_coastal' }), 'Questa città non è sulla costa');
  const done = finish(r.state, 40); assert.equal(portSummary(done, 'ITA', { ports, entityOf }).total, sum.total + 1);
});
