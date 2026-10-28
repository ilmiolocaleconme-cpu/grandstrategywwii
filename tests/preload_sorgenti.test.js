import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// Controllo sul testo dei sorgenti (non su un browser): i dati della mappa si caricano una volta sola, all'apertura,
// dall'App. Un caricamento dentro MapCanvas dopo il montaggio fa ridisegnare la mappa (sfarfallio visto su telefono).
test('MapCanvas non scarica dati da sé: tutto arriva dall\'App', () => {
  const src = read('src/map/MapCanvas.jsx');
  assert.ok(!/\bimport\(/.test(src), 'import() dinamico dentro MapCanvas');
});

test('l\'App precarica la terra di base e la conta tra i dati da attendere prima della mappa', () => {
  const src = read('src/App.jsx');
  assert.match(src, /land_base\.json/);
  assert.match(src, /label: 'Terra di base', done: land !== null/);
  assert.match(src, /labelData !== null && land !== null && layerReady/);
  assert.match(src, /<MapScreen land=\{land\}/);
});
