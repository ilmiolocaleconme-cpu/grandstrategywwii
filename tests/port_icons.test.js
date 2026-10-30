// Livello Porti sulla mappa: calcolo puro (portPinsByProvince, pinSpec) e disegno con un contesto Canvas finto (nessun browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portPinsByProvince, pinSpec, shortName, drawProvincePorts, PORT_DIAMETER, PORT_NAME_ZOOM, MAX_NAME_CHARS } from '../src/map/portIcons.js';
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
  const mk = (id, x, y, area) => ({ props: { id }, areaKm2: area, anchor: { x, y } });
  const items = [mk('P_1', 100, 100, 500), mk('P_2', 300, 100, 100)];
  const byId = new Map([...items.map((i) => [i.props.id, i]), ['C_A', mk('C_A', 130, 100, 1)], ['C_B', mk('C_B', 101, 100, 1)], ['C_C', mk('C_C', 330, 130, 1)]]);
  return { items, byId };
};
const args = (m, extra = {}) => ({ items: m.items, byProvince: portPinsByProvince(ports, null), a: { sx: 1, tx: 0, ty: 0 }, dpr: 1, copies: [0], boxes: [], model: m, hits: [], k: 1, ...extra });

test('portPinsByProvince: solo livello ≥ 1, ordinati per livello poi nome; lo stato di partita prevale sul 1936', () => {
  const p = portPinsByProvince(ports, null);
  assert.deepEqual(Object.keys(p).sort(), ['P_1', 'P_2']);
  assert.deepEqual(p.P_1.map((x) => [x.cittaId, x.level]), [['C_B', 3], ['C_A', 2]]);
  const built = portPinsByProvince(ports, { ports: { levels: { C_D: 1, C_A: 3 } } });
  assert.deepEqual(built.P_3.map((x) => x.cittaId), ['C_D']);
  assert.deepEqual(built.P_1.map((x) => x.cittaId), ['C_A', 'C_B'], 'parità di livello: ordine per nome');
  assert.deepEqual(portPinsByProvince(null, null), {});
});

test('pinSpec: diametro dal livello del porto principale, etichetta con +N, nome accorciato', () => {
  const s = pinSpec(portPinsByProvince(ports, null).P_1);
  assert.equal(s.diameter, PORT_DIAMETER[3]);
  assert.equal(s.label, 'Beta +1');
  assert.ok(s.title.includes('Alfa (livello 2)'));
  assert.ok(PORT_DIAMETER[1] < PORT_DIAMETER[2] && PORT_DIAMETER[2] < PORT_DIAMETER[3]);
  assert.equal(shortName('Nome lunghissimo di porto').length, MAX_NAME_CHARS);
  assert.equal(shortName('Roma'), 'Roma');
});

test('il livello «Porti» è tra i livelli della mappa', () => {
  assert.ok(LAYERS.some((l) => l.id === 'ports' && l.label === 'Porti'));
});

test('drawProvincePorts: senza nomi sotto lo zoom, con nomi sopra; linee e aree toccabili verso le città vere', () => {
  const m = model();
  const far = args(m, { k: PORT_NAME_ZOOM - 1 });
  drawProvincePorts(fakeCtx(), far);
  const provHits = far.hits.filter((h) => h.cittaId === 'C_B' && h.province === 'P_1');
  assert.equal(provHits.length, 1, 'un solo distintivo per provincia, sul porto principale (C_B)');
  const badge = provHits[0];
  assert.equal(badge.x1 - badge.x0, PORT_DIAMETER[3], 'senza nome l\'area è il solo distintivo');
  assert.ok(far.hits.some((h) => h.cittaId === 'C_A' && h.x1 - h.x0 === 18), 'puntino della seconda città portuale a 30 px: cliccabile');
  assert.ok(!far.hits.some((h) => h.cittaId === 'C_B' && h.x1 - h.x0 === 18), 'C_B è a 1 px dal distintivo: nessuna linea né puntino');

  const near = args(m, { k: PORT_NAME_ZOOM });
  const ctx = fakeCtx();
  drawProvincePorts(ctx, near);
  const withName = near.hits.find((h) => h.cittaId === 'C_B' && h.province === 'P_1' && h.x1 - h.x0 > PORT_DIAMETER[3]);
  assert.ok(withName, 'con il nome l\'area toccabile si allarga fino al testo');
  assert.ok(ctx.calls.some((c) => c[0] === 'fillText' && c[1] === 'Beta +1'));
});

test('drawProvincePorts: fuori schermo e sovrapposizioni saltati, nessuna linea oltre il massimo', () => {
  const m = model();
  const off = args(m, { a: { sx: 1, tx: -5000, ty: 0 } });
  drawProvincePorts(fakeCtx(), off);
  assert.equal(off.hits.length, 0);
  const busy = args(m, { boxes: [[60, 60, 140, 140]] });
  drawProvincePorts(fakeCtx(), busy);
  assert.ok(!busy.hits.some((h) => h.province === 'P_1'), 'riquadro già occupato: distintivo saltato');
  const wide = args(m, { a: { sx: 20, tx: -1500, ty: -1500 }, k: 8 });
  drawProvincePorts(fakeCtx(2000, 2000), wide);
  assert.ok(!wide.hits.some((h) => h.cittaId === 'C_C' && h.x1 - h.x0 === 18), 'città a più di 300 px: niente linea');
  drawProvincePorts(fakeCtx(), { ...args(m), byProvince: null });
});

test('dati reali: ogni porto del 1936 ha una città costiera con provincia madre', () => {
  const base = json('ports/ports_1936.json'); const coastal = json('ports/coastal_cities.json').cities;
  const pins = portPinsByProvince({ coastal, base: { ports: base.ports } }, null);
  const total = Object.values(pins).reduce((n, l) => n + l.length, 0);
  assert.ok(total >= Object.keys(base.ports).filter((id) => base.ports[id].level >= 1).length * 0.9, 'quasi tutti i porti compaiono');
  assert.ok(total > 20);
});
