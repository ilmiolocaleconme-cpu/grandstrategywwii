// Rilievi tracciati a mano (25/11/2026, richiesta dell'utente: «vedere meglio gli Urali come terreno»).
// La stima da raster (build_terrain.py) non vede gli Urali: la catena è stretta, corre lungo i confini delle province ed è coperta di
// taiga, quindi in Sverdlovsk, Perm', Baschiria e Čeljabinsk la montagna risulta l'1-2 %. Qui:
//  1. data/terrain.json riceve `rilievi` (poligoni approssimati, disegnati sul livello Terreno);
//  2. le frazioni delle province che la catena attraversa si correggono: la parte dentro il rilievo diventa del suo tipo (montagna o
//     collina), il resto mantiene le proporzioni di prima; tipo principale e secondario con le stesse regole dello script
//     (montagna se >= 35 %, altrimenti il tipo con più area; secondario se >= 20 %). Le province corrette hanno `ritocco`.
//
//   node scripts/terrain/rilievi-manuali.js        (va rilanciato dopo ogni `npm run build:terrain`)
//
// Poligoni da conoscenza geografica generale (cime e città note), non da un modello altimetrico: ipotesi, larghezze indicative.
// Urali polari, subpolari, settentrionali e meridionali = montagna; Urali medi (fra 56 e 59,5 N, bassi) e Mugodžary = collina.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from '../load-provinces.js';
import { buildProvinceIndex } from '../../src/data/geometry.js';
import { featureAreaKm2 } from '../../src/map/geo.js';
import { TERRAIN_TYPES } from '../../src/data/terrain.js';

export const RILIEVI_MANUALI = [
  { id: 'urali_polari', nome: 'Urali polari e subpolari', tipo: 'montagna',
    ring: [[65.9, 68.7], [65.3, 67.8], [64.5, 67.0], [63.9, 66.4], [63.0, 66.15], [61.6, 65.85], [60.5, 65.6], [59.6, 65.2], [59.2, 64.2], [66.9, 68.4], [66.3, 67.5], [65.5, 66.7], [64.8, 65.95], [63.4, 65.65], [62.1, 65.35], [61.2, 65.15], [60.7, 64.9], [60.2, 64.2]] },
  { id: 'urali_settentrionali', nome: 'Urali settentrionali', tipo: 'montagna',
    ring: [[58.9, 64.2], [60.2, 64.2], [59.9, 63.0], [59.6, 61.5], [59.6, 60.0], [59.4, 59.4], [58.7, 59.4], [58.9, 60.5], [58.8, 62.0], [58.7, 63.2]] },
  { id: 'urali_medi', nome: 'Urali medi', tipo: 'collina',
    ring: [[58.7, 59.4], [59.4, 59.4], [60.2, 58.5], [60.5, 57.4], [60.3, 56.3], [59.2, 56.0], [58.4, 56.3], [58.0, 57.2], [58.2, 58.4]] },
  { id: 'urali_meridionali', nome: 'Urali meridionali', tipo: 'montagna',
    ring: [[57.8, 56.0], [59.2, 56.0], [59.7, 55.0], [59.5, 54.0], [59.3, 53.0], [59.0, 52.0], [58.6, 51.4], [58.1, 51.4], [57.8, 52.2], [57.4, 53.0], [57.1, 54.0], [57.3, 55.0], [57.5, 55.6]] },
  { id: 'mugodzary', nome: 'Mugodžary', tipo: 'collina',
    ring: [[58.0, 50.7], [59.0, 50.7], [59.3, 49.6], [59.0, 48.7], [58.3, 48.7], [58.0, 49.6]] },
];

const STEP = 0.02; // gradi: passo del campionamento dentro i rilievi
const KM_DEG = 111.32;

function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Nuove frazioni: la quota `f` della provincia dentro il rilievo diventa `tipo`, il resto scala. Arrotondate a 2 decimali, somma 1. */
export function correggi(frazioni, quote) {
  const dentro = Object.values(quote).reduce((s, v) => s + v, 0);
  const out = {};
  for (const [k, v] of Object.entries(frazioni)) out[k] = v * (1 - dentro);
  for (const [k, v] of Object.entries(quote)) out[k] = (out[k] ?? 0) + v;
  const r = Object.fromEntries(TERRAIN_TYPES.filter((k) => out[k] > 0).map((k) => [k, Math.round(out[k] * 100) / 100]).filter(([, v]) => v > 0));
  const diff = Math.round((1 - Object.values(r).reduce((s, v) => s + v, 0)) * 100) / 100;
  if (diff) { const top = Object.entries(r).sort((a, b) => b[1] - a[1])[0][0]; r[top] = Math.round((r[top] + diff) * 100) / 100; }
  return r;
}

/** Tipo principale e secondario con le regole di build_terrain.py. */
export function etichetta(frazioni, sogliaMontagna = 0.35) {
  const ord = Object.entries(frazioni).sort((a, b) => b[1] - a[1]);
  const terreno = (frazioni.montagna ?? 0) >= sogliaMontagna ? 'montagna' : ord[0][0];
  const sec = ord.find(([k, v]) => k !== terreno && v >= 0.2);
  return { terreno, secondario: sec ? sec[0] : null };
}

export async function main() {
  const url = new URL('../../data/terrain.json', import.meta.url);
  const raw = await readFile(url, 'utf8');
  const doc = JSON.parse(raw);
  const provinces = await loadProvinces();
  const tiles = { ...provinces, features: provinces.features.filter((f) => f.properties.kind !== 'citta') };
  const index = buildProvinceIndex(tiles);
  const area = new Map();
  for (const f of tiles.features) { const m = f.properties.parentProvince ?? f.properties.id; area.set(m, (area.get(m) ?? 0) + featureAreaKm2(f)); }
  const quote = new Map(); // madre -> { tipo: km² }
  for (const r of RILIEVI_MANUALI) {
    const xs = r.ring.map((p) => p[0]);
    const ys = r.ring.map((p) => p[1]);
    for (let y = Math.min(...ys) + STEP / 2; y < Math.max(...ys); y += STEP) {
      const cell = (STEP * KM_DEG) ** 2 * Math.cos((y * Math.PI) / 180);
      for (let x = Math.min(...xs) + STEP / 2; x < Math.max(...xs); x += STEP) {
        if (!inRing(x, y, r.ring)) continue;
        const hit = index.provincesAt(x, y)[0];
        if (!hit) continue;
        const m = hit.properties.parentProvince ?? hit.properties.id;
        const q = quote.get(m) ?? quote.set(m, {}).get(m);
        q[r.tipo] = (q[r.tipo] ?? 0) + cell;
      }
    }
  }
  const soglia = doc.config?.primaria_montagna ?? 0.35;
  const cambiate = new Map();
  for (const [m, km] of quote) {
    const t = doc.province[m];
    if (!t) continue;
    const q = Object.fromEntries(Object.entries(km).map(([k, v]) => [k, Math.min(1, v / area.get(m))]));
    if (Object.values(q).reduce((s, v) => s + v, 0) < 0.01) continue;
    const base = t.frazioniStima ?? t.frazioni; // idempotente: si riparte sempre dalla stima da raster
    const frazioni = correggi(base, q);
    cambiate.set(m, { ...etichetta(frazioni, soglia), frazioni, frazioniStima: base, ritocco: 'rilievi_manuali (Urali)' });
  }
  // scrittura riga per riga, per non toccare le altre province (il file è quello di build_terrain.py)
  const lines = raw.split('\n');
  const out = [];
  let inserito = false;
  for (const line of lines) {
    const mm = /^ {4}"([^"]+)": (\{.*\})(,?)$/.exec(line);
    if (mm && cambiate.has(mm[1])) {
      const t = JSON.parse(mm[2]);
      const c = cambiate.get(mm[1]);
      const { frazioniStima: _a, ritocco: _b, ...resto } = t;
      const obj = { ...resto, terreno: c.terreno, secondario: c.secondario, frazioni: c.frazioni, frazioniStima: c.frazioniStima, ritocco: c.ritocco };
      const py = (v) => JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "');
      out.push(`    "${mm[1]}": {${Object.entries(obj).map(([k, v]) => `"${k}": ${py(v)}`).join(', ')}}${mm[3]}`);
      continue;
    }
    if (/^ {2}"rilievi": /.test(line)) continue;
    if (/^ {2}"province": \{$/.test(line) && !inserito) {
      const r = RILIEVI_MANUALI.map(({ id, nome, tipo, ring }) => ({ id, nome, tipo, fonte: 'tracciato a mano (ipotesi)', ring }));
      out.push(`  "rilievi": ${JSON.stringify(r).replace(/":/g, '": ').replace(/,"/g, ', "')},`);
      inserito = true;
    }
    out.push(line);
  }
  await writeFile(url, out.join('\n'));
  for (const [m, c] of [...cambiate].sort()) console.log(`${m}: ${c.terreno}${c.secondario ? ` (+${c.secondario})` : ''} ${JSON.stringify(c.frazioni)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
