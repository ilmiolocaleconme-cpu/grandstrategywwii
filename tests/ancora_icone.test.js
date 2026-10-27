// Le icone delle risorse stanno sulla terra della provincia, anche per quelle con parti lontane (Pelagie, Pantelleria, arcipelaghi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCanvasModel, anchorOf, pointInItem } from '../src/map/canvasModel.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const model = buildCanvasModel(await loadProvinces());

test('ancora delle icone: sempre dentro la provincia (tutte)', () => {
  const fuori = [];
  for (const it of model.items) {
    const a = anchorOf(model, it);
    if (!pointInItem(model, it, a.x, a.y)) fuori.push(it.id);
  }
  assert.deepEqual(fuori, []);
});

test('ancora delle icone: Agrigento e Trapani (isole lontane) non cadono nel Canale di Sicilia', () => {
  for (const id of ['P_ITA_AGRIGENTO', 'P_ITA_TRAPANI']) {
    const it = model.byId.get(id);
    const a = anchorOf(model, it);
    assert.ok(pointInItem(model, it, a.x, a.y), id);
  }
});
