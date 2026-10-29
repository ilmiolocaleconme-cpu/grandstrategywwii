// Strade e ferrovie in partita (29/10/2026): livello massimo, livello di partenza, miglioramento, effetto su marcia/commercio e sulla mappa. Valori DESIGN_DEFAULT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createConstruction } from '../src/game/construction.js';
import { serializeSave, parseSave } from '../src/game/save.js';
import { workersState } from '../src/rules/workers.js';
import { findLandRoute } from '../src/rules/trade.js';
import { provinceLinkStats } from '../src/rules/provinceView.js';
import { entityOfProvinceId } from '../src/data/provinceOwner.js';
import { buildLinkEdges, validateLinkEdges, validateInfrastructureConfig, createInfraIndex, levelOf, upgradeEdgeCost, infraNet, applyLinkLevels } from '../src/data/infrastructure.js';
import { provinceLinkRows, infraSummary } from '../src/ui/infraView.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const config = json('infrastructure/infrastructure.json'); const edgesFile = json('infrastructure/link_edges.json'); const linksFile = json('links.json');
const provinces = await loadProvinces(); const props = provinces.features.map((f) => f.properties);
const index = createInfraIndex(edgesFile);
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const catalog = { recipes: new Map(json('industry/recipes.json').recipes.map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json') };
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id); const entityIds = political.map((e) => e.id);
const population = json('population/population.json'); const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const share = population.workersShare.value;
const build = createConstruction({ catalog, economy, sites: json('resources/mine_sites.json'), hydro: json('resources/hydro_plants.json'), political, workersShare: share, infra: { index, config } });
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const rich = (s) => ({ ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, balance: 1e7, population: 1e9, stocks: { ...s.nations.ITA.stocks, steel: 1e7 } } } });
const nat = (id) => entityOfProvinceId(id, entityIds);
const itaEdge = (pred = () => true) => index.edges.find((e) => nat(e.a) === 'ITA' && nat(e.b) === 'ITA' && e.start < e.ceiling && pred(e));

test('dati: parametri e collegamenti validi; il file coincide con quello rigenerato dal grafo (nessuna deriva)', () => {
  assert.deepEqual(validateInfrastructureConfig(config), []);
  assert.deepEqual(validateLinkEdges(edgesFile, { provinceIds: new Set(props.map((p) => p.parentProvince ?? p.id)) }), []);
  assert.deepEqual(buildLinkEdges({ links: linksFile, config, provinces: props }), edgesFile);
  const bad = structuredClone(config); bad.levels[1].speedFactor = 0.1;
  assert.ok(validateInfrastructureConfig(bad).length > 0);
});

test('partenza: pochi collegamenti al massimo (ferrovie sotto il 40%), mai sopra il massimo, quota per nazione rispettata, ferrovia di partenza sotto i km del 1936', () => {
  const rail = index.edges.filter((e) => e.ceiling === 4);
  const railAtStart = rail.filter((e) => e.start === 4);
  assert.ok(rail.length > 500 && railAtStart.length / rail.length < 0.4, `${railAtStart.length} su ${rail.length}`);
  assert.ok(index.edges.every((e) => e.start >= 1 && e.start <= e.ceiling && (e.ceiling === 1 ? e.start === 1 : e.ceiling === 4 ? [1, 3, 4].includes(e.start) : e.start >= e.ceiling - 1)));
  const perNation = new Map();
  for (const e of index.edges) if (e.ceiling >= 2) { const k = `${nat(e.a)}|${e.ceiling}`; const g = perNation.get(k) ?? { n: 0, kept: 0 }; g.n += 1; if (e.start === e.ceiling) g.kept += 1; perNation.set(k, g); }
  for (const [k, g] of perNation) assert.ok(g.kept <= Math.ceil(config.start.keepAtCeiling[k.split('|')[1]] * g.n) + 0, k);
  // le ferrovie importanti restano: i collegamenti tenuti hanno importanza ≥ di quelli declassati nella stessa nazione e livello
  const imp = (e) => { const f = (x) => Math.max(0, ...linksFile.nodes.filter((n) => (props[n.p].parentProvince ?? props[n.p].id) === x).map((n) => n.pop ?? 0)); return f(e.a) + f(e.b); };
  const ita4 = index.edges.filter((e) => nat(e.a) === 'ITA' && e.ceiling === 4);
  const minKept = Math.min(...ita4.filter((e) => e.start === 4).map(imp)); const maxDrop = Math.max(...ita4.filter((e) => e.start === 3).map(imp));
  assert.ok(minKept >= maxDrop, `${minKept} < ${maxDrop}`);
  const minMain = Math.min(...ita4.filter((e) => e.start === 3).map(imp)); const maxDirt = Math.max(...ita4.filter((e) => e.start === 1).map(imp));
  assert.ok(minMain >= maxDirt, 'le ferrovie declassate più importanti vanno a strada principale, le altre a sterrata');
  assert.ok(rail.some((e) => e.start === 1) && rail.some((e) => e.start === 3), 'si vedono entrambi i declassamenti');
  const table = json('infrastructure/rail_length_1936.json').entries.filter((x) => x.comparable);
  for (const t of table) {
    const km = index.edges.filter((e) => e.start === 4 && nat(e.a) === t.nation).reduce((s, e) => s + e.km, 0);
    assert.ok(km <= t.km, `${t.nation}: ${Math.round(km)} km di ferrovia in partenza contro ${t.km} del ${t.year}`);
  }
});

test('costi: 100 km di ferrovia = 50 ECV, 125 t di acciaio, 8000 lavoratori, 67 giorni (media); Reale costa e dura di più', () => {
  const e = { km: 100 };
  assert.deepEqual(upgradeEdgeCost(config, economy, e, 3, 'media'), { ecv: 50, steel: 125, workers: 8000, days: 67 });
  const real = upgradeEdgeCost(config, economy, e, 3, 'reale'); assert.equal(real.ecv, 75); assert.equal(real.days, 87);
  assert.equal(upgradeEdgeCost(config, economy, { km: 1 }, 1, 'media').days, 5, 'almeno 5 giorni');
  assert.equal(upgradeEdgeCost(config, economy, e, 4, 'media'), null, 'oltre la ferrovia non si va');
});

test('ordine: paga, riserva i lavoratori, a fine lavori il livello sale di uno; stato precedente intatto; salvataggio e ricarica', () => {
  const s0 = rich(fresh()); const e = itaEdge(); assert.ok(e, 'esiste un collegamento italiano migliorabile');
  assert.equal(levelOf(s0, e), e.start);
  const cost = upgradeEdgeCost(config, economy, e, e.start, 'media');
  const r = build.start(s0, 'ITA', { kind: 'infra', edgeId: e.id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.state.nations.ITA.balance, Math.round((1e7 - cost.ecv) * 1000) / 1000); assert.equal(s0.nations.ITA.balance, 1e7);
  assert.equal(workersState(r.state.nations.ITA, { factoriesById: cat.byId, share, levels: catalog.levels }).building, cost.workers);
  assert.equal(build.start(r.state, 'ITA', { kind: 'infra', edgeId: e.id }).reason, 'already_building');
  assert.deepEqual(validateState(r.state), []);
  let s = r.state;
  for (let i = 0; i < cost.days - 1; i += 1) s = build.constructionDay(advanceDay(s, []));
  assert.equal(levelOf(s, e), e.start, 'ancora al vecchio livello');
  s = build.constructionDay(advanceDay(s, []));
  assert.equal(levelOf(s, e), e.start + 1); assert.equal(s.nations.ITA.construction.length, 0);
  assert.deepEqual(validateState(s), []);
  const back = parseSave(serializeSave(s));
  assert.equal(back.ok, true, JSON.stringify(back)); assert.equal(levelOf(back.state, e), e.start + 1);
  assert.equal(parseSave(serializeSave(fresh())).ok, true, 'un salvataggio senza il campo si carica');
});

test('rifiuti: livello massimo, collegamento straniero o di confine, collegamento inesistente, fondi, dati assenti', () => {
  const s0 = rich(fresh());
  const atMax = index.edges.find((e) => nat(e.a) === 'ITA' && nat(e.b) === 'ITA' && e.start === e.ceiling && e.ceiling >= 2);
  assert.equal(build.start(s0, 'ITA', { kind: 'infra', edgeId: atMax.id }).reason, 'max_level');
  const foreign = index.edges.find((e) => nat(e.a) === 'FRA' && nat(e.b) === 'FRA' && e.start < e.ceiling);
  assert.equal(build.start(s0, 'ITA', { kind: 'infra', edgeId: foreign.id }).reason, 'not_controlled');
  const border = index.edges.find((e) => nat(e.a) !== nat(e.b) && (nat(e.a) === 'ITA' || nat(e.b) === 'ITA') && e.start < e.ceiling);
  if (border) assert.equal(build.start(s0, 'ITA', { kind: 'infra', edgeId: border.id }).reason, 'not_controlled', 'serve il controllo di entrambe le province');
  assert.equal(build.start(s0, 'ITA', { kind: 'infra', edgeId: 'X~Y' }).reason, 'no_edge');
  const e = itaEdge();
  const poor = { ...s0, nations: { ...s0.nations, ITA: { ...s0.nations.ITA, balance: 0 } } };
  assert.equal(build.start(poor, 'ITA', { kind: 'infra', edgeId: e.id }).reason, 'missing');
  const noData = createConstruction({ catalog, economy, sites: json('resources/mine_sites.json'), hydro: json('resources/hydro_plants.json'), political, workersShare: share });
  assert.equal(noData.start(s0, 'ITA', { kind: 'infra', edgeId: e.id }).reason, 'no_infrastructure_data');
});

test('effetto: una strada migliore accorcia i km equivalenti di marcia e commercio; senza collegamento nessun effetto; gli altri metodi della rete restano', () => {
  const net = { has: () => true, provinces: () => ['A', 'B', 'C'], neighbors: (m) => (m === 'B' ? ['A', 'C'] : ['B']), km: () => 100, owner: () => 'X', name: (m) => m, centre: () => [0, 0] };
  const idx = createInfraIndex({ provinces: ['A', 'B'], edges: [[0, 1, 4, 2, 100]] });
  const at = (level) => ({ infrastructure: { levels: { 'A~B': level } } });
  assert.equal(infraNet(net, idx, config, at(2)).km('A', 'B'), 100);
  assert.equal(infraNet(net, idx, config, at(4)).km('B', 'A'), 100 / 1.5);
  assert.equal(infraNet(net, idx, config, at(1)).km('A', 'B'), 125);
  assert.equal(infraNet(net, idx, config, at(4)).km('B', 'C'), 100, 'nessun collegamento nei dati: fattore 1');
  assert.deepEqual(infraNet(net, idx, config, at(4)).neighbors('B'), ['A', 'C']);
  const owners = { A: 'SELL', B: 'BUY', C: 'BUY' };
  const route = (lv) => findLandRoute(infraNet(net, idx, config, at(lv)), (m) => owners[m], 'SELL', 'BUY');
  assert.equal(route(2).km, 100); assert.equal(route(4).km, 67);
});

test('mappa: i collegamenti mostrati seguono il livello della partita (ferrovie di partenza meno di quelle dei dati), il file originale non cambia', () => {
  const ids = props.map((p) => p.id); const mother = new Map(props.map((p) => [p.id, p.parentProvince ?? p.id]));
  const ctx = (state) => ({ provinceIds: ids, motherOf: (id) => mother.get(id), index, state });
  const rawRail = linksFile.links.filter((l) => l.t === 4).length;
  const before = JSON.stringify(linksFile.links.slice(0, 50));
  const v0 = applyLinkLevels(linksFile, ctx(null));
  assert.equal(JSON.stringify(linksFile.links.slice(0, 50)), before);
  const rail0 = v0.links.filter((l) => l.t === 4).length;
  assert.ok(rail0 < rawRail * 0.5, `${rail0} contro ${rawRail}`);
  assert.ok(v0.segments.filter((s) => s.t === 4).length < linksFile.segments.filter((s) => s.t === 4).length);
  assert.ok(v0.links.every((l, i) => l.t <= linksFile.links[i].t));
  // tutti i collegamenti sopra il livello di partenza al massimo: la vista coincide con i dati
  const maxed = { infrastructure: { levels: Object.fromEntries(index.edges.map((e) => [e.id, e.ceiling])) } };
  assert.equal(applyLinkLevels(linksFile, ctx(maxed)).links.filter((l) => l.t === 4).length, rawRail);
});

test('statistiche per provincia: a e b sono indici di provincia, anche quando i nodi del grafo sono meno delle province', () => {
  const pieces = [{ id: 'P_A_1' }, { id: 'P_A_2' }, { id: 'P_B_1' }, { id: 'P_B_2' }];
  const file = { nodes: [{ p: 1 }, { p: 3 }], links: [{ a: 1, b: 3, t: 4 }, { a: 0, b: 2, t: 1 }] };
  const stats = provinceLinkStats(file, pieces);
  assert.deepEqual(stats.get('P_A_2'), { links: 1, rail: 1, road: 0 });
  assert.deepEqual(stats.get('P_B_2'), { links: 1, rail: 1, road: 0 });
  assert.deepEqual(stats.get('P_A_1'), { links: 1, rail: 0, road: 1 });
});

test('interfaccia: righe di una provincia con costo e prova a secco, riepilogo della rete della nazione', () => {
  const s0 = rich(fresh()); const e = itaEdge();
  const before = JSON.stringify(s0);
  const { rows } = provinceLinkRows(s0, e.a, { infra: { index, config }, build, nationId: 'ITA' });
  assert.equal(JSON.stringify(s0), before);
  const row = rows.find((r) => r.edgeId === e.id);
  assert.ok(row && row.ok && !row.atMax && row.level === e.start && row.cost.days >= 5 && /Strada|Ferrovia/.test(row.levelName));
  assert.deepEqual(row.order, { kind: 'infra', edgeId: e.id });
  const sum = infraSummary(s0, 'ITA', { infra: { index, config }, entityOf: nat });
  assert.ok(sum.links > 0 && sum.upgradable > 0 && sum.km[4] > 0 && sum.km[4] + sum.km[3] + sum.km[2] > 0);
  const after = infraSummary({ ...s0, infrastructure: { levels: { [e.id]: e.start + 1 } } }, 'ITA', { infra: { index, config }, entityOf: nat });
  assert.equal(after.upgradable, sum.upgradable - (e.start + 1 < e.ceiling ? 0 : 1));
  assert.ok(Math.abs(sum.km[e.start] - after.km[e.start] - e.km) <= 1 && Math.abs(after.km[e.start + 1] - sum.km[e.start + 1] - e.km) <= 1, 'i km passano al livello superiore');
});
