import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandDistances, distanceTo, commandThreads } from '../src/rules/commandLinks.js';

// Catena: T (teatro) > A (armata) > C (corpo) > D1, D2, D3 (divisioni). S = supporto, X = divisione di un'altra nazione.
const unit = (id, extra) => [id, { id, nation: 'DEU', ...extra }];
const unitsById = new Map([
  unit('T', { category: 'command', commandLevel: 'theater' }),
  unit('A', { category: 'command', commandLevel: 'army' }),
  unit('C', { category: 'command', commandLevel: 'corps' }),
  unit('D1', { category: 'infantry', echelon: 'division' }),
  unit('D2', { category: 'armored', echelon: 'division' }),
  unit('D3', { category: 'infantry', echelon: 'division' }),
  unit('S', { category: 'artillery', echelon: 'regiment' }),
  unit('X', { category: 'infantry', echelon: 'division', nation: 'FRA' }),
]);
const link = (parent) => ({ parent, source: 'player', since: '1936-01-01' });
const orbat = { schema: 'orbat-v1', links: { A: link('T'), C: link('A'), D1: link('C'), D2: link('C'), D3: link('C'), S: link('C'), X: link('C') } };

const POS = { D1: 'p1', D2: 'p1', D3: 'p9', S: 'p1', X: 'p1', C: 'p2', A: 'p3', T: 'p3' };
const KM = { 'p2|p1': 120, 'p2|p9': 301, 'p2|p2': 0 };
const base = { orbat, unitsById, posOf: (id) => POS[id] ?? null, cmdPosOf: (id) => POS[id] ?? null, km: (a, b) => KM[`${a}|${b}`] ?? null };

test('distanze: 300 km non è fuori portata, 301 sì', () => {
  const r = commandDistances({ ...base, nation: 'DEU' });
  assert.deepEqual(r.map((x) => [x.id, x.km, x.far]), [['D1', 120, false], ['D2', 120, false], ['D3', 301, true]]);
});

test('distanze: solo divisioni di terra e della nazione richiesta (niente supporti, niente stranieri)', () => {
  const ids = commandDistances({ ...base }).map((x) => x.id);
  assert.ok(!ids.includes('S'), 'il supporto non è una divisione');
  assert.ok(ids.includes('X'), 'senza filtro di nazione compare anche la divisione straniera');
  assert.ok(!commandDistances({ ...base, nation: 'DEU' }).some((x) => x.id === 'X'));
});

test('distanze: posizione o distanza assenti non diventano mai «vicino»', () => {
  const r = commandDistances({ ...base, posOf: (id) => (id === 'D1' ? null : POS[id]), nation: 'DEU' });
  assert.ok(!r.some((x) => x.id === 'D1'), 'senza posizione la divisione è saltata');
  const r2 = commandDistances({ ...base, km: () => undefined, nation: 'DEU' });
  assert.equal(r2.length, 0, 'senza distanza nessuna riga, non km = 0');
});

test('elenco «Inquadra in…»: distanza per ciascun candidato, null se ignota', () => {
  const m = distanceTo({ unitPos: 'p1', candidates: [{ id: 'C' }, { id: 'A' }, { id: 'Z' }], cmdPosOf: (id) => POS[id] ?? null, km: base.km });
  assert.equal(m.get('C'), 120);
  assert.equal(m.get('A'), null, 'distanza p3→p1 non nota');
  assert.equal(m.get('Z'), null, 'comando senza posizione');
  assert.equal(distanceTo({ unitPos: null, candidates: [{ id: 'C' }], cmdPosOf: () => 'p2', km: () => 5 }).get('C'), null);
});

test('fili: divisione → corpo → armata, senza duplicati e senza tratti di lunghezza zero', () => {
  const t = commandThreads({ ...base, nation: 'DEU' });
  const key = (s) => `${s.fromProv}>${s.toProv}:${s.level}`;
  // D1 e D2 stanno in p1: un solo filo p1→p2. D3 in p9: p9→p2. Corpo (p2) → armata (p3). Armata e teatro in p3: nessun filo.
  assert.deepEqual(t.map(key).sort(), ['p1>p2:corps', 'p2>p3:army', 'p9>p2:corps']);
});

test('fili: niente supporti né divisioni di altre nazioni, e tratti con posizione ignota saltati', () => {
  const t = commandThreads({ ...base, nation: 'DEU' });
  assert.ok(!t.some((s) => s.from === 'S' || s.from === 'X'));
  const noC = commandThreads({ ...base, cmdPosOf: (id) => (id === 'C' ? null : POS[id]), nation: 'DEU' });
  assert.equal(noC.length, 0, 'se la posizione del corpo è ignota non si inventa un filo');
});

test('fili: una divisione sotto un teatro senza passare dal corpo ha il suo filo', () => {
  const o2 = { schema: 'orbat-v1', links: { D1: link('T') } };
  const t = commandThreads({ ...base, orbat: o2, nation: 'DEU' });
  assert.deepEqual(t.map((s) => [s.fromProv, s.toProv, s.level]), [['p1', 'p3', 'theater']]);
});

test('fili: orbat vuoto o assente non dà errori', () => {
  assert.deepEqual(commandThreads({ ...base, orbat: { links: {} } }), []);
  assert.deepEqual(commandThreads({ ...base, orbat: undefined }), []);
  assert.deepEqual(commandDistances({ ...base, orbat: undefined }), []);
});

// ---- Segnalini sulla mappa: luce per le divisioni fuori portata e geometria dei fili (parte pura di src/map/unitIcons.js)
test('luce: il segnalino con una divisione fuori portata ha far e conteggio; senza farIds il risultato non cambia', async () => {
  const { counterSpec, countersFor } = await import('../src/map/unitIcons.js');
  const g = { nation: 'DEU', divisions: 2, commands: 0, units: [{ id: 'D1', echelon: 'division', category: 'infantry' }, { id: 'D3', echelon: 'division', category: 'infantry' }] };
  const plain = counterSpec(g);
  assert.equal('far' in plain, false, 'senza farIds nessun campo in più (i test e il disegno di prima restano uguali)');
  assert.deepEqual(counterSpec(g, new Set()), plain);
  const far = counterSpec(g, new Set(['D3']));
  assert.equal(far.far, true);
  assert.equal(far.farCount, 1);
  assert.match(far.title, /1 fuori portata/);
  assert.equal('far' in counterSpec(g, new Set(['Z9'])), false, 'un id che non è nel gruppo non accende la luce');
  const cmdOnly = { nation: 'DEU', divisions: 0, commands: 1, units: [{ id: 'C', echelon: 'command', category: 'command', commandLevel: 'corps' }] };
  assert.equal('far' in counterSpec(cmdOnly, new Set(['C'])), false, 'un comando non è una divisione: nessuna luce');
  assert.equal(countersFor([g], new Set(['D1'])).shown[0].far, true);
});

test('fili: gli estremi sono accorciati al bordo dei riquadri; riquadri a contatto non danno filo', async () => {
  const { threadEnds, COUNTER_W } = await import('../src/map/unitIcons.js');
  const e = threadEnds({ x: 0, y: 0 }, { x: 200, y: 0 });
  assert.equal(e.y0, 0);
  assert.ok(e.x0 > 0 && e.x0 < COUNTER_W, 'parte dal bordo destro del primo riquadro');
  assert.ok(e.x1 < 200 && e.x1 > 200 - COUNTER_W, 'arriva al bordo sinistro del secondo');
  assert.equal(threadEnds({ x: 0, y: 0 }, { x: 30, y: 5 }), null, 'riquadri sovrapposti');
  assert.equal(threadEnds({ x: 7, y: 7 }, { x: 7, y: 7 }), null, 'stesso punto');
  const v = threadEnds({ x: 0, y: 0 }, { x: 0, y: -100 });
  assert.ok(v.y0 < 0 && v.y1 > -100 && v.x0 === 0, 'verticale');
});

test('fili: si sceglie la coppia di segnalini più vicina tra le copie della mappa e si ignorano altre nazioni', async () => {
  const { nearestPair } = await import('../src/map/unitIcons.js');
  const hits = [
    { province: 'p1', nation: 'DEU', cx: 10, cy: 10 }, { province: 'p1', nation: 'DEU', cx: 1010, cy: 10 }, // copia a destra
    { province: 'p2', nation: 'DEU', cx: 990, cy: 10 }, { province: 'p2', nation: 'FRA', cx: 20, cy: 10 },
  ];
  const r = nearestPair(hits, 'p1', 'p2', 'DEU');
  assert.deepEqual([r.a.x, r.b.x], [1010, 990]);
  assert.equal(nearestPair(hits, 'p1', 'p9', 'DEU'), null, 'segnalino assente: nessun filo');
});

// ---- Fili solo per la selezione (decisione del 07/11/2026)
const focus = (ids, extra = {}) => commandThreads({ ...base, nation: 'DEU', focusIds: ids, ...extra });
const keyOf = (s) => `${s.fromProv}>${s.toProv}:${s.level}`;

test('selezione: nessuna unità scelta = nessun filo', () => {
  assert.deepEqual(focus([]), []);
});

test('selezione: una divisione mostra la sua catena verso l\'alto, non i fratelli', () => {
  // D3 (p9) sotto il corpo C (p2) sotto l'armata A (p3): fili p9→p2 e p2→p3. D1 e D2 (p1) restano senza filo.
  assert.deepEqual(focus(['D3']).map(keyOf).sort(), ['p2>p3:army', 'p9>p2:corps']);
});

test('selezione: un corpo mostra le sue divisioni sotto e i suoi superiori', () => {
  assert.deepEqual(focus(['C']).map(keyOf).sort(), ['p1>p2:corps', 'p2>p3:army', 'p9>p2:corps']);
});

test('selezione: l\'armata mostra tutta la discesa; il supporto e le altre nazioni restano fuori', () => {
  const t = focus(['A']);
  assert.deepEqual(t.map(keyOf).sort(), ['p1>p2:corps', 'p2>p3:army', 'p9>p2:corps']);
  assert.ok(!t.some((s) => s.from === 'S' || s.from === 'X'));
});

test('selezione: un\'unità nemica scelta non produce fili (niente informazioni sul nemico)', () => {
  assert.deepEqual(focus(['X']), []);
  assert.deepEqual(focus(['X', 'D3']).map(keyOf).sort(), ['p2>p3:army', 'p9>p2:corps'], 'la nemica non aggiunge nulla, la nostra sì');
});

test('selezione: un\'unità inesistente o senza posizione non rompe e non inventa fili', () => {
  assert.deepEqual(focus(['ZZZ']), []);
  assert.deepEqual(focus(['D3'], { cmdPosOf: (id) => (id === 'C' ? null : POS[id]) }), [], 'senza posizione del corpo nessun filo da/verso il corpo');
});

test('selezione: senza focusIds resta il comportamento di tutti i fili (compatibilità)', () => {
  assert.equal(commandThreads({ ...base, nation: 'DEU' }).length, 3);
});
