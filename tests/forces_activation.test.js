// Attivazione delle forze nel tempo (03/11/2026): Francia dal 1/9/1939 e Italia dal 1/6/1940, con i template da CSV; le istanze esistenti non cambiano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newGame } from '../src/game/state.js';
import { initForcesState, createForcesActivationSystem } from '../src/game/forcesState.js';
import { advanceDays } from '../src/game/engine.js';
import { validateForcesState, CATEGORY_FALLBACK } from '../src/rules/forces.js';
import { isActiveAt } from '../src/data/units.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = json('units/units.json').units;
const names = ['divisione_fanteria_germania_1936', 'divisione_corazzata_germania_1936', 'divisione_fanteria_gran_bretagna_1936', 'divisione_fanteria_francia_1936', 'divisione_fanteria_germania_1939', 'divisione_fanteria_francia_1939', 'divisione_fanteria_italia_1940'];
const templates = names.map((f) => json(`units/templates/${f}.json`));
const ratio = json('units/readiness.json').initialFillRatio.value;
const ctx = { units, templates, ratio };
const political = json('political_1936.json');
const nationList = json('nations.json').map((n) => n.id);
const start = () => initForcesState(newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state, ctx).state;
const of = (s, nation) => Object.entries(s.forces.divisions).filter(([id]) => units.find((u) => u.id === id).nation === nation);

test('al 1936 partono Germania, Gran Bretagna e Francia (template 1936); l\'Italia usa già il template 1940 (approssimazione, 12/11/2026: stesse regole per tutte le nazioni)', () => {
  const s = start();
  assert.ok(of(s, 'ITA').length > 0);
  for (const [, d] of of(s, 'ITA')) assert.equal(d.templateId, 'TPL-ITA-INF-1940');
  assert.ok(of(s, 'DEU').length > 0 && of(s, 'GBR').length > 0 && of(s, 'FRA').length > 0);
  for (const [, d] of of(s, 'FRA')) assert.equal(d.templateId, 'TPL-FRA-INF-1936');
});

test('dal 1/9/1939 le divisioni NUOVE di fanteria francese e tedesca usano il template 1939; le istanze esistenti di fanteria passano al 1939 (tests/template_upgrade.test.js), le altre non cambiano; l\'Italia ancora no', () => {
  const s0 = { ...start(), date: '1939-08-30' };
  const sys = createForcesActivationSystem(ctx);
  const beforeFra = of(s0, 'FRA'), beforeDeu = of(s0, 'DEU');
  const a = advanceDays(s0, 1, [sys]);
  const b = advanceDays(a, 1, [sys]);
  const c = advanceDays(b, 40, [sys]);
  for (const [nation, before, tpl] of [['FRA', beforeFra, 'TPL-FRA-INF-1939'], ['DEU', beforeDeu, 'TPL-DEU-INF-1939']]) {
    const after = Object.fromEntries(of(c, nation));
    // Aggiornamento di template (03/11/2026): le istanze di fanteria già create passano alla versione 1939 (stessa nazione, stessa unità, stesso `since`); le altre categorie restano.
    for (const [id, d] of before) {
      if (['infantry', ...Object.keys(CATEGORY_FALLBACK)].includes(units.find((u) => u.id === id).category)) { // anche montagna, cavalleria… usano la fanteria
        assert.equal(after[id].templateId, tpl, `${nation}: ${id} passa al template 1939`);
        assert.equal(after[id].since, d.since);
      } else assert.deepEqual(after[id], d, `${nation}: ${id} non di fanteria, nessuna versione più recente`);
    }
    const nuove = Object.entries(after).filter(([id]) => !before.some(([i]) => i === id) && units.find((u) => u.id === id).category === 'infantry');
    for (const [, d] of nuove) assert.ok(d.templateId.startsWith(`TPL-${nation}-INF-`), 'template di fanteria della nazione');
    for (const [, d] of nuove.filter(([id]) => isActiveAt(units.find((u) => u.id === id), '1939-09-01') && !isActiveAt(units.find((u) => u.id === id), '1939-08-30'))) assert.equal(d.templateId, tpl);
  }
  for (const [, d] of of(c, 'ITA')) assert.equal(d.templateId, 'TPL-ITA-INF-1940');
  assert.deepEqual(validateForcesState(c.forces, units), []);
  const d2 = advanceDays(c, 1, [sys]);
  assert.deepEqual(d2.forces, c.forces, 'idempotente');
});

test('1/6/1940: fanteria italiana con il template ITA 1940 (organico iniziale ignoto → rapporto); cavalli assenti senza inventarli', () => {
  const sys = createForcesActivationSystem(ctx);
  const s = advanceDays({ ...start(), date: '1940-05-30' }, 3, [sys]);
  const ita = of(s, 'ITA');
  assert.ok(ita.length > 0);
  for (const [, d] of ita) {
    assert.equal(d.templateId, 'TPL-ITA-INF-1940');
    assert.deepEqual(d.items['manpower.war'], { planned: 12979, effective: Math.round(12979 * ratio), source: 'ratio' });
    assert.equal(d.items.horses, undefined);
  }
});

test('senza forze inizializzate o prima del primo template non fa nulla', () => {
  const sys = createForcesActivationSystem(ctx);
  const raw = newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state;
  const late = { ...raw, date: '1940-01-01' };
  assert.equal(sys(late), late, 'forze non inizializzate: stesso oggetto');
  const s = start();
  assert.equal(sys(s), s, 'stesso oggetto: nessuna copia');
});
