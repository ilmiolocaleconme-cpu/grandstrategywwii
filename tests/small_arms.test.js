// Modelli di fucile e ramo «Armi della fanteria» (12/11/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSmallArms, producibleModels, modelsUnlockedBy, requiredTechs, smallArmsConsumers } from '../src/data/smallArmsModels.js';
import { validateTechnologies } from '../src/data/technologies.js';
import { buildNations } from '../src/game/economyState.js';
import { techsOf } from '../src/game/research.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/models/fucili_1930_1945.json');
const techs = json('research/technologies.json');
const techIds = new Set(techs.technologies.map((t) => t.id));
const nationIds = new Set(json('nations.json').map((n) => n.id));
const names = (list) => list.map((m) => m.id);

test('dati: catalogo dei fucili valido per le cinque nazioni', () => {
  assert.deepEqual(validateSmallArms(doc, { techIds, nationIds }), []);
  for (const n of ['DEU', 'ITA', 'USSR', 'USA', 'GBR', 'FRA', 'JPN']) assert.ok(doc.models.some((m) => m.nation === n), n);
});

test('le cinque tecnologie della fanteria sono usate tutte dai modelli', () => {
  const inf = techs.technologies.filter((t) => t.branch === 'infantry').map((t) => t.id);
  assert.equal(inf.length, 5);
  const used = smallArmsConsumers(doc);
  for (const id of inf) assert.ok(used.has(id), id);
});

test('validazione: difetti segnalati', () => {
  const bad = structuredClone(doc);
  bad.models[0].requires = 'TECH-NO';
  bad.models[1].parent = 'MDL-DEU-NULLA';
  bad.models[2].status = 'foreign'; delete bad.models[2].origin;
  assert.ok(validateSmallArms(bad, { techIds }).some((e) => /TECH-NO/.test(e)));
  assert.ok(validateSmallArms(bad, { techIds }).some((e) => /padre/.test(e)));
  assert.ok(validateSmallArms(bad, { techIds }).some((e) => /origine/.test(e)));
  const cyc = structuredClone(doc);
  const a = cyc.models.find((m) => m.id === 'MDL-DEU-G43'); a.parent = 'MDL-DEU-K43';
  assert.ok(validateSmallArms(cyc, { techIds }).some((e) => /ciclo/.test(e)));
});

test('tecnologia ereditata dal modello padre: la variante da cecchino del SVT-40 richiede anche il semiautomatico', () => {
  const m = doc.models.find((x) => x.id === 'MDL-USSR-SVT-40-SN');
  assert.deepEqual(requiredTechs(doc, m).sort(), ['TECH-INF-OPTICS', 'TECH-INF-SEMI1']);
});

test('disponibilità: tecnologia + anno (con 2 anni di anticipo al massimo); scorte e sperimentali non si producono', () => {
  const none = new Set();
  assert.deepEqual(names(producibleModels(doc, 'DEU', 1936, none)), ['MDL-DEU-K98K']);
  const all = new Set(techIds);
  assert.ok(!names(producibleModels(doc, 'DEU', 1940, all)).includes('MDL-DEU-G43'), 'G43 non prima del 1941');
  assert.ok(names(producibleModels(doc, 'DEU', 1941, all)).includes('MDL-DEU-G43'), 'G43 dal 1941 con la ricerca anticipata');
  assert.ok(!names(producibleModels(doc, 'DEU', 1944, new Set(['TECH-INF-SEMI1']))).includes('MDL-DEU-G43'), 'senza la 2ª generazione niente G43');
  assert.ok(!names(producibleModels(doc, 'USA', 1945, all)).includes('MDL-USA-M1D'), 'M1D sperimentale');
  assert.ok(!names(producibleModels(doc, 'USSR', 1945, all)).includes('MDL-USSR-FEDOROV'), 'Fedorov solo scorte');
});

test('Francia e Giappone: solo fucili a ripetizione fino al MAS 44 (1944); il Tipo 4 resta sperimentale', () => {
  const all = new Set(['TECH-INF-OPTICS', 'TECH-INF-SEMI1', 'TECH-INF-SEMI2', 'TECH-INF-SELECT', 'TECH-INF-EMERG']);
  assert.ok(names(producibleModels(doc, 'FRA', 1936, new Set())).includes('MDL-FRA-BERTHIER-M34'));
  assert.ok(!names(producibleModels(doc, 'FRA', 1941, all)).some((id) => /MAS-4/.test(id)), 'nessun semiautomatico francese prima del 1942');
  assert.ok(names(producibleModels(doc, 'FRA', 1942, all)).includes('MDL-FRA-MAS-44'), 'anticipo massimo di 2 anni');
  assert.ok(!names(producibleModels(doc, 'JPN', 1945, all)).includes('MDL-JPN-TYPE4'));
  assert.ok(names(producibleModels(doc, 'JPN', 1937, new Set())).includes('MDL-JPN-TYPE99'), 'Tipo 99 anticipato al 1937');
});

test('Ricerca: il pannello sa quali modelli sblocca una tecnologia per la nazione', () => {
  assert.deepEqual(names(modelsUnlockedBy(doc, 'TECH-INF-SEMI2', 'DEU')), ['MDL-DEU-G43', 'MDL-DEU-K43']);
  assert.deepEqual(names(modelsUnlockedBy(doc, 'TECH-INF-SEMI2', 'ITA')), []);
});

test('tecnologie iniziali: USA col Garand e URSS con AVS-36 e ottiche dal 1/1/1936; nessun effetto senza il parametro', () => {
  assert.deepEqual(validateTechnologies(techs), []);
  const political = json('political_1936.json'); const ids = json('nations.json').map((n) => n.id);
  const start = { nationIds: ids, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json') };
  const n = buildNations({ political, ...start, research: techs.initialResearch });
  assert.ok(techsOf(n.USA).has('TECH-INF-SEMI1'));
  assert.ok(techsOf(n.USSR).has('TECH-INF-SELECT'));
  assert.equal(techsOf(n.ITA).size, 0);
  assert.ok(names(producibleModels(doc, 'USA', 1936, techsOf(n.USA))).includes('MDL-USA-M1-GARAND'));
  assert.equal(buildNations({ political, ...start }).USA.research, undefined);
  const bad = structuredClone(techs); bad.initialResearch = { DEU: ['TECH-INF-SEMI2'] };
  assert.ok(validateTechnologies(bad).some((e) => /prerequisito/.test(e)));
});
