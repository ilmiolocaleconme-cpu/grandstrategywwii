// Ricerca e albero tecnologico iniziale (29/10/2026). Valori DESIGN_DEFAULT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createResearch, researchOf, hasTech, validateResearch } from '../src/game/research.js';
import { validateTechnologies, consumersOf, techCost } from '../src/data/technologies.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const technologies = json('research/technologies.json'); const levels = json('industry/factory_levels.json');
const security = json('security/security.json');
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json'); const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const fresh = () => newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state;
const research = createResearch({ technologies, economy });
const rich = (s) => ({ ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, balance: 1e5 } } });

test('dati: albero valido, senza cicli, e ogni tecnologia ha un\'utilità reale nelle regole', () => {
  assert.deepEqual(validateTechnologies(technologies, { consumers: consumersOf({ levels, security }) }), []);
  assert.equal(technologies.quality, 'DESIGN_DEFAULT');
  const cyc = structuredClone(technologies); cyc.technologies[0].prerequisites = ['TECH-IND-MASS'];
  assert.ok(validateTechnologies(cyc).some((e) => /ciclo/.test(e)));
  const orphan = structuredClone(technologies); orphan.technologies[1].prerequisites = ['TECH-NOPE'];
  assert.ok(validateTechnologies(orphan).some((e) => /non esiste/.test(e)));
  assert.ok(validateTechnologies(technologies, { consumers: new Set(['TECH-IND-SERIES']) }).some((e) => /nessuna utilità/.test(e)));
});

test('avvio: paga subito, una sola ricerca alla volta, prerequisiti e fondi controllati, lo stato precedente non cambia', () => {
  const s0 = rich(fresh()); const b0 = s0.nations.ITA.balance;
  assert.equal(research.start(s0, 'ITA', 'TECH-IND-MASS').reason, 'prerequisites');
  assert.equal(research.start(s0, 'ITA', 'TECH-NOPE').reason, 'unknown_tech');
  assert.equal(research.start({ ...s0, nations: { ...s0.nations, ITA: { ...s0.nations.ITA, balance: 1 } } }, 'ITA', 'TECH-IND-SERIES').reason, 'missing');
  const r = research.start(s0, 'ITA', 'TECH-IND-SERIES');
  assert.equal(r.ok, true);
  assert.equal(r.state.nations.ITA.balance, b0 - 60); assert.equal(s0.nations.ITA.balance, b0);
  assert.equal(research.start(r.state, 'ITA', 'TECH-SEC-INTEL').reason, 'busy');
  assert.deepEqual(validateState(r.state), []);
});

test('avanzamento: 90 giorni di ricerca, al giorno 89 manca ancora un giorno, poi la tecnologia è acquisita e si può ricercare la successiva', () => {
  let s = research.start(rich(fresh()), 'ITA', 'TECH-IND-SERIES').state;
  for (let i = 0; i < 89; i += 1) s = research.researchDay(advanceDay(s, []));
  assert.equal(researchOf(s.nations.ITA).active.daysLeft, 1);
  s = research.researchDay(advanceDay(s, []));
  assert.equal(researchOf(s.nations.ITA).active, null); assert.ok(hasTech(s.nations.ITA, 'TECH-IND-SERIES'));
  assert.equal(research.start(s, 'ITA', 'TECH-IND-SERIES').reason, 'already_done');
  assert.equal(research.start(s, 'ITA', 'TECH-IND-MASS').ok, true);
  assert.deepEqual(validateState(s), []);
});

test('difficoltà: Reale costa e dura di più, Facile di meno; elenco con stati (locked, available, active, done)', () => {
  const t = technologies.technologies[0];
  assert.ok(techCost(economy, t, 'reale').ecv > techCost(economy, t, 'media').ecv);
  assert.ok(techCost(economy, t, 'facile').days < techCost(economy, t, 'media').days);
  const s = research.start(rich(fresh()), 'ITA', 'TECH-IND-SERIES').state;
  const st = Object.fromEntries(research.listFor(s, 'ITA').map((x) => [x.tech.id, x.status]));
  assert.deepEqual(st, { 'TECH-IND-SERIES': 'active', 'TECH-IND-MASS': 'locked', 'TECH-SEC-INTEL': 'busy', 'TECH-SEC-CI': 'locked' });
});

test('salvataggio: ricerca malformata o con tecnologie sconosciute viene rifiutata', () => {
  assert.deepEqual(validateResearch('ITA', undefined), []);
  assert.notDeepEqual(validateResearch('ITA', { done: 'x' }), []);
  assert.notDeepEqual(validateResearch('ITA', { done: ['A', 'A'], active: null }), []);
  assert.notDeepEqual(validateResearch('ITA', { done: ['ZZZ'], active: null }, new Set(['A'])), []);
  const s = fresh(); const bad = { ...s, nations: { ...s.nations, ITA: { ...s.nations.ITA, research: { done: [], active: { techId: 'T', daysLeft: 0 } } } } };
  assert.notDeepEqual(validateState(bad), []);
});
