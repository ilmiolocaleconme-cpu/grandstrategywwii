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

test('il livello «Porti» è tra i livelli della mappa', () => {
  assert.ok(LAYERS.some((l) => l.id === 'ports' && l.label === 'Porti'));
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
