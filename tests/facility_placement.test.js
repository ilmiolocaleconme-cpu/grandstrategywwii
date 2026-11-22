// Collocazione degli impianti iniziali (decisioni dell'utente del 21/11/2026): regola uguale per tutte le nazioni, spazi occupati,
// sponda della città, conquista con danno, edifici visibili solo per il giocatore e gli alleati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { facilitySitesFile } from '../src/data/facilitySites.js';
import { placeFacilities, applyFacilitySites, captureFacilities, scoreOf } from '../src/rules/facilityPlacement.js';
import { buildingsByProvince } from '../src/rules/mapBuildings.js';
import { newGame } from '../src/game/state.js';
import { SLOT_CAPACITY } from '../src/rules/slots.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const j = (p) => JSON.parse(text(p));
const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv'), extraFactoriesCsv: text('industry/factories_extra.csv'), extraStructuresCsv: text('infrastructure/structures_extra.csv') });
const classOf = (id) => cat.byId.get(id)?.factory_class ?? null;
const file = j('industry/initial_facility_sites.json');
const collection = await loadProvinces();
const elementIds = new Set(collection.features.map((f) => f.properties.id));
const nationIds = j('nations.json').map((n) => n.id);
const political = j('political_1936.json');
const start = { nationIds, industry: j('industry/initial_industry.json'), stocks: j('industry/initial_stocks.json'), cash: j('industry/initial_cash.json'), economy: j('economy/economy.json'), population: j('population/population.json') };
const fresh = (nation = 'ITA') => newGame({ nation, political, ownersWithProvinces: nationIds, start, difficulty: 'media' }).state;

test('il file generato è aggiornato (npm run build:facility-sites)', () => {
  assert.deepEqual(facilitySitesFile({ features: collection.features, j, factoryClassOf: classOf }), file);
});

test('ogni impianto iniziale ha un posto della mappa, oppure è fra i senza posto con il motivo', () => {
  const s = fresh();
  const all = Object.values(s.nations).flatMap((n) => n.facilities.map((f) => f.id));
  const unplaced = new Set(file.unplaced.map((u) => u.id));
  for (const id of all) assert.ok(file.sites[id] || unplaced.has(id), `${id} senza esito`);
  for (const [id, site] of Object.entries(file.sites)) {
    assert.ok(elementIds.has(site.provinceId), `${id}: ${site.provinceId} non è un posto della mappa`);
    assert.ok(['rule', 'data', 'source'].includes(site.basis));
  }
  assert.ok(file.unplaced.every((u) => u.reason === 'no_provinces'), 'solo i microstati senza province restano fuori');
});

test('gli impianti di classe industria non superano i 14 spazi di un posto', () => {
  const s = applyFacilitySites(fresh(), file);
  for (const [id, n] of Object.entries(s.nations)) {
    const used = new Map();
    for (const f of n.facilities) if (f.provinceId && classOf(f.type) === 'industry') used.set(f.provinceId, (used.get(f.provinceId) ?? 0) + 1);
    for (const [p, k] of used) assert.ok(k <= SLOT_CAPACITY.province, `${id} ${p}: ${k}`);
  }
});

test('la regola: acciaio italiano in un porto (poco carbone), alluminio dai centri di fonderia', () => {
  const of = (owner, type) => Object.entries(file.sites).filter(([id]) => id.startsWith(`${owner}:`) && id.split(':')[2] === type).map(([, s]) => s);
  assert.ok(of('ITA', 'FCT-STEEL').every((s) => s.rule === 'port'));
  assert.ok(of('DEU', 'FCT-ALUMINIUM').every((s) => s.basis === 'data'));
});

test('fonti storiche della Germania (22/11/2026): ogni fonte usata per intero, con riferimento; acciaio per quota (Ruhr 8 su 12)', () => {
  const cfg = j('industry/facility_placement.json');
  const used = Object.values(file.sites).filter((s) => s.basis === 'source').length;
  assert.equal(used, cfg.sources.reduce((t, s) => t + s.count, 0), 'ogni fonte trova i suoi impianti');
  for (const s of cfg.sources) assert.ok(s.source && /^https?:\/\//.test(s.ref), `${s.factory} ${s.provinceId}: fonte o riferimento mancante`);
  const steel = Object.entries(file.sites).filter(([id]) => id.startsWith('DEU:DEU:FCT-STEEL')).map(([, s]) => s);
  assert.equal(steel.length, 12);
  assert.equal(steel.filter((s) => /DUESSELDORF|ESSEN|WESTFALEN_SUED/.test(s.provinceId)).length, 8);
  const tank = Object.entries(file.sites).find(([id]) => id.startsWith('DEU:DEU:FCT-TANKS'))[1];
  assert.deepEqual([tank.provinceId, tank.basis], ['P_DEU_KURHESSEN', 'source']);
  const mg = Object.entries(file.sites).filter(([id]) => id.includes(':REC-MG-DEU-MG34-')).map(([, s]) => s.provinceId).sort();
  assert.deepEqual(mg, ['P_DEU_BERLIN', 'P_DEU_THUERINGEN'], 'la ricetta sceglie la fonte giusta');
});

test('distribuzione: punteggio / (1 + già messi), spazi pieni → il posto seguente, fonti storiche prima di tutto', () => {
  const mothers = [{ id: 'A', bank: 'A', population: 0, points: { coal: 3 }, port: 0 }, { id: 'B', bank: 'B_SP1', population: 0, points: { coal: 1 }, port: 0 }];
  const fs = Array.from({ length: 4 }, (_, k) => ({ id: `X:${k}`, type: 'S', territory: 'T' }));
  const rules = { default: { by: 'population' }, S: { by: ['coal'] } };
  const r = placeFacilities(fs, { mothersOf: () => mothers, rules, usesSlot: () => true, capacity: 14 });
  assert.deepEqual(Object.values(r.sites).map((s) => s.provinceId), ['A', 'A', 'B_SP1', 'A']);
  const full = placeFacilities(fs, { mothersOf: () => mothers, rules, usesSlot: () => true, capacity: 1 });
  assert.deepEqual(Object.values(full.sites).map((s) => s.provinceId), ['A', 'B_SP1']);
  assert.equal(full.unplaced.length, 2);
  const src = placeFacilities(fs.slice(0, 1), { mothersOf: () => mothers, rules, sources: [{ territory: 'T', factory: 'S', provinceId: 'B_SP1', count: 1, source: 'storia' }], usesSlot: () => true, capacity: 14 });
  assert.deepEqual(src.sites['X:0'], { provinceId: 'B_SP1', basis: 'source', rule: 'storia' });
  assert.equal(scoreOf({ points: { coal: 2, iron_ore: 4 } }, { coal: 1, iron_ore: 0.25 }), 3);
  assert.equal(scoreOf({ port: 2, population: 5 }, 'port'), 2e9 + 5);
});

test('applyFacilitySites: solo gli impianti senza provincia, ripetibile (salvataggi di prima)', () => {
  const s = fresh();
  const a = applyFacilitySites(s, file);
  assert.notEqual(a, s);
  assert.equal(applyFacilitySites(a, file), a, 'seconda volta: nessun cambio');
  const f = a.nations.DEU.facilities.find((x) => x.type === 'FCT-STEEL');
  assert.equal(f.provinceId, file.sites[f.id].provinceId);
  assert.equal(f.site, 'source');
  // salvataggio con la posizione di regola di prima: la fonte storica la sostituisce; un impianto conquistato non si tocca
  const old = { ...a, nations: { ...a.nations, DEU: { ...a.nations.DEU, facilities: a.nations.DEU.facilities.map((x) => (x.id === f.id ? { ...x, provinceId: 'P_DEU_BERLIN', site: 'rule' } : x)) } } };
  assert.equal(applyFacilitySites(old, file).nations.DEU.facilities.find((x) => x.id === f.id).provinceId, file.sites[f.id].provinceId);
  const taken = { ...old, nations: { ...old.nations, DEU: { ...old.nations.DEU, facilities: old.nations.DEU.facilities.map((x) => (x.id === f.id ? { ...x, capturedFrom: 'FRA' } : x)) } } };
  assert.equal(applyFacilitySites(taken, file).nations.DEU.facilities.find((x) => x.id === f.id).provinceId, 'P_DEU_BERLIN');
});

test('conquista: l\'impianto passa al nemico in guerra con il 50% di danno; all\'alleato no; ripreso torna danneggiato', () => {
  let s = applyFacilitySites(fresh(), file);
  const f = s.nations.DEU.facilities.find((x) => x.type === 'FCT-STEEL');
  const where = f.provinceId;
  const ctrl = (to) => (st, p) => (p === where ? to : null);
  const war = (st, a, b) => [a, b].sort().join('|') === 'DEU|FRA';
  let r = captureFacilities(s, ctrl('ITA'), 0.5, war);
  assert.equal(r.moved.length, 0, 'non in guerra: resta');
  r = captureFacilities(s, ctrl('FRA'), 0.5, war);
  assert.ok(r.moved.length >= 1 && r.moved.every((m) => m.from === 'DEU' && m.to === 'FRA'));
  s = r.state;
  const taken = s.nations.FRA.facilities.find((x) => x.id === f.id);
  assert.equal(taken.damage, 0.5);
  assert.equal(taken.capturedFrom, 'DEU');
  assert.equal(s.nations.DEU.facilities.some((x) => x.id === f.id), false);
  s = captureFacilities(s, ctrl('DEU'), 0.5, war).state;
  const back = s.nations.DEU.facilities.find((x) => x.id === f.id);
  assert.equal(back.damage, 0.5, 'ripreso: sempre danneggiato (si ripara col tempo)');
});

test('mappa: edifici solo del giocatore e degli alleati', () => {
  const s = applyFacilitySites(fresh('ITA'), file);
  const kinds = (visible) => Object.values(buildingsByProvince(s, { player: 'ITA', visible })).flat().length;
  const own = kinds(new Set(['ITA']));
  const withGer = kinds(new Set(['ITA', 'DEU']));
  assert.ok(own > 0 && withGer > own);
  const b = buildingsByProvince(s, { player: 'ITA', visible: new Set(['ITA']) });
  assert.ok(Object.keys(b).every((p) => p.startsWith('P_ITA_') || p.startsWith('P_LBY') || p.startsWith('P_ERI') || p.startsWith('P_SOM') || p.startsWith('P_ETH') || p.startsWith('P_ALB') || p.startsWith('P_DOD')), Object.keys(b).filter((p) => !p.startsWith('P_ITA_')).join(','));
});
