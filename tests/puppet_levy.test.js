// Risorse prese ai fantocci (decisione dell'utente 12/11/2026, opzione C): quota scelta da chi controlla, rapporto in calo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVY_STEPS, puppetsOf, applyLevy, setLevy, levyOf, levyYield } from '../src/rules/puppetLevy.js';
import { createDiplomacyGame } from '../src/game/diplomacyState.js';
import { validateDiplomacyConfig } from '../src/rules/diplomacy.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const political = json('political_1936.json');
const puppets = puppetsOf(political);
const baseline = json('resources/extraction_baseline.json').byTerritory;

test('fantocci dai dati del 1936: Manciukuò → Giappone; i mandati della Società delle Nazioni no', () => {
  assert.equal(puppets.get('MAN'), 'JPN');
  assert.equal(puppets.get('NFL'), 'GBR');
  assert.equal(puppets.has('PAL'), false);
  assert.equal(puppets.has('TIB'), false, 'il Tibet è de facto indipendente: proprietario CHN, non un fantoccio');
});

test('la quota sposta l\'estrazione di base dal fantoccio a chi lo controlla; il totale non cambia', () => {
  const supply = { MAN: { ...baseline.MAN }, JPN: { ...baseline.JPN } };
  assert.equal(applyLevy(supply, puppets, undefined), supply);
  const half = applyLevy(supply, puppets, { MAN: 0.5 });
  assert.equal(half.MAN.iron_ore, Math.round(baseline.MAN.iron_ore * 0.5 * 1000) / 1000);
  assert.ok(Math.abs(half.MAN.iron_ore + half.JPN.iron_ore - (baseline.MAN.iron_ore + baseline.JPN.iron_ore)) < 0.002);
  const all = applyLevy(supply, puppets, { MAN: 1 });
  assert.equal(all.MAN.coal, 0);
  assert.ok(Math.abs(all.JPN.coal - (baseline.JPN.coal + baseline.MAN.coal)) < 0.002);
  assert.equal(supply.MAN.coal, baseline.MAN.coal, 'nessuna mutazione');
});

test('solo chi controlla imposta la quota, e solo a passi di 25%', () => {
  const s0 = { nations: {} };
  assert.equal(setLevy(s0, puppets, 'DEU', 'MAN', 0.5).reason, 'not_overlord');
  assert.equal(setLevy(s0, puppets, 'JPN', 'MAN', 0.3).reason, 'bad_share');
  const r = setLevy(s0, puppets, 'JPN', 'MAN', 0.75);
  assert.equal(levyOf(r.state, 'MAN'), 0.75);
  assert.equal(levyOf(setLevy(r.state, puppets, 'JPN', 'MAN', 0).state, 'MAN'), 0);
  assert.deepEqual(LEVY_STEPS, [0, 0.25, 0.5, 0.75, 1]);
  assert.ok(levyYield({ MAN: baseline.MAN }, 'MAN', 1).iron_ore > 160);
});

test('il rapporto fra chi controlla e il fantoccio scende ogni giorno in proporzione alla quota', () => {
  const config = json('diplomacy/diplomacy.json');
  assert.deepEqual(validateDiplomacyConfig(config), []);
  const dip = createDiplomacyGame({ config, start: { relations: [['JPN', 'MAN', 50]] }, political });
  let s = dip.init({ date: '1936-01-01', day: 0, nations: { JPN: {}, MAN: {} }, war: null, trade: null });
  s = dip.setPuppetLevy(s, 'JPN', 'MAN', 1).state;
  for (let d = 0; d < 100; d += 1) s = dip.diplomacyDay(s);
  assert.ok(Math.abs(dip.relation(s, 'JPN', 'MAN') - (50 + 100 * config.puppet.relationPerDayAtFull)) < 0.01);
  let h = dip.setPuppetLevy(dip.init({ date: '1936-01-01', day: 0, nations: { JPN: {}, MAN: {} } }), 'JPN', 'MAN', 0.5).state;
  for (let d = 0; d < 100; d += 1) h = dip.diplomacyDay(h);
  assert.ok(dip.relation(h, 'JPN', 'MAN') > dip.relation(s, 'JPN', 'MAN'));
  assert.equal(dip.overlordOf('MAN'), 'JPN');
});

test('rapporto iniziale Giappone–Manciukuò +80 (decisione dell\'utente 12/11/2026)', () => {
  const start = json('diplomacy/relations_1936.json');
  assert.ok(start.relations.some(([a, b, v]) => a === 'JPN' && b === 'MAN' && v === 80));
});
