// Livello Porti sulla mappa: calcolo puro (portPinsByProvince, pinSpec) e disegno con un contesto Canvas finto (nessun browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portPins, shipyardPins, pinSpec, shortName, drawPorts, PORT_DIAMETER, PORT_NAME_ZOOM, MAX_NAME_CHARS } from '../src/map/portIcons.js';
import { LAYERS } from '../src/map/geo.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const ports = {
  coastal: {
    C_A: { name: 'Alfa', parentProvince: 'P_1' },
    C_B: { name: 'Beta', parentProvince: 'P_1' },
    C_C: { name: 'Gamma', parentProvince: 'P_2' },
    C_D: { name: 'Delta senza porto', parentProvince: 'P_3' },
  },
  base: { ports: { C_A: { level: 2 }, C_B: { level: 3 }, C_C: { level: 1 } } },
};

function fakeCtx(w = 800, h = 600) {
  const calls = [];
  const ctx = new Proxy({ canvas: { width: w, height: h }, calls }, {
    get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return (s) => ({ width: String(s).length * 6 }); return (...a) => { calls.push([k, ...a]); }; },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
const model = () => {
  const mk = (id, x, y) => ({ props: { id }, anchor: { x, y } });
  const byId = new Map([['C_A', mk('C_A', 130, 100)], ['C_B', mk('C_B', 101, 100)], ['C_C', mk('C_C', 330, 130)]]);
  return { items: [], byId };
};
const args = (m, extra = {}) => ({ pins: portPins(ports, null), a: { sx: 1, tx: 0, ty: 0 }, dpr: 1, copies: [0], boxes: [], model: m, hits: [], k: 1, ...extra });

test('portPins: solo livello ≥ 1, ordinati per livello poi nome; lo stato di partita prevale sul 1936', () => {
  assert.deepEqual(portPins(ports, null).map((x) => [x.cittaId, x.level, x.province]), [['C_B', 3, 'P_1'], ['C_A', 2, 'P_1'], ['C_C', 1, 'P_2']]);
  const built = portPins(ports, { ports: { levels: { C_D: 1, C_A: 3 } } });
  assert.deepEqual(built.map((x) => x.cittaId), ['C_A', 'C_B', 'C_D', 'C_C'], 'livello 3 per nome, poi 1 per nome');
  assert.deepEqual(portPins(null, null), []);
});

test('pinSpec: diametro dal livello, nome accorciato', () => {
  const s = pinSpec(portPins(ports, null)[0]);
  assert.equal(s.diameter, PORT_DIAMETER[3]);
  assert.equal(s.label, 'Beta');
  assert.ok(s.title.includes('livello 3'));
  assert.ok(PORT_DIAMETER[1] < PORT_DIAMETER[2] && PORT_DIAMETER[2] < PORT_DIAMETER[3]);
  assert.equal(shortName('Nome lunghissimo di porto').length, MAX_NAME_CHARS);
  assert.equal(shortName('Roma'), 'Roma');
});

test('«Porti» non è più un livello di base: è un\'opzione sulla mappa, indipendente dal livello', () => {
  assert.ok(!LAYERS.some((l) => l.id === 'ports' || l.label === 'Porti'));
});

test('drawPorts: un distintivo per porto, sul punto della città, senza linee; nome da zoom e solo con spazio', () => {
  const m = model();
  const far = args(m, { k: PORT_NAME_ZOOM - 1 }); const ctxFar = fakeCtx();
  drawPorts(ctxFar, far);
  assert.equal(far.hits.length, 2, 'C_A e C_B sono a 29 px: troppo vicini per due distintivi (C_A salta), C_C è libero');
  const b = far.hits.find((h) => h.cittaId === 'C_B');
  assert.equal(b.x1 - b.x0, PORT_DIAMETER[3]);
  assert.equal((b.x0 + b.x1) / 2, 101, 'centrato sulla città');
  const near = args(m, { k: PORT_NAME_ZOOM }); const ctx = fakeCtx();
  drawPorts(ctx, near);
  assert.ok(near.hits.find((h) => h.cittaId === 'C_B').x1 - near.hits.find((h) => h.cittaId === 'C_B').x0 > PORT_DIAMETER[3], 'con il nome l\'area si allarga');
  assert.ok(ctx.calls.some((c) => c[0] === 'fillText' && c[1] === 'Beta'));
});

test('drawPorts: fuori schermo e sovrapposizioni saltati, città mancante ignorata', () => {
  const m = model();
  const off = args(m, { a: { sx: 1, tx: -5000, ty: 0 } });
  drawPorts(fakeCtx(), off);
  assert.equal(off.hits.length, 0);
  const busy = args(m, { boxes: [[60, 60, 140, 140]] });
  drawPorts(fakeCtx(), busy);
  assert.ok(!busy.hits.some((h) => h.cittaId === 'C_B' || h.cittaId === 'C_A'), 'riquadro già occupato: distintivi saltati');
  const none = args({ items: [], byId: new Map() });
  drawPorts(fakeCtx(), none);
  assert.equal(none.hits.length, 0);
  drawPorts(fakeCtx(), { ...args(m), pins: null });
});

test('shipyardPins: cantieri costruiti, uno per provincia, accanto al porto principale (o alla città costiera)', () => {
  const st = { nations: { A: { facilities: [{ type: 'FCT-SHIPYARD', provinceId: 'P_1' }, { type: 'FCT-SHIPYARD', provinceId: 'P_1' }, { type: 'FCT-STEEL', provinceId: 'P_2' }, { type: 'FCT-SHIPYARD' }] }, B: { facilities: [{ type: 'FCT-SHIPYARD', provinceId: 'P_3' }, { type: 'FCT-SHIPYARD', provinceId: 'P_9' }] } } };
  const y = shipyardPins(ports, st);
  assert.deepEqual(y.map((x) => [x.provinceId, x.cittaId, x.count]), [['P_1', 'C_B', 2], ['P_3', 'C_D', 1]], 'P_1: porto di livello più alto; P_3: città costiera senza porto; P_9 senza coste: nessun segno; senza provinceId o non cantiere: ignorati');
  assert.deepEqual(shipyardPins(ports, null), []);
});

test('drawPorts: il cantiere si disegna accanto al porto e si può toccare (vince sul porto)', () => {
  const m = model();
  m.byId.set('C_D', { props: { id: 'C_D' }, anchor: { x: 200, y: 250 } });
  const a = args(m, { yards: [{ provinceId: 'P_1', cittaId: 'C_B', name: 'Beta', count: 1 }, { provinceId: 'P_3', cittaId: 'C_D', name: 'Delta', count: 1 }] });
  drawPorts(fakeCtx(), a);
  const yards = a.hits.filter((h) => h.yard);
  assert.equal(yards.length, 2);
  const port = a.hits.find((h) => h.cittaId === 'C_B' && !h.yard);
  const y1 = yards.find((h) => h.cittaId === 'C_B');
  assert.ok(y1.x0 < port.x0 + PORT_DIAMETER[3] / 2 && y1.y0 > port.y0 + PORT_DIAMETER[3] / 2 - 1, 'in basso a sinistra, attaccato al distintivo del porto');
  assert.ok(a.hits.indexOf(y1) > a.hits.indexOf(port), 'il cantiere viene dopo: nel tocco vince');
  assert.equal((yards.find((h) => h.cittaId === 'C_D').x0 + yards.find((h) => h.cittaId === 'C_D').x1) / 2, 200, 'senza porto: sul punto della città');
});

test('dati reali: ogni porto del 1936 ha una città costiera con provincia madre', () => {
  const base = json('ports/ports_1936.json'); const coastal = json('ports/coastal_cities.json').cities;
  const total = portPins({ coastal, base: { ports: base.ports } }, null).length;
  assert.ok(total >= Object.keys(base.ports).filter((id) => base.ports[id].level >= 1).length * 0.9, 'quasi tutti i porti compaiono');
  assert.ok(total > 20);
});

// --- 12/11/2026: porti di città divise in parti (Königsberg, Amburgo...) non venivano disegnati ---
import { cityItemOf } from '../src/map/portIcons.js';

test('cityItemOf: id esatto, altrimenti la parte più grande della città; città assente: null', () => {
  const mk = (id, cittaId, area) => ({ id, props: { id, cittaId, areaKm2: area }, anchor: { x: 1, y: 1 } });
  const items = [mk('C_X_P1', 'C_X', 115), mk('C_X_P2', 'C_X', 13), mk('C_Y', 'C_Y', 5)];
  const m = { items, byId: new Map(items.map((i) => [i.id, i])) };
  assert.equal(cityItemOf(m, 'C_Y').id, 'C_Y', 'id esatto');
  assert.equal(cityItemOf(m, 'C_X').id, 'C_X_P1', 'parte più grande');
  assert.equal(cityItemOf(m, 'C_Z'), null);
});

test('dati reali: ogni porto del 1936 e ogni città costiera ha una città disegnabile sulla mappa (nessun porto saltato in silenzio)', () => {
  const feats = json('citta_grandi.json').features;
  const items = feats.map((f) => ({ id: f.properties.id, props: f.properties, anchor: { x: 0, y: 0 } }));
  const m = { items, byId: new Map(items.map((i) => [i.id, i])) };
  const missing = Object.keys(json('ports/ports_1936.json').ports).filter((id) => !cityItemOf(m, id));
  assert.deepEqual(missing, [], `porti senza città sulla mappa: ${missing.join(', ')}`);
  assert.equal(cityItemOf(m, 'P_DEU_KONIGSBERG_CITTA').id, 'P_DEU_KONIGSBERG_CITTA_P1');
});

test('drawPorts: un porto la cui città è divisa in parti viene disegnato (Königsberg)', () => {
  const items = [{ id: 'P_K_CITTA_P1', props: { id: 'P_K_CITTA_P1', cittaId: 'P_K_CITTA', areaKm2: 60 }, anchor: { x: 50, y: 50 } }];
  const m = { items, byId: new Map(items.map((i) => [i.id, i])) };
  const pk = { coastal: { P_K_CITTA: { name: 'Königsberg', parentProvince: 'P_K' } }, base: { ports: { P_K_CITTA: { level: 2 } } } };
  const hits = [];
  drawPorts(fakeCtx(), { pins: portPins(pk, null), a: { sx: 1, tx: 0, ty: 0 }, dpr: 1, copies: [0], boxes: [], model: m, hits, k: 1 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].cittaId, 'P_K_CITTA');
});

test('drawPorts: i cantieri si disegnano e si possono toccare anche senza i porti (opzioni indipendenti)', () => {
  const m = model();
  const yards = [{ provinceId: 'P_1', cittaId: 'C_A', name: 'Alfa', count: 1 }];
  const hits = [];
  drawPorts(fakeCtx(), args(m, { pins: null, yards, hits }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].yard, true);
  assert.equal(hits[0].province, 'P_1');
  const none = [];
  drawPorts(fakeCtx(), args(m, { pins: null, yards: null, hits: none }));
  assert.equal(none.length, 0, 'senza porti né cantieri non si disegna nulla');
});

test('cantieri storici 1936 (bozza): dati validi, una voce per città, e compaiono sulla mappa dall\'inizio senza costruire nulla', async () => {
  const { readFileSync } = await import('node:fs');
  const { validateShipyards } = await import('../src/data/shipyards.js');
  const rd = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
  const doc = rd('naval/shipyards_1936.json');
  const coastal = rd('ports/coastal_cities.json').cities;
  assert.deepEqual(validateShipyards(doc, { coastal }), []);
  assert.ok(doc.shipyards.length >= 30 && doc.shipyards.every((y) => y.basis === 'ipotesi'), 'bozza: tutte ipotesi da confermare');
  const bad = (patch) => validateShipyards({ ...doc, shipyards: [{ ...doc.shipyards[0], ...patch }, ...doc.shipyards.slice(1)] }, { coastal }).join();
  assert.match(bad({ cittaId: 'P_XXX_NO_CITTA' }), /città costiera/);
  assert.match(bad({ nation: 'ZZZ' }), /diversa dal proprietario/);
  assert.match(bad({ basis: 'certo' }), /basis/);
  assert.match(validateShipyards({ ...doc, shipyards: [doc.shipyards[0], doc.shipyards[0]] }, { coastal }).join(), /duplicato/);
  const ports = { coastal, base: rd('ports/ports_1936.json'), levels: rd('ports/port_levels.json') };
  const pins = shipyardPins(ports, null, doc);
  assert.ok(pins.length > 0 && pins.length <= doc.shipyards.length);
  assert.ok(pins.some((p) => p.cittaId === 'P_DEU_KIEL_CITTA' && p.provinceId === 'P_DEU_SCHLESWIG_HOLSTEIN'));
  assert.deepEqual(shipyardPins(ports, null, null), [], 'senza elenco storico né costruiti: nessun segno');
  const st = { nations: { DEU: { facilities: [{ type: 'FCT-SHIPYARD', provinceId: 'P_DEU_SCHLESWIG_HOLSTEIN' }] } } };
  assert.equal(shipyardPins(ports, st, doc).find((p) => p.provinceId === 'P_DEU_SCHLESWIG_HOLSTEIN').count, 2, 'storico + costruito si sommano');
});
