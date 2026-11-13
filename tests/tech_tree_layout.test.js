// Albero tecnologico (14/11/2026): disposizione a colonne per profondità, fasce per ramo con avanzamento, collegamenti, evidenza dei collegati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { depths, layoutTree, related, NODE_W, NODE_H, GAP_X } from '../src/ui/techTreeLayout.js';

const file = JSON.parse(readFileSync(new URL('../data/research/technologies.json', import.meta.url), 'utf8'));

test('profondità: senza prerequisiti colonna 0, con prerequisiti uno dopo il più profondo', () => {
  const d = depths([{ id: 'A', prerequisites: [] }, { id: 'B', prerequisites: ['A'] }, { id: 'C', prerequisites: ['B', 'A'] }, { id: 'X', prerequisites: ['NON-ESISTE'] }]);
  assert.deepEqual([d.get('A'), d.get('B'), d.get('C'), d.get('X')], [0, 1, 2, 0]);
});

test('albero reale: una fascia per ramo, ogni tecnologia una casella, nessuna sovrapposizione, collegamenti dai prerequisiti', () => {
  const done = new Set(['TECH-IND-SERIES']);
  const t = layoutTree(file.branches, file.technologies, done);
  assert.equal(t.nodes.size, file.technologies.length);
  assert.deepEqual(t.lanes.map((l) => l.id), file.branches.map((b) => b.id).filter((b) => file.technologies.some((x) => x.branch === b)));
  const ind = t.lanes.find((l) => l.id === 'industry');
  assert.deepEqual([ind.done, ind.total], [1, 2], 'avanzamento del ramo');
  const boxes = [...t.nodes.values()];
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
    const a = boxes[i]; const b = boxes[j];
    assert.ok(a.x + NODE_W <= b.x || b.x + NODE_W <= a.x || a.y + NODE_H <= b.y || b.y + NODE_H <= a.y, 'caselle sovrapposte');
  }
  assert.equal(t.nodes.get('TECH-IND-MASS').x, NODE_W + GAP_X, 'produzione di massa nella seconda colonna');
  const nEdges = file.technologies.reduce((s, x) => s + x.prerequisites.length, 0);
  assert.equal(t.edges.length, nEdges);
  assert.ok(t.edges.every((e) => e.path.startsWith('M')));
  for (const n of boxes) assert.ok(n.x + NODE_W <= t.width && n.y + NODE_H <= t.height, 'dentro la tela');
});

test('collegati: a monte tutti i prerequisiti, a valle tutte le tecnologie che la richiedono', () => {
  const techs = [{ id: 'A', prerequisites: [] }, { id: 'B', prerequisites: ['A'] }, { id: 'C', prerequisites: ['B'] }, { id: 'D', prerequisites: [] }];
  const r = related(techs, 'B');
  assert.deepEqual([[...r.up], [...r.down]], [['A'], ['C']]);
  assert.deepEqual([...related(techs, 'D').up], []);
});

test('righe: una tecnologia sta all\'altezza del suo prerequisito (collegamento diritto), senza sovrapposizioni', () => {
  const t = layoutTree(file.branches, file.technologies);
  assert.equal(t.nodes.get('TECH-INF-SEMI2').y, t.nodes.get('TECH-INF-SEMI1').y);
  const two = layoutTree([{ id: 'b', name_it: 'B' }], [{ id: 'A', branch: 'b', prerequisites: [] }, { id: 'X', branch: 'b', prerequisites: ['A'] }, { id: 'Y', branch: 'b', prerequisites: ['A'] }]);
  assert.equal(two.nodes.get('X').y, two.nodes.get('A').y);
  assert.ok(two.nodes.get('Y').y > two.nodes.get('X').y, 'la seconda scende di una riga');
});
