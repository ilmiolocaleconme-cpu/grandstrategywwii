// Diplomazia minima (30/10/2026): rapporti, alleanze, accesso, guerra con costi, consenso al commercio, deriva giornaliera, validazione, salvataggio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, validateState } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createDiplomacyGame } from '../src/game/diplomacyState.js';
import { openTradeContract } from '../src/game/tradeState.js';
import { canEnterFor } from '../src/game/movementState.js';
import { canEnterWar } from '../src/game/warCommon.js';
import { atWar } from '../src/rules/war.js';
import { relationOf, areAllied, hasAccess, validateDiplomacy, validateDiplomacyConfig, validateDiplomacyStart } from '../src/rules/diplomacy.js';
import { createTradeSystem } from '../src/game/tradeState.js';
import { relationLabel, describeDiplomacyFailure, notableRows, pairView } from '../src/ui/diplomacyView.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const config = json('diplomacy/diplomacy.json'); const startDoc = json('diplomacy/relations_1936.json');
const political = json('political_1936.json'); const nationIds = json('nations.json').map((n) => n.id);
const economy = json('economy/economy.json'); const population = json('population/population.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const resources = json('resources.json');
const dip = createDiplomacyGame({ config, start: startDoc });
const game = (nation = 'ITA') => dip.init(newGame({ nation, political, ownersWithProvinces: nationIds, start }).state);
const rich = (s, id, balance = 1000) => ({ ...s, nations: { ...s.nations, [id]: { ...s.nations[id], balance } } });
const withRel = (s, a, b, v) => ({ ...s, diplomacy: { ...s.diplomacy, relations: { ...s.diplomacy.relations, [a < b ? `${a}|${b}` : `${b}|${a}`]: v } } });

test('dati: configurazione e situazione 1936 valide, alleanze richieste, il resto neutro', () => {
  assert.deepEqual(validateDiplomacyConfig(config), []); assert.deepEqual(validateDiplomacyStart(startDoc, nationIds), []);
  const g = game();
  for (const [a, b] of [['FRA', 'GBR'], ['FRA', 'POL'], ['FRA', 'CZE'], ['GBR', 'PRT']]) assert.ok(areAllied(g.diplomacy, a, b), `${a}-${b}`);
  assert.ok(!areAllied(g.diplomacy, 'DEU', 'ITA')); assert.equal(relationOf(g.diplomacy, 'ITA', 'USA'), 0);
  assert.deepEqual(validateState(g), []);
  assert.ok(validateDiplomacyConfig({ ...config, sabotage: { maxRelation: 0 } }).length > 0, 'soglia di sabotaggio sopra quella del commercio rifiutata');
});

test('migliorare i rapporti costa ECV, sale di +gain, ha un tetto e non si fa in guerra', () => {
  let s = rich(game(), 'ITA', 100);
  const r = dip.improveRelations(s, 'ITA', 'USA');
  assert.ok(r.ok); assert.equal(relationOf(r.state.diplomacy, 'ITA', 'USA'), config.improve.gain); assert.equal(r.state.nations.ITA.balance, 100 - config.improve.ecv);
  assert.equal(dip.improveRelations(rich(s, 'ITA', 5), 'ITA', 'USA').reason, 'missing');
  assert.equal(dip.improveRelations(withRel(s, 'ITA', 'USA', 95), 'ITA', 'USA').reason, 'already_max');
  const war = dip.declareWar(s, 'ITA', 'ETH').state;
  assert.equal(dip.improveRelations(war, 'ITA', 'ETH').reason, 'at_war');
});

test('alleanza: serve rapporto >= soglia E un nemico comune; costa ECV; rottura -30 e accesso revocato', () => {
  let s = rich(game('FRA'), 'FRA');
  assert.equal(dip.proposeAlliance(s, 'FRA', 'USSR').reason, 'relation_low');
  const warm = withRel(s, 'FRA', 'USSR', 50);
  assert.equal(dip.proposeAlliance(warm, 'FRA', 'USSR').ok, true, 'nemico comune: la Germania (-40 con la Francia e -50 con l\'URSS)');
  assert.equal(dip.proposeAlliance(warm, 'FRA', 'USSR').enemy, 'DEU');
  assert.equal(dip.proposeAlliance(withRel(s, 'FRA', 'NOR', 50), 'FRA', 'NOR').reason, 'no_common_enemy', 'la Norvegia non ha ostili');
  const ok = dip.proposeAlliance(warm, 'FRA', 'USSR').state;
  assert.equal(ok.nations.FRA.balance, 1000 - config.alliance.ecv);
  assert.equal(dip.proposeAlliance(ok, 'FRA', 'USSR').reason, 'already_allied');
  assert.equal(dip.proposeAlliance(rich(warm, 'FRA', 1), 'FRA', 'USSR').reason, 'missing');
  const broken = dip.breakAlliance(ok, 'FRA', 'USSR').state;
  assert.ok(!areAllied(broken.diplomacy, 'FRA', 'USSR')); assert.equal(relationOf(broken.diplomacy, 'FRA', 'USSR'), 50 + config.alliance.breakPenalty);
  assert.equal(dip.breakAlliance(broken, 'FRA', 'USSR').reason, 'not_allied');
});

test('guerra: costi diplomatici sulla vittima e sui suoi alleati; non si attacca un alleato; pace solo se non disperata', () => {
  const s = game('DEU');
  assert.equal(dip.declareWar(s, 'DEU', 'ITA').ok, true);
  const w = dip.declareWar(s, 'DEU', 'POL').state; // la Polonia è alleata della Francia
  assert.ok(atWar(w.war, 'DEU', 'POL'));
  assert.equal(relationOf(w.diplomacy, 'DEU', 'POL'), config.war.victimPenalty);
  assert.equal(relationOf(w.diplomacy, 'DEU', 'FRA'), -40 + config.war.victimAlliesPenalty, 'alleata della vittima');
  assert.equal(relationOf(w.diplomacy, 'DEU', 'GBR'), 0, 'alleata della Francia ma non della Polonia: nessun costo');
  assert.equal(dip.declareWar(w, 'DEU', 'POL').reason, 'already_at_war');
  const fr = game('FRA'); assert.equal(dip.declareWar(fr, 'FRA', 'GBR').reason, 'allied');
  const peace = dip.makePeace(w, 'DEU', 'POL');
  assert.equal(peace.ok, true); assert.ok(!atWar(peace.state.war, 'DEU', 'POL')); assert.equal(relationOf(peace.state.diplomacy, 'DEU', 'POL'), config.war.afterPeaceRelation);
  const hopeless = withRel(w, 'DEU', 'POL', -95);
  assert.equal(dip.makePeace(hopeless, 'DEU', 'POL').reason, 'hopeless');
  assert.equal(dip.makePeace(s, 'DEU', 'POL').reason, 'not_at_war');
});

test('in guerra il rapporto scende ogni giorno fino a -100', () => {
  let s = dip.declareWar(game('DEU'), 'DEU', 'POL').state;
  const before = relationOf(s.diplomacy, 'DEU', 'POL');
  s = dip.diplomacyDay(s);
  assert.equal(relationOf(s.diplomacy, 'DEU', 'POL'), before + config.war.dailyDrift);
  for (let i = 0; i < 300; i += 1) s = dip.diplomacyDay(s);
  assert.equal(relationOf(s.diplomacy, 'DEU', 'POL'), -100);
});

test('commercio: rifiutato in guerra o sotto soglia, accettato sopra; la guerra annulla i contratti aperti', () => {
  const g = rich(game('ITA'), 'ITA');
  const order = { seller: 'ITA', buyer: 'FRA', good: 'wheat', perDay: 1, days: 5, mode: 'sea' };
  const ctx = { economy, resources, net: null, sea: null, consent: dip.tradeConsent };
  assert.equal(dip.tradeConsent(g, 'ITA', 'FRA').ok, true);
  assert.equal(dip.tradeConsent(withRel(g, 'ITA', 'FRA', -21), 'ITA', 'FRA').reason, 'hostile');
  assert.equal(dip.tradeConsent(withRel(g, 'ITA', 'FRA', -20), 'ITA', 'FRA').ok, true, 'esattamente la soglia: consentito');
  assert.equal(dip.tradeConsent(dip.declareWar(g, 'ITA', 'FRA').state, 'ITA', 'FRA').reason, 'at_war');
  const hostile = openTradeContract(withRel(g, 'ITA', 'FRA', -50), order, ctx);
  assert.equal(hostile.ok, false); assert.equal(hostile.reason, 'hostile');
  assert.equal(openTradeContract(dip.declareWar(g, 'ITA', 'FRA').state, order, ctx).reason, 'at_war');
  // senza consenso nel contesto (vecchio comportamento) il rifiuto della diplomazia non scatta: la ragione, se c'è, è un'altra (nessun mare caricato)
  assert.notEqual(openTradeContract(withRel(g, 'ITA', 'FRA', -50), order, { ...ctx, consent: undefined }).reason, 'hostile');
});

test('contratti già aperti: il commercio regolare migliora il rapporto fino al tetto; guerra o rapporto ostile li annullano', () => {
  const contract = (status) => ({ id: 'T1', seller: 'ITA', buyer: 'FRA', good: 'wheat', perDay: 1, status, startDay: 1, endDay: 999 });
  const base = { ...rich(game('ITA'), 'ITA'), trade: { ...game().trade, contracts: [contract('active')] } };
  let s = dip.diplomacyDay(base);
  assert.equal(relationOf(s.diplomacy, 'ITA', 'FRA'), config.trade.dailyGain);
  for (let i = 0; i < 2000; i += 1) s = dip.diplomacyDay(s);
  assert.equal(relationOf(s.diplomacy, 'ITA', 'FRA'), config.trade.gainCap, 'tetto del guadagno da commercio');
  const hostile = dip.diplomacyDay(withRel(base, 'ITA', 'FRA', -30));
  assert.equal(hostile.trade.contracts[0].status, 'cancelled');
  const war = dip.declareWar(base, 'ITA', 'FRA').state;
  assert.equal(war.trade.contracts[0].status, 'cancelled');
});

test('accesso ai territori: alleati e accordi sì, altri no; la guerra e la rottura lo tolgono', () => {
  const g = game('FRA');
  const net = { has: () => true, owner: (m) => (m === 'P_GBR' ? 'GBR' : m === 'P_DEU' ? 'DEU' : 'FRA') };
  const fr = canEnterFor(g, net, 'FRA');
  assert.equal(fr('P_GBR'), true, 'alleata'); assert.equal(fr('P_DEU'), false, 'altra nazione senza accordo');
  assert.equal(canEnterWar(g, net, 'FRA')('P_GBR'), true);
  const asked = dip.requestAccess(rich(withRel(g, 'FRA', 'DEU', 25), 'FRA'), 'FRA', 'DEU');
  assert.equal(asked.ok, true); assert.equal(canEnterFor(asked.state, net, 'FRA')('P_DEU'), true);
  assert.equal(canEnterFor(asked.state, net, 'DEU')('P_GBR'), false, 'a senso unico');
  assert.equal(dip.requestAccess(rich(g, 'FRA'), 'FRA', 'DEU').reason, 'relation_low');
  assert.equal(dip.requestAccess(asked.state, 'FRA', 'DEU').reason, 'already_has');
  const revoked = dip.revokeAccessTo(asked.state, 'DEU', 'FRA').state;
  assert.equal(canEnterFor(revoked, net, 'FRA')('P_DEU'), false);
  const war = dip.declareWar(asked.state, 'FRA', 'DEU').state;
  assert.ok(!hasAccess(war.diplomacy, 'FRA', 'DEU')); assert.equal(canEnterFor(war, net, 'FRA')('P_DEU'), true, 'in guerra si entra comunque da nemico');
  const out = dip.breakAlliance(g, 'FRA', 'GBR').state;
  assert.equal(canEnterFor(out, net, 'FRA')('P_GBR'), false, 'rotta l\'alleanza, niente accesso');
  assert.equal(canEnterFor({ ...g, diplomacy: undefined }, net, 'FRA')('P_GBR'), false, 'stato senza diplomazia: come prima');
});

test('salvataggio e validazione: la forma si controlla, un documento rotto è segnalato', () => {
  const g = game('DEU'); const s = dip.declareWar(g, 'DEU', 'POL').state;
  assert.deepEqual(validateState(s), []);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), []);
  assert.ok(validateDiplomacy({ ...s.diplomacy, relations: { 'B|A': 5 } }).length > 0);
  assert.ok(validateDiplomacy({ ...s.diplomacy, relations: { 'A|B': 500 } }).length > 0);
  assert.ok(validateDiplomacy({ ...s.diplomacy, access: { 'A>A': { since: 'x' } } }).length > 0);
  assert.ok(validateDiplomacy({ schema: 'x' }).length > 0);
  assert.deepEqual(validateDiplomacy(undefined), []);
});

test('il sistema giornaliero gira nel motore e lo stato resta valido', () => {
  let s = dip.declareWar(game('DEU'), 'DEU', 'POL').state;
  for (let i = 0; i < 30; i += 1) s = advanceDay(s, [dip.diplomacyDay]);
  assert.ok(relationOf(s.diplomacy, 'DEU', 'POL') < config.war.victimPenalty);
  assert.deepEqual(validateState(s), []);
});

test('interfaccia: etichette allineate alle soglie, messaggi in italiano, righe notevoli', () => {
  assert.equal(relationLabel(-40, config), 'Ostile'); assert.equal(relationLabel(-21, config), 'Teso'); assert.equal(relationLabel(0, config), 'Neutrale');
  assert.equal(relationLabel(20, config), 'Buono'); assert.equal(relationLabel(40, config), 'Ottimo');
  assert.match(describeDiplomacyFailure('relation_low', { relation: 12, min: 40 }), /12.*40/);
  assert.match(describeDiplomacyFailure('missing', { missing: [{ need: 50, have: 3 }] }), /50/);
  const g = game('FRA'); const name = (id) => id;
  const rows = notableRows(g, 'FRA', config, name);
  assert.deepEqual(rows.map((r) => r.id), ['CZE', 'DEU', 'GBR', 'POL']);
  assert.equal(rows.find((r) => r.id === 'GBR').allied, true);
  assert.equal(pairView(g, 'FRA', 'DEU', config, name).canTrade, false, 'DEU-FRA è -40: commercio bloccato');
});
