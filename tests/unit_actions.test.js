// Pulsanti «i» e catena (Inquadra) sul segnalino e nell'elenco unità (decisioni dell'utente 10–11/11/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chainAction, sheetTarget, panelHint } from '../src/ui/unitActions.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('catena sul segnalino: attiva solo con una unità della propria nazione', () => {
  assert.deepEqual(chainAction({ ids: ['D1'], own: true }), { enabled: true, unitId: 'D1', reason: null });
  const many = chainAction({ ids: ['D1', 'D2'], own: true });
  assert.equal(many.enabled, false); assert.match(many.reason, /una unità alla volta/);
  assert.equal(chainAction({ ids: [], own: true }).enabled, false);
  const foreign = chainAction({ ids: ['D1'], own: false });
  assert.equal(foreign.enabled, false); assert.match(foreign.reason, /altra nazione/);
});

test('scheda: chiusa, unità del segnalino, oppure una unità con «Inquadra in…» già aperto', () => {
  assert.equal(sheetTarget(false, ['D1']), null);
  assert.deepEqual(sheetTarget(true, ['D1', 'D2']), { ids: ['D1', 'D2'], attach: false });
  assert.deepEqual(sheetTarget({ unitId: 'D2', attach: true }, ['D1', 'D2']), { ids: ['D2'], attach: true });
  assert.deepEqual(sheetTarget({ unitId: 'D2' }, ['D1']), { ids: ['D2'], attach: false });
});

test('elenco unità: niente testo iniziale; restano gli avvisi utili', () => {
  assert.equal(panelHint({ canMove: true, moveMode: false, n: 0, orderCount: 0 }), null);
  assert.match(panelHint({ canMove: false, moveMode: false, n: 0, orderCount: 0 }), /altra nazione/);
  assert.match(panelHint({ canMove: true, moveMode: true, n: 2, orderCount: 2 }), /destinazione/);
  assert.match(panelHint({ canMove: true, moveMode: false, n: 2, orderCount: 5 }), /2 unità scelte \(5 con le forze agli ordini\)/);
});

test('icone in SVG (non emoji): i, catena unita = Inquadra, catena spezzata = Scollega', () => {
  const icons = read('src/ui/ActionIcons.jsx');
  for (const n of ['InfoIcon', 'LinkIcon', 'UnlinkIcon', 'SupportIcon']) assert.match(icons, new RegExp(`export function ${n}`));
  const sheet = read('src/ui/UnitSheet.jsx');
  assert.match(sheet, /<LinkIcon \/><\/span><span>Inquadra/); assert.match(sheet, /<UnlinkIcon \/><\/span><span>Scollega/);
  assert.ok(!/[＋⛓]/.test(sheet), 'niente emoji per Inquadra e Scollega');
  const panel = read('src/ui/ArmyPanel.jsx');
  assert.match(panel, /ap-acts/); assert.match(panel, /<InfoIcon \/>/); assert.match(panel, /onAttachUnit\(u\.id\)/);
  assert.ok(!/className="ap-i"/.test(panel));
  const app = read('src/App.jsx');
  assert.match(app, /openAttach=\{sheet\.attach\}/); assert.match(app, /onAttachUnit=/);
});
