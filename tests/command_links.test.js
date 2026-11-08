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

// ---- Comando fuori schermo: il filo deve raggiungerlo (caso tipico della divisione «fuori portata», a più di 300 km)
test('fili: un estremo non disegnato non si accorcia e non annulla il filo', async () => {
  const { threadEnds, COUNTER_W } = await import('../src/map/unitIcons.js');
  const e = threadEnds({ x: 100, y: 100 }, { x: 5000, y: 100, hidden: true });
  assert.ok(e, 'il filo esiste anche se un estremo è fuori schermo');
  assert.ok(e.x0 > 100 && e.x0 < 100 + COUNTER_W, 'accorciato dal lato del segnalino disegnato');
  assert.equal(e.x1, 5000, 'non accorciato dal lato nascosto');
  const bothHidden = threadEnds({ x: 0, y: 0, hidden: true }, { x: 30, y: 5, hidden: true });
  assert.deepEqual([bothHidden.x0, bothHidden.x1], [0, 30], 'due ancoraggi vicini restano un filo, senza accorciamenti');
});

test('fili: la coppia sceglie l\'ancoraggio nascosto quando manca il segnalino disegnato', async () => {
  const { nearestPair } = await import('../src/map/unitIcons.js');
  const pts = [
    { province: 'p1', nation: 'DEU', cx: 50, cy: 50 },                       // disegnato
    { province: 'p2', nation: 'DEU', cx: 4000, cy: 70, hidden: true },       // comando fuori schermo
    { province: 'p2', nation: 'FRA', cx: 60, cy: 60 },                       // altra nazione: ignorata
  ];
  const r = nearestPair(pts, 'p1', 'p2', 'DEU');
  assert.deepEqual([r.a.hidden, r.b.hidden, r.b.x], [false, true, 4000]);
});

// ---- Elenco «Inquadra in…» per vicinanza e fili tratteggiati (richieste del 07/11/2026)
import { nearestFirst, distanceLabel } from '../src/rules/commandLinks.js';

const groups = [
  { level: 'army', label: 'Armata', items: [{ id: 'A1', name: 'Armata Nord', km: 250 }, { id: 'A2', name: 'Armata Sud', km: null }] },
  { level: 'corps', label: 'Corpo d’armata', items: [{ id: 'C1', name: 'Corpo B', km: 40 }, { id: 'C2', name: 'Corpo A', km: 40 }, { id: 'C3', name: 'Corpo Z', km: 420 }] },
];

test('elenco: una lista sola, dal più vicino; a parità di km ordine alfabetico; senza distanza in fondo', () => {
  const l = nearestFirst(groups);
  assert.deepEqual(l.map((p) => p.id), ['C2', 'C1', 'A1', 'C3', 'A2']);
  assert.deepEqual(l.map((p) => p.levelLabel), ['Corpo d’armata', 'Corpo d’armata', 'Armata', 'Corpo d’armata', 'Armata'], 'ogni voce porta il suo livello (il corpo può essere più lontano dell\'armata)');
});

test('elenco: «il più vicino» è segnato una volta sola, sulla prima voce con distanza nota', () => {
  const l = nearestFirst(groups);
  assert.deepEqual(l.map((p) => p.nearest), [true, false, false, false, false]);
  const noKm = nearestFirst([{ level: 'army', label: 'Armata', items: [{ id: 'A', name: 'A', km: null }, { id: 'B', name: 'B' }] }]);
  assert.ok(noKm.every((p) => p.nearest === false), 'senza nessuna distanza nota nessuno è «il più vicino»');
  assert.deepEqual(nearestFirst([]), []);
});

test('elenco: non modifica i dati di ingresso', () => {
  const copy = JSON.parse(JSON.stringify(groups));
  nearestFirst(groups);
  assert.deepEqual(groups, copy);
});

test('distanza: testo in chiaro, avviso con simbolo oltre i 300 km, «non nota» se assente', () => {
  assert.deepEqual(distanceLabel(120.4), { text: '120 km', far: false });
  assert.deepEqual(distanceLabel(300), { text: '300 km', far: false });
  assert.deepEqual(distanceLabel(301), { text: '⚠ fuori portata · 301 km', far: true });
  assert.deepEqual(distanceLabel(null), { text: 'distanza non nota', far: false });
  assert.deepEqual(distanceLabel(undefined), { text: 'distanza non nota', far: false });
  assert.deepEqual(distanceLabel(NaN), { text: 'distanza non nota', far: false });
});

test('fili: ogni livello è tratteggiato e sottile', async () => {
  const { THREAD_STYLE } = await import('../src/map/unitIcons.js');
  for (const [level, st] of Object.entries(THREAD_STYLE)) {
    assert.ok(st.dash.length >= 2, `${level}: tratteggio`);
    assert.ok(st.width <= 2, `${level}: sottile`);
  }
  const patterns = new Set(Object.values(THREAD_STYLE).map((s) => s.dash.join(',')));
  assert.ok(patterns.size >= 3, 'i livelli si distinguono dal tratteggio, non solo dallo spessore');
});

// ---- Forze agli ordini di un comando (scelta B, 08/11/2026)
import { byDistance } from '../src/rules/commandLinks.js';

test('forze agli ordini: dalla più vicina, senza distanza in fondo, a parità alfabetico; non modifica l\'ingresso', () => {
  const subs = [{ id: 'a', name: 'Zeta', km: 90 }, { id: 'b', name: 'Beta', km: null }, { id: 'c', name: 'Alfa', km: 90 }, { id: 'd', name: 'Delta', km: 12 }, { id: 'e', name: 'Eps' }];
  const copy = JSON.parse(JSON.stringify(subs));
  assert.deepEqual(byDistance(subs).map((x) => x.id), ['d', 'c', 'a', 'b', 'e']);
  assert.deepEqual(subs, copy);
  assert.deepEqual(byDistance([]), []);
});

test('«Aggiungi unità…»: le unità libere sono in una lista sola dalla più vicina al comando, con il livello di ciascuna', () => {
  // forma di validChildren: gruppi per etichetta di livello; km è la distanza dal comando
  const groups = [
    { level: 'corps', label: 'Corpo d’armata', items: [{ id: 'C9', name: 'Corpo IX', km: 310 }] },
    { level: 'division', label: 'Divisione', items: [{ id: 'D5', name: 'Divisione 5', km: 20 }, { id: 'D6', name: 'Divisione 6', km: 150 }] },
  ];
  const l = nearestFirst(groups);
  assert.deepEqual(l.map((u) => [u.id, u.levelLabel, u.nearest]), [['D5', 'Divisione', true], ['D6', 'Divisione', false], ['C9', 'Corpo d’armata', false]]);
  assert.equal(distanceLabel(l[2].km).far, true, 'il corpo a 310 km è fuori portata: lo dice il testo, non solo il colore');
});
