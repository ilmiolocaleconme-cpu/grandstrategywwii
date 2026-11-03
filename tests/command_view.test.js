// Vista della catena di comando: albero, unità libere, comandi validi per una unità, ricerca; azioni del giocatore sullo stato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOrbatState, attach } from '../src/rules/orbat.js';
import { commandTree, visibleRows, loose, validParents, validChildren, levelLabel } from '../src/ui/commandView.js';
import { playerAttach, playerDetach } from '../src/game/orbatState.js';

const U = (id, name, category, extra = {}) => ({ id, name, nation: 'GER', category, startYear: 1930, endYear: null, ...extra });
const units = [
  U('T', 'Teatro Ovest', 'command', { commandLevel: 'theater', echelon: 'command' }),
  U('AG', 'Gruppo A', 'command', { commandLevel: 'army_group', echelon: 'command' }),
  U('AR', 'Armata 1', 'command', { commandLevel: 'army', echelon: 'command' }),
  U('CO', 'Corpo I', 'command', { commandLevel: 'corps', echelon: 'command' }),
  U('CO2', 'Corpo II', 'command', { commandLevel: 'corps', echelon: 'command' }),
  U('D1', '1a Divisione', 'infantry', { echelon: 'division' }),
  U('D2', '2a Divisione', 'armored', { echelon: 'division' }),
  U('B1', 'Brigata Cav', 'cavalry', { echelon: 'brigade' }),
  U('X1', 'Divisione francese', 'infantry', { echelon: 'division', nation: 'FRA' }),
  U('HC', 'Alto Comando', 'command', { commandLevel: 'high_command', echelon: 'command' }),
];
const date = '1936-01-01';
const base = () => createOrbatState();
const link = (o, c, p) => attach(o, { childId: c, parentId: p, units, date }).state;

test('da assegnare: solo divisioni/brigate/supporti della nazione senza comando; alto comando e altre nazioni esclusi', () => {
  assert.deepEqual(loose(base(), units, 'GER', date).map((u) => u.id), ['B1', 'D1', 'D2'].sort((a, b) => units.find((u) => u.id === a).name.localeCompare(units.find((u) => u.id === b).name, 'it')));
  assert.deepEqual(loose(link(base(), 'D1', 'CO'), units, 'GER', date).map((u) => u.id).includes('D1'), false);
  assert.deepEqual(loose(base(), units, 'GER', date, 'brig').map((u) => u.id), ['B1']);
});

test('albero: radici = comandi senza padre, figli annidati, conteggio divisioni a ogni livello', () => {
  let o = base();
  o = link(o, 'AG', 'T'); o = link(o, 'AR', 'AG'); o = link(o, 'CO', 'AR'); o = link(o, 'D1', 'CO'); o = link(o, 'D2', 'AR');
  const roots = commandTree(o, units, 'GER', date);
  assert.deepEqual(roots.map((r) => r.id), ['T', 'CO2'], 'teatro in alto, corpo libero come radice');
  const t = roots[0];
  assert.equal(t.divisions, 2);
  assert.equal(t.children[0].children[0].children.map((c) => c.id).join(), 'CO,D2', 'comando prima, poi divisione');
  assert.equal(levelLabel(units.find((u) => u.id === 'B1')), 'Brigata');
});

test('righe visibili: chiuso/aperto e ricerca che apre il ramo', () => {
  let o = link(link(base(), 'CO', 'AR'), 'D1', 'CO');
  const roots = commandTree(o, units, 'GER', date);
  assert.deepEqual(visibleRows(roots, new Set()).map((r) => r.node.id), ['T', 'AG', 'AR', 'CO2']);
  assert.deepEqual(visibleRows(roots, new Set(['AR', 'CO'])).map((r) => [r.node.id, r.depth]), [['T', 0], ['AG', 0], ['AR', 0], ['CO', 1], ['D1', 2], ['CO2', 0]]);
  assert.deepEqual(visibleRows(roots, new Set(), '1a div').map((r) => r.node.id), ['AR', 'CO', 'D1']);
});

test('comandi validi per una divisione: tutti i livelli superiori, mai il padre attuale; per un corpo solo armata e oltre', () => {
  const g = validParents(base(), 'D1', units, 'GER', date);
  assert.deepEqual(g.map((x) => x.level), ['theater', 'army_group', 'army', 'corps']);
  assert.deepEqual(validParents(link(base(), 'D1', 'CO'), 'D1', units, 'GER', date).flatMap((x) => x.items.map((i) => i.id)).includes('CO'), false);
  assert.deepEqual(validParents(base(), 'CO', units, 'GER', date).map((x) => x.level), ['theater', 'army_group', 'army']);
  assert.deepEqual(validParents(base(), 'T', units, 'GER', date), [], 'il teatro non ha comando superiore');
  assert.deepEqual(validParents(base(), 'X1', units, 'GER', date), [], 'unità di altra nazione: nessuna scelta');
});

test('unità aggiungibili a un comando: libere e di livello inferiore (corpo → solo divisioni)', () => {
  const g = validChildren(base(), 'CO', units, 'GER', date);
  assert.deepEqual(g.flatMap((x) => x.items.map((i) => i.id)).sort(), ['B1', 'D1', 'D2']);
  const a = validChildren(base(), 'AR', units, 'GER', date);
  assert.deepEqual(a.map((x) => x.label), ['Corpo d’armata', 'Divisione', 'Brigata']);
  assert.ok(a.some((x) => x.label === 'Corpo d’armata'));
});

test('azioni del giocatore: inquadra, sposta, scollega; blocca unità altrui e cicli', () => {
  const s0 = { player: 'GER', date, orbat: base() };
  const s1 = playerAttach(s0, { unitId: 'D1', parentId: 'CO', units }).state;
  assert.equal(s1.orbat.links.D1.parent, 'CO');
  const s2 = playerAttach(s1, { unitId: 'D1', parentId: 'AR', units }).state;
  assert.equal(s2.orbat.links.D1.parent, 'AR', 'spostata');
  assert.throws(() => playerAttach(s0, { unitId: 'X1', parentId: 'CO', units }), /FRA/);
  const chain = { ...s0, orbat: link(link(base(), 'CO', 'AR'), 'AR', 'AG') };
  assert.throws(() => playerAttach(chain, { unitId: 'AG', parentId: 'CO', units }), /livello|ciclo/, 'un comando superiore non può dipendere da uno inferiore');
  assert.equal(playerDetach(s2, 'D1', { units }).state.orbat.links.D1, undefined);
});

test('App: il pannello Comando riceve incarico e trinceramento per le divisioni agli ordini del comando', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /fightersOf=\{/); assert.match(app, /onAssign=\{\(id\) => \{ const ids = divisionsUnder/); assert.match(app, /onEntrench=\{\(id, on\)/);
});
