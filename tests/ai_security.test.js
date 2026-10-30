// IA di ricerca, difesa e sabotaggio (29/10/2026). Rivali provvisori (hypothesis).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createResearch, researchOf } from '../src/game/research.js';
import { createSecurity } from '../src/game/security.js';
import { securityOf } from '../src/game/securityState.js';
import { createAiSecurity } from '../src/game/aiSecurity.js';
import { createDiplomacyGame } from '../src/game/diplomacyState.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = json('security/security.json'); const technologies = json('research/technologies.json');
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const population = json('population/population.json'); const economy = json('economy/economy.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const research = createResearch({ technologies, economy });
const security = createSecurity({ security: cfg, economy, political });
const dip = createDiplomacyGame({ config: json('diplomacy/diplomacy.json'), start: json('diplomacy/relations_1936.json') });
const ai = createAiSecurity({ research, security, hostilesOf: dip.hostilesOf });
const SYSTEMS = [research.researchDay, security.securityDay, ai.aiDay];
const withNation = (s, id, patch) => ({ ...s, nations: { ...s.nations, [id]: { ...s.nations[id], ...patch } } });
const game = () => dip.init(withNation(withNation(withNation(newGame({ nation: 'ITA', political, ownersWithProvinces: nationIds, start }).state, 'DEU', { balance: 500 }), 'POL', { balance: 500 }), 'FRA', { balance: 500 }));
const run = (s, n) => { let x = s; for (let i = 0; i < n; i += 1) x = advanceDay(x, SYSTEMS); return x; };

test('ostili dalla diplomazia: rapporto <= -40 o guerra, simmetrico; neutrali e alleati esclusi', () => {
  const g = game();
  assert.deepEqual(dip.hostilesOf(g, 'DEU'), ['FRA', 'USSR']); assert.deepEqual(dip.hostilesOf(g, 'FRA'), ['DEU']); assert.deepEqual(dip.hostilesOf(g, 'ITA'), []);
  assert.deepEqual(dip.hostilesOf(g, 'GBR'), [], 'alleata della Francia, nessun rapporto ostile');
  const war = dip.declareWar(g, 'ITA', 'POL').state; // la guerra rende ostili anche senza passare dalla soglia
  assert.deepEqual(dip.hostilesOf(war, 'POL'), ['ITA']);
});

test('una nazione senza rivali ricerca l\'industria e non spende in spie né polizia', () => {
  const s = run(game(), 120);
  assert.ok(researchOf(s.nations.POL).done.includes('TECH-IND-SERIES'));
  assert.deepEqual(securityOf(s.nations.POL).queue, []); assert.equal(securityOf(s.nations.POL).agents.spy, 0);
  assert.deepEqual(validateState(s), []);
});

test('la Germania IA (rivali Francia e URSS): ricerca la sicurezza, mette polizia militare, schiera spie e sabota; mai sotto la riserva', () => {
  let s = game(); let minBalance = Infinity;
  for (let i = 0; i < 500; i += 1) { s = advanceDay(s, SYSTEMS); minBalance = Math.min(minBalance, s.nations.DEU.balance); }
  const de = s.nations.DEU;
  assert.ok(researchOf(de).done.includes('TECH-SEC-INTEL'));
  assert.ok(Object.keys(securityOf(de).mp).length > 0, 'polizia militare assegnata');
  assert.ok(Object.keys(securityOf(de).deployed).length > 0 || securityOf(de).log.some((l) => l.kind === 'spy_caught'), 'spie schierate');
  const ops = securityOf(de).log.filter((l) => l.kind === 'sabotage');
  assert.ok(ops.length > 0, 'almeno un sabotaggio condotto');
  assert.ok(minBalance >= 150 - 1e-6, `cassa minima ${minBalance}`); // l'IA non spende mai sotto la riserva
  assert.ok(ops.every((l) => ['FRA', 'USSR'].includes(l.targetNation)), 'solo contro gli ostili');
  assert.ok(securityOf(s.nations.FRA).incidents.length + securityOf(s.nations.USSR).incidents.length > 0, 'i bersagli registrano incidenti');
  assert.deepEqual(validateState(s), []);
});

test('l\'IA non comanda il giocatore e non lo colpisce se non è un rivale; stesso stato stesso esito', () => {
  const a = run(game(), 200); const b = run(game(), 200);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.nations.ITA.research, undefined); assert.equal(a.nations.ITA.security, undefined);
  assert.ok(a.nations.ITA.facilities.every((f) => (f.damage ?? 0) === 0));
});

test('se il giocatore è ostile (rapporto <= -40) l\'IA lo sabota; se è neutrale no', () => {
  const g = dip.init(newGame({ nation: 'FRA', political, ownersWithProvinces: nationIds, start }).state);
  const s = run(withNation(g, 'DEU', { balance: 500 }), 600);
  const log = securityOf(s.nations.DEU).log;
  assert.ok(log.some((l) => l.targetNation === 'FRA'), 'azioni contro il giocatore ostile');
  assert.ok(log.some((l) => l.kind === 'sabotage' && l.targetNation === 'FRA'), 'sabotaggi riusciti o tentati sul giocatore');
  assert.ok(s.nations.DEU.balance >= 150 - 1e-6, 'riserva rispettata'); // con fondi limitati l\'IA concentra le risorse sul primo ostile (ordine alfabetico): limite noto
  const calm = { ...g, diplomacy: { ...g.diplomacy, relations: { ...g.diplomacy.relations, 'DEU|FRA': -10 } } };
  const t = run(withNation(calm, 'DEU', { balance: 500 }), 600);
  assert.ok(!securityOf(t.nations.DEU).log.some((l) => l.targetNation === 'FRA'), 'rapporto sopra la soglia: nessuna azione');
  assert.ok(t.nations.FRA.facilities.every((f) => (f.damage ?? 0) === 0));
});
