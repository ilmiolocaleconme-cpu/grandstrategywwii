// Dottrine come modelli da scegliere (23/11/2026, scelta 3A) e fine produzione dei modelli con successore (scelta 4B).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDoctrines, doctrinesOf, doctrineFactor } from '../src/data/doctrines.js';
import { EQUIPMENT_GROUP_LABEL } from '../src/rules/unitSheet.js';

const j = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = j('ai/doctrines.json');
const ctx = { groups: Object.keys(EQUIPMENT_GROUP_LABEL), branches: j('research/technologies.json').branches.map((b) => b.id), nationIds: j('nations.json').map((n) => n.id) };

test('catalogo valido: settori corazzati, fanteria, artiglieria; pesi al massimo +15%', () => {
  assert.deepEqual(validateDoctrines(doc, ctx), []);
  assert.deepEqual(Object.keys(doc.sectors), ['land_armor', 'land_infantry', 'artillery']);
  assert.equal(doc.maxWeight, 0.15);
  for (const n of ['DEU', 'USSR', 'USA', 'GBR', 'FRA', 'ITA', 'JPN']) assert.ok(doc.defaults[n], n);
});

test('il validatore trova pesi eccessivi, gruppi e settori sbagliati', () => {
  const bad = structuredClone(doc);
  bad.doctrines[0].roles.corazzati = 0.3;
  bad.doctrines[1].roles.navi = 0.1;
  bad.defaults.DEU.land_armor = 'DOC-INF-MASS';
  const errs = validateDoctrines(bad, ctx);
  assert.ok(errs.some((e) => /DOC-ARM-MOBILE: peso corazzati=0.3/.test(e)));
  assert.ok(errs.some((e) => /gruppo navi inesistente/.test(e)));
  assert.ok(errs.some((e) => /DEU: DOC-INF-MASS non è del settore land_armor/.test(e)));
});

test('dottrina in vigore: scelta in partita > predefinita > fallback', () => {
  assert.equal(doctrinesOf(doc, 'DEU').land_armor.id, 'DOC-ARM-MOBILE');
  assert.equal(doctrinesOf(doc, 'POL').land_armor.id, doc.fallback.land_armor, 'senza predefinita: fallback');
  assert.equal(doctrinesOf(doc, 'DEU', { doctrines: { land_armor: 'DOC-ARM-SUPPORT' } }).land_armor.id, 'DOC-ARM-SUPPORT');
  assert.equal(doctrinesOf(doc, 'DEU', { doctrines: { land_armor: 'DOC-INF-MASS' } }).land_armor.id, 'DOC-ARM-MOBILE', 'scelta di un altro settore ignorata');
});

test('moltiplicatore: somma dei settori, 1 se la dottrina non tocca la voce', () => {
  const deu = doctrinesOf(doc, 'DEU');
  assert.equal(doctrineFactor(deu, { role: 'corazzati' }), 1.15);
  assert.equal(doctrineFactor(deu, { role: 'mortai' }), 1.15, 'fanteria +10% e artiglieria +5%');
  assert.equal(doctrineFactor(deu, { role: 'contraerea' }), 1);
  assert.equal(doctrineFactor(deu, { branch: 'armor' }), 1.15);
  assert.equal(doctrineFactor(deu, { branch: 'industry' }), 1);
});

test('fine produzione solo dove c\'è un successore; la fabbrica tedesca dei carri passa al Pz II nel 1937', () => {
  const o = j('units/equipment/equipment_production.json').overrides;
  const ends = { 'TNK-DEU-PZ-I': 'TNK-DEU-PZ-II', 'TNK-DEU-PZ-III': 'TNK-DEU-PZ-III-J', 'TNK-DEU-PZ-IV': 'TNK-DEU-PZ-IV-G', 'TNK-DEU-PZ-VI': 'TNK-DEU-PZ-VIB', 'TD-DEU-STUG-III': 'TD-DEU-STUG-III-G', 'ART-USA-AT37-1940': 'ART-USA-AT57', 'TD-USA-M10': 'TD-USA-M18' };
  for (const [old, next] of Object.entries(ends)) {
    assert.ok(o[old].availableTo, `${old} senza fine`);
    const dayAfter = new Date(Date.parse(`${o[old].availableTo}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    assert.ok((o[next].availableFrom ?? '1936-01-01') <= dayAfter, `${next} deve esistere entro il giorno dopo la fine di ${old}`);
  }
  assert.equal(o['INW-DEU-RIFLE-1939']?.availableTo, undefined, 'il Kar 98k resta in produzione');
  const deu = j('industry/initial_industry.json').nations?.DEU ?? j('industry/initial_industry.json').DEU;
  const tanks = JSON.stringify(deu).match(/"recipeId":"REC-TNK-DEU-PZ-I","count":1,"plannedRecipe":\{"recipeId":"REC-TNK-DEU-PZ-II","from":"1937-01-01"\}/);
  assert.ok(tanks, 'piano Pz I → Pz II');
});
