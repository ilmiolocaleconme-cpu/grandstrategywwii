// Rotte marittime e porti (29/10/2026): solo le province con un porto di livello ≥ 1 fanno da scalo; costruire un porto apre la rotta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { newGame } from '../src/game/state.js';
import { createGameSea } from '../src/game/seaState.js';
import { createSeaContext } from '../src/data/seaRoutes.js';
import { entityOfProvinceId } from '../src/data/provinceOwner.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const seaFile = read('sea_zones.json'); const params = read('sea_routes_params.json'); const political = read('political_1936.json');
const base = read('ports/ports_1936.json'); const coastal = read('ports/coastal_cities.json').cities;
const economy = read('economy/economy.json'); const nationIds = read('nations.json').map((n) => n.id);
const collection = await loadProvinces(); const props = collection.features.map((f) => f.properties);
const provinceIds = props.map((p) => p.id); const motherById = new Map(props.map((p) => [p.id, p.parentProvince ?? p.id]));
const entityIds = political.map((e) => e.id);
const entityOf = (id) => entityOfProvinceId(id, entityIds); const motherOf = (id) => motherById.get(id) ?? id;
const start = { nationIds, industry: read('industry/initial_industry.json'), stocks: read('industry/initial_stocks.json'), cash: read('industry/initial_cash.json'), economy, population: read('population/population.json') };
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const mk = (b = base) => createGameSea({ seaFile, params, provinceIds, motherOf, entityOf, ports: { coastal, base: b } });
const city = (name, owner) => Object.entries(coastal).find(([, c]) => c.name === name && c.owner === owner)[0];

test('porti reali: l\'Italia ha scali solo nelle province con un porto, meno che senza filtro; ogni scalo ha un porto', () => {
  const s = fresh(); const sea = mk(); const ctx = sea.at(s);
  const real = ctx.portsOf('ITA');
  const unfiltered = createSeaContext({ seaFile, params, provinceIds, ownerOf: (id) => s.control[entityOf(id)] }).portsOf('ITA');
  assert.ok(real.length > 3 && real.length < unfiltered.length, `${real.length} contro ${unfiltered.length}`);
  for (const p of real) assert.ok(sea.hasPort(s, p.province), p.province);
});

test('rotta: Germania → Italia via mare con i porti del 1936; Svizzera (senza costa) nessuna', () => {
  const s = fresh(); const ctx = mk().at(s);
  const r = ctx.route('DEU', 'ITA'); assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(r.days > 0);
  assert.equal(ctx.route('CHE', 'ITA').ok, false);
});

test('senza porti niente rotta; costruito il porto (state.ports) la rotta si apre', () => {
  // le colonie italiane (Libia, Somalia) sono controllate dall'Italia: i loro porti contano come scali italiani, quindi si tolgono anche quelli
  const s = fresh(); const empty = { ...base, ports: Object.fromEntries(Object.entries(base.ports).filter(([, p]) => s.control[p.owner] !== 'ITA')) };
  const sea = mk(empty);
  const no = sea.at(s).route('ITA', 'DEU'); assert.equal(no.ok, false); assert.equal(no.reason, 'no_port_seller');
  const withPort = { ...s, ports: { levels: { [city('Bari', 'ITA')]: 1 } } };
  const yes = sea.at(withPort).route('ITA', 'DEU'); assert.equal(yes.ok, true, JSON.stringify(yes));
  assert.deepEqual(sea.at(withPort).portsOf('ITA').map((p) => motherOf(p.province)).filter((m, i, a) => a.indexOf(m) === i), [coastal[city('Bari', 'ITA')].parentProvince]);
});

test('regola minima: una nazione costiera piccola (Portogallo) ha un solo scalo e raggiunge l\'Italia', () => {
  const s = fresh(); const ctx = mk().at(s);
  assert.ok(ctx.portsOf('PRT').length >= 1);
  const r = ctx.route('PRT', 'ITA'); assert.equal(r.ok, true, JSON.stringify(r));
});

test('il controllo segue lo stato: se l\'Italia perde il controllo della provincia, non è più suo scalo', () => {
  const s = fresh(); const sea = mk();
  const bariProv = coastal[city('Bari', 'ITA')].parentProvince;
  const lost = { ...s, control: { ...s.control, [entityOf(bariProv)]: 'DEU' } };
  assert.ok(!sea.at(lost).portsOf('ITA').some((p) => motherOf(p.province) === bariProv));
  assert.ok(sea.at(lost).portsOf('DEU').some((p) => motherOf(p.province) === bariProv));
});
