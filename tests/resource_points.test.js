// Modello a punti delle risorse: punteggi 1-10 → pesi → tiratura. Controlla anche che i file su disco siano quelli ricevuti/generati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from '../src/data/csv.js';
import { startYear, placeKey, weightOf, allocate, buildCenters, buildResourcePoints, balanceOf, validateScores } from '../src/data/resourcePoints.js';
import { resourcePointsInputs, resourcePointsFile, resourcePointsTable } from '../scripts/build-resource-points.js';

const url = (p) => new URL(`../data/${p}`, import.meta.url);
const text = (p) => readFileSync(url(p), 'utf8');
const loc = (id, res, country, place, period, extra = {}) => ({ location_id: id, resource_id: res, country_text: country, control_text: country, place_text: place, period, kind: 'deposit', ...extra });
const sc = (id, fin, extra = {}) => ({ location_id: id, score_user: String(fin), score_final: String(fin), model_use: 'yes', source: 'user_csv', note: '', ...extra });

test('anno di partenza e chiave del luogo', () => {
  assert.equal(startYear('1938'), 1938);
  assert.equal(startYear('1938/39'), 1938);
  assert.equal(startYear('1934-38 media'), 1934);
  assert.equal(startYear('1935-45'), 1935);
  assert.equal(startYear(''), null);
  assert.equal(placeKey('Ploiesti, Moreni, Boldesti'), placeKey('Ploiesti e altri campi'));
  assert.equal(placeKey('Żagań'), 'zagan');
  assert.notEqual(placeKey('Donbass'), placeKey('Kuzbass'));
});

test('peso: ogni punto moltiplica per step; step 1 = tutti uguali', () => {
  assert.equal(weightOf(1, 1.7), 1);
  assert.ok(Math.abs(weightOf(3, 2) - 4) < 1e-9);
  assert.equal(weightOf(10, 1), 1);
});

test('centri: righe dello stesso luogo in anni diversi sono un centro, base più antica, picco massimo; esclusi i model_use no', () => {
  const locations = [
    loc('A', 'coal', 'URSS', 'Kuzbass', '1945'), loc('B', 'coal', 'URSS', 'Kuzbass', '1938'), loc('C', 'coal', 'URSS', 'Donbass', '1938'),
    loc('D', 'coal', 'URSS', 'Agg', '1938', { kind: 'aggregate' }), loc('E', 'coal', 'Italia', 'Sulcis', '1943'), loc('F', 'coal', 'Italia', 'Dup', '1938'),
  ];
  const scores = [sc('A', 8), sc('B', 6), sc('C', 9), sc('D', 10), sc('E', 2), sc('F', 5, { model_use: 'no', note: 'duplicato' })];
  const links = [{ location_id: 'A', province_id: 'P2' }, { location_id: 'B', province_id: 'P1' }, { location_id: 'B', province_id: 'P2' }];
  const centers = buildCenters(locations, links, scores);
  assert.deepEqual(centers.map((c) => c.key), ['coal|Italia|sulcis', 'coal|URSS|donbass', 'coal|URSS|kuzbass']);
  const kuz = centers.find((c) => c.key.endsWith('kuzbass'));
  assert.equal(kuz.base.score, 6); assert.equal(kuz.base.period, '1938');
  assert.equal(kuz.peak.score, 8); assert.deepEqual(kuz.provinces, ['P1', 'P2']);
  assert.equal(centers.find((c) => c.key.endsWith('sulcis')).baseAfter1938, true);
  const out = allocate(centers, { step: 2, budget: 100 });
  assert.ok(Math.abs(out.reduce((a, c) => a + c.points, 0) - 100) < 0.01);
  assert.equal(out.find((c) => c.key.endsWith('kuzbass')).peakFactor, 4);
});

test('indici di concentrazione', () => {
  assert.deepEqual(balanceOf({ A: 50, B: 50 }), { topControl: 'A', topControlShare: 0.5, effectiveProducers: 2, controls: 2 });
  assert.equal(balanceOf({ A: 100 }).effectiveProducers, 1);
});

test('punteggi: validazione di errori tipici', () => {
  const locations = [loc('A', 'coal', 'X', 'p', '1938'), loc('B', 'coal', 'X', 'q', '1938')];
  assert.deepEqual(validateScores([sc('A', 5), sc('B', 5)], locations), []);
  const bad = validateScores([sc('A', 11), sc('A', 5, { score_user: '3' }), sc('Z', 5)], locations);
  assert.ok(bad.some((e) => /punteggio finale/.test(e)));
  assert.ok(bad.some((e) => /duplicato/.test(e)));
  assert.ok(bad.some((e) => /non è un luogo/.test(e)));
  assert.ok(bad.some((e) => /manca B/.test(e)));
  assert.ok(bad.some((e) => /senza motivo/.test(e)), 'una correzione senza motivo deve essere rifiutata');
});

test('dati reali: CSV ricevuto non alterato, punteggi dell\'utente intatti, nessun errore', async () => {
  const src = JSON.parse(text('resources/SOURCE_PUNTEGGI.json'));
  assert.equal(createHash('sha256').update(readFileSync(url(src.file.replace(/^data\//, '')))).digest('hex'), src.sha256);
  const received = parseCsv(text('resources/risorse_con_punteggi.csv'), { name: 'risorse_con_punteggi.csv' });
  const inputs = await resourcePointsInputs();
  assert.deepEqual(validateScores(inputs.scores, inputs.locations), []);
  const user = inputs.scores.filter((s) => s.source === 'user_csv');
  assert.equal(user.length, received.length);
  user.forEach((s, i) => assert.equal(s.score_user, received[i].punteggio_output_1_10, `${s.location_id}: punteggio dell'utente alterato`));
  assert.equal(user.filter((s) => s.score_user !== s.score_final).length, 5, 'correzioni di Claude: 5, ognuna motivata');
});

test('dati reali: ogni risorsa somma al budget, ogni centro ha un punteggio 1-10, file generati allineati', async () => {
  const file = await resourcePointsFile();
  const onDisk = JSON.parse(text('resources/resource_points.json'));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(file)), 'rigenerare con npm run build:resource-points');
  assert.equal(text('../docs/RISORSE_PUNTI_TABELLA.md'), await resourcePointsTable(), 'tabella non allineata: npm run build:resource-points');
  const { budgetPerResource } = file.params;
  for (const [id, r] of Object.entries(file.resources)) {
    const sum = r.centers.reduce((a, c) => a + c.punti, 0);
    assert.ok(Math.abs(sum - budgetPerResource) < 0.05, `${id}: somma punti ${sum}`);
    assert.ok(Math.abs(Object.values(r.byControl).reduce((a, b) => a + b, 0) - budgetPerResource) < 0.05, `${id}: somma per controllore`);
    for (const c of r.centers) assert.ok(c.punteggio >= 1 && c.punteggio <= 10 && c.punteggioPicco >= c.punteggio);
  }
  assert.equal(Object.keys(file.resources).length, 19);
});

test('step 1: tutti i centri di una risorsa valgono uguale', async () => {
  const inputs = await resourcePointsInputs();
  const f = buildResourcePoints({ ...inputs, params: { step: 1, budgetPerResource: 100 } });
  for (const r of Object.values(f.resources)) { const set = new Set(r.centers.map((c) => c.punti)); assert.ok(set.size <= 2, 'a parità di peso i punti differiscono solo per arrotondamento'); }
});
