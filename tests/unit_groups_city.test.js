// Bug segnalato dall'utente (11/11/2026): una divisione spostata a Bonn non si poteva più toccare.
// Il segnalino porta la provincia madre (Köln-Aachen), ma le unità stanno nella zona di città (P_DEU_BONN_CITTA_P1):
// la ricerca della madre ignorava le città, che stanno in un file a parte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupAt, motherIndex } from '../src/rules/unitGroups.js';

const cities = JSON.parse(readFileSync(new URL('../data/citta_grandi.json', import.meta.url), 'utf8')).features;
const provinceFeatures = [{ properties: { id: 'P_DEU_KOELN_AACHEN' } }];

test('le zone di città appartengono alla provincia madre', () => {
  const motherOf = motherIndex(provinceFeatures, cities);
  assert.equal(motherOf('P_DEU_BONN_CITTA_P1'), 'P_DEU_KOELN_AACHEN');
  assert.equal(motherOf('P_DEU_BONN_CITTA_P2'), 'P_DEU_KOELN_AACHEN');
  assert.equal(motherOf('P_DEU_KOELN_AACHEN'), 'P_DEU_KOELN_AACHEN');
  assert.equal(motherOf('NON_ESISTE'), undefined);
});

test('toccando il segnalino di Köln-Aachen si trovano anche le unità ferme a Bonn', () => {
  const provinceUnits = {
    P_DEU_BONN_CITTA_P1: [{ nation: 'DEU', units: [{ id: 'D6' }], divisions: 1, commands: 0 }],
    P_DEU_KOELN_AACHEN: [{ nation: 'DEU', units: [{ id: 'D16' }, { id: 'D26' }], divisions: 2, commands: 0 }],
  };
  const g = groupAt(provinceUnits, motherIndex(provinceFeatures, cities), 'P_DEU_KOELN_AACHEN', 'DEU');
  assert.deepEqual(g.units.map((u) => u.id).sort(), ['D16', 'D26', 'D6']);
  assert.equal(g.divisions, 3);
  const prima = groupAt({ P_DEU_BONN_CITTA_P1: provinceUnits.P_DEU_BONN_CITTA_P1 }, motherIndex(provinceFeatures, null), 'P_DEU_KOELN_AACHEN', 'DEU');
  assert.equal(prima, null, 'senza le città la divisione a Bonn non si trova (il difetto)');
});
