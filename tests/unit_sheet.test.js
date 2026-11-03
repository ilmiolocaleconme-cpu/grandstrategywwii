// Scheda unità (composizione e dotazione) e collegamento del menu radiale; i segnalini sono visibili in ogni livello.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compositionOf, unitInfo } from '../src/rules/unitInfo.js';
import { LAYERS } from '../src/map/geo.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tplDeu = json('data/units/templates/divisione_fanteria_germania_1936.json');
const tplFra = json('data/units/templates/divisione_fanteria_francia_1936.json');
const unitsFile = json('data/units/units.json').units;

test('composizione: dalla scheda del template, senza valori nulli; basi e supporti organici', () => {
  const u = unitsFile.find((x) => x.nation === 'DEU' && x.category === 'infantry' && x.echelon === 'division');
  const c = compositionOf(u, [tplDeu, tplFra]);
  assert.ok(c);
  assert.equal(c.templateId, tplDeu.id);
  const by = Object.fromEntries(c.rows.map((r) => [r.key, r]));
  assert.equal(by.regimentsInfantry.value, 3); assert.equal(by.battalionsPerRegiment.value, 3); assert.equal(by.regimentsInfantry.label, 'Reggimenti di fanteria');
  assert.ok(c.rows.every((r) => r.value !== null && r.value !== undefined));
  assert.ok(c.support.length > 0);
  const f = unitsFile.find((x) => x.nation === 'FRA' && x.category === 'infantry' && x.echelon === 'division');
  assert.ok(compositionOf(f, [tplDeu, tplFra]).rows.some((r) => r.key === 'reggimentiFanteria' && r.value === 3));
  assert.equal(compositionOf(unitsFile.find((x) => x.nation === 'ITA' && x.echelon === 'division') ?? { nation: 'ITA', category: 'infantry', echelon: 'division' }, [tplDeu, tplFra]), null, 'senza template: nessuna composizione inventata');
});

test('unitInfo: la composizione compare solo per divisioni e brigate', () => {
  const u = unitsFile.find((x) => x.nation === 'DEU' && x.category === 'infantry' && x.echelon === 'division');
  const info = unitInfo({ date: '1936-01-01' }, u, { unitsById: new Map(unitsFile.map((x) => [x.id, x])), officersById: new Map(), initial: new Map(), templates: [tplDeu] });
  assert.equal(info.composition.templateId, tplDeu.id);
  const cmd = unitsFile.find((x) => x.category === 'command');
  assert.equal(unitInfo({ date: '1936-01-01' }, cmd, { unitsById: new Map(unitsFile.map((x) => [x.id, x])), officersById: new Map(), initial: new Map(), templates: [tplDeu] }).composition, null);
});

test('mappa: nessun livello «Esercito»; i segnalini si disegnano e si toccano in ogni livello', () => {
  assert.ok(!LAYERS.some((l) => l.id === 'army'));
  assert.ok(!/layer === 'army'/.test(read('src/map/canvasDraw.js')) && !/layer === 'army'/.test(read('src/map/MapCanvas.jsx')) && !/layer === 'army'/.test(read('src/App.jsx')));
});

test('menu radiale: azioni I, muovi (anche attacco), trincera, supporto (disattivato: nessuna regola); ancora che segue il segnalino', () => {
  const r = read('src/ui/UnitRadial.jsx');
  for (const id of ['move', 'dig', 'sup']) assert.match(r, new RegExp(`id="${id}"`));
  assert.match(r, /id="sup"[^>]*disabled/);
  assert.match(r, /rd-center/); assert.ok(!/id="at"/.test(r), 'attacco unito a Muovi');
  const m = read('src/map/MapCanvas.jsx');
  assert.match(m, /placeRadial\(\)/); assert.match(m, /radial-anchor/);
  const a = read('src/App.jsx');
  assert.match(a, /<UnitRadial /); assert.match(a, /selectedUnits=\{armySel\}/); assert.match(a, /moveMode && game && armySel/);
});

test('Muovi = attacco verso provincia nemica in guerra; marcia verso la propria o verso chi non è in guerra', async () => {
  const { moveIntent } = await import('../src/game/theaterState.js');
  const net = { owner: (p) => ({ A: 'GER', B: 'FRA', C: 'ITA' }[p]) };
  const st = { player: 'GER', control: { GER: 'GER', FRA: 'FRA', ITA: 'ITA' }, war: { schema: 'war-v1', pairs: { 'FRA|GER': { by: 'GER', since: 'd' } } } };
  assert.equal(moveIntent(st, net, 'A').kind, 'move');
  assert.equal(moveIntent(st, net, 'B').kind, 'attack');
  assert.equal(moveIntent(st, net, 'C').kind, 'move', 'ITA non è in guerra: nessun attacco');
  assert.equal(moveIntent({ ...st, war: undefined }, net, 'B').kind, 'move');
  assert.match(read('src/App.jsx'), /moveIntent\(game, moveNet, to\)/);
});
