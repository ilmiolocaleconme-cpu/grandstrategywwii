// IA passo 3 (23/11/2026): ricerca per punteggio — armi nuove (valore per tonnellata), bonus in battaglia, battaglioni, minaccia,
// industria/sicurezza, × dottrina. Le date storiche restano il minimo garantito (non toccate qui).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { techScore, techUnlockGain, pickResearch, RESEARCH_WEIGHTS } from '../src/rules/aiResearch.js';
import { modelScore, classIdsWithModels } from '../src/rules/aiProduction.js';
import { buildEquipmentRecipes, recipeUnlocked } from '../src/data/equipmentProduction.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquivalence } from '../src/data/equipmentEquivalence.js';
import { buildWeaponOf, buildCategoryOf } from '../src/rules/equipmentFill.js';
import { doctrinesOf, doctrineFactor } from '../src/data/doctrines.js';
import { createAiSecurity } from '../src/game/aiSecurity.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const table = json('units/equipment/equipment_production.json');
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const recipes = buildEquipmentRecipes(catalog, table);
const cfg = json('units/battle_v2.json');
const doctrines = json('ai/doctrines.json');
const techs = json('research/technologies.json');
const units = json('units/units.json').units;
const WEAPON = buildWeaponOf(catalog);
const classIds = classIdsWithModels(catalog, cfg);
const SOURCES = buildEquivalence({ catalog, upgradeMap: json('units/equipment/upgrade_map.json'), generic: { TANK: 'tanks' }, categoryOf: buildCategoryOf(catalog) });
const tech = (id) => techs.technologies.find((t) => t.id === id);

function ctxFor(nation, researched, date, items, { involved = false, rivals = new Set() } = {}) {
  const slots = new Map();
  for (const item of items) for (const s of SOURCES(nation, item)) { if (!slots.has(s)) slots.set(s, new Set()); slots.get(s).add(item); }
  const need = new Map([...slots.keys()].map((s) => [s, 100]));
  const active = doctrinesOf(doctrines, nation);
  const unlocked = (r, res, d) => recipeUnlocked(table, r, res, d, null) && !classIds.has(r.equipmentId);
  const scoreOf = (r) => modelScore(WEAPON(nation, `equipment.${r.equipmentId}`), r.massTonnes, cfg, active);
  const mine = units.filter((u) => u.nation === nation && u.category !== 'command');
  return {
    involved, rivalsHave: (t) => rivals.has(t), doctrine: (b) => doctrineFactor(active, { branch: b }),
    unlockGain: (t) => techUnlockGain(t, { recipes, unlocked, researched, date, slots, need, scoreOf }),
    categoryShare: (cats) => (mine.length ? mine.filter((u) => cats.includes(u.category)).length / mine.length : 0),
    successorsOf: (t) => techs.technologies.filter((x) => x.prerequisites.includes(t) && !researched.has(x.id)),
  };
}
const DEU_ITEMS = ['equipment.TNK-DEU-TANK', 'equipment.ART-DEU-PAK36', 'equipment.INW-DEU-RIFLE-1939'];

test('armi nuove: il cannone da 75 lungo vale per la Germania che ha bisogno di carri, niente se nessuno li usa', () => {
  const res = new Set(techs.initialResearch.DEU);
  const ctx = ctxFor('DEU', new Set([...res, 'TECH-ARM-OPTICS', 'TECH-ARM-GUN-3750']), '1941-01-01', DEU_ITEMS);
  assert.ok(ctx.unlockGain('TECH-ARM-GUN-75L') > 0.3, String(ctx.unlockGain('TECH-ARM-GUN-75L')));
  assert.ok(ctx.unlockGain('TECH-ARM-GUN-75L') <= RESEARCH_WEIGHTS.UNLOCK_CAP);
  const none = ctxFor('DEU', res, '1941-01-01', ['equipment.INW-DEU-RIFLE-1939']);
  assert.equal(none.unlockGain('TECH-ARM-GUN-75L'), 0);
});

test('prerequisiti: le ottiche valgono anche per i cannoni lunghi che aprono', () => {
  const base = { involved: false, unlockGain: (t) => (t === 'TECH-ARM-GUN-75L' ? 1 : 0), categoryShare: () => 0.2, rivalsHave: () => false, doctrine: () => 1 };
  const alone = techScore(tech('TECH-ARM-OPTICS'), base);
  const withNext = techScore(tech('TECH-ARM-OPTICS'), { ...base, successorsOf: (id) => techs.technologies.filter((x) => x.prerequisites.includes(id)) });
  assert.ok(Math.abs(withNext - alone - RESEARCH_WEIGHTS.PREREQ * 1) < 1e-9, `${alone} ${withNext}`);
});

test('punteggio: industria in pace, sicurezza con i rivali, minaccia se un rivale ha già la tecnologia, dottrina del ramo', () => {
  const base = { unlockGain: () => 0, categoryShare: () => 0.5, rivalsHave: () => false, doctrine: () => 1 };
  assert.equal(techScore(tech('TECH-IND-SERIES'), { ...base, involved: false }), RESEARCH_WEIGHTS.INDUSTRY_PEACE);
  assert.equal(techScore(tech('TECH-SEC-INTEL'), { ...base, involved: true }), RESEARCH_WEIGHTS.SECURITY_RIVALS);
  assert.ok(Math.abs(techScore(tech('TECH-ARM-RADIO'), { ...base, involved: false }) - 0.05 * 10 * 0.5) < 1e-9);
  assert.ok(Math.abs(techScore(tech('TECH-AMMO-AP'), { ...base, involved: true, rivalsHave: () => true }) - (RESEARCH_WEIGHTS.AP_ROUNDS + RESEARCH_WEIGHTS.THREAT)) < 1e-9);
  assert.ok(Math.abs(techScore(tech('TECH-AMMO-AP'), { ...base, involved: false, doctrine: () => 1.1 }) - RESEARCH_WEIGHTS.AP_ROUNDS * 1.1) < 1e-9);
});

test('pickResearch: il punteggio più alto, a parità l\'ordine alfabetico', () => {
  const list = [{ tech: { id: 'B' } }, { tech: { id: 'A' } }, { tech: { id: 'C' } }];
  assert.equal(pickResearch(list, (t) => ({ A: 1, B: 1, C: 0.5 }[t.id])).tech.id, 'A');
  assert.equal(pickResearch(list, (t) => ({ A: 1, B: 2, C: 0.5 }[t.id])).tech.id, 'B');
  assert.equal(pickResearch([], () => 1), null);
});

test('aiSecurity usa il punteggio quando c\'è; senza, la regola di prima', () => {
  const started = [];
  const research = { listFor: () => [{ status: 'available', cost: { ecv: 1 }, tech: { id: 'TECH-IND-SERIES', branch: 'industry' } }, { status: 'available', cost: { ecv: 1 }, tech: { id: 'TECH-ARM-RADIO', branch: 'armor' } }],
    start: (s, id, t) => { started.push(t); return { state: s }; } };
  const state = { nations: { X: { balance: 1000 } } };
  const ai = (scorer) => createAiSecurity({ research, security: {}, hostilesOf: () => [], researchScorer: scorer, options: { period: 1 } });
  const run = (a) => a.actFor(state, 'X');
  run(ai(null));
  run(ai(() => (t) => (t.id === 'TECH-ARM-RADIO' ? 5 : 1)));
  assert.deepEqual(started, ['TECH-IND-SERIES', 'TECH-ARM-RADIO']);
});

// ordine di ricerca dal 1936 senza date storiche (solo per il rapporto): ogni ricerca dura i suoi giorni
function order(nation, items, n = 10) {
  const done = new Set(techs.initialResearch[nation] ?? []);
  let date = '1936-01-01'; const out = [];
  for (let i = 0; i < n; i++) {
    const list = techs.technologies.filter((t) => !done.has(t.id) && t.prerequisites.every((p) => done.has(p))).map((t) => ({ tech: t }));
    const ctx = ctxFor(nation, done, date, items);
    const pick = pickResearch(list, (t) => techScore(t, ctx));
    if (!pick) break;
    done.add(pick.tech.id); out.push(pick.tech.id.replace('TECH-', ''));
    date = new Date(Date.parse(`${date}T00:00:00Z`) + pick.tech.days * 86400000).toISOString().slice(0, 10);
  }
  return out;
}

test('ordine delle ricerche (stampa per il rapporto): l\'industria resta prima in pace, le armi utili subito dopo', () => {
  const deu = order('DEU', DEU_ITEMS);
  const su = order('USSR', ['equipment.TNK-USSR-T26-1940', 'equipment.TNK-USSR-T34-1940', 'equipment.INW-USSR-RIFLE-1939']);
  const us = order('USA', ['equipment.TNK-USA-LIGHT-TANK-1940', 'equipment.TNK-USA-MEDIUM-TANK-1940', 'equipment.INW-USA-RIFLE-1940']);
  console.log('DEU', deu.join(' → ')); console.log('USSR', su.join(' → ')); console.log('USA', us.join(' → '));
  for (const o of [deu, su, us]) assert.ok(o.length > 3);
});
