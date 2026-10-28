// Terra di base (data/land_base.json): contorno delle terre emerse (Natural Earth 50m, dominio pubblico) semplificato, disegnato SOTTO
// le province. Dove le province generalizzate non arrivano (fiordi, coste frastagliate, isole minori, aree senza provincia) si vede
// terra neutra invece del colore del mare: niente "buchi" lungo la costa. NON assegna quei territori a nessuna nazione.
//   node scripts/build-land-base.js
import { readFile, writeFile } from 'node:fs/promises';
import { simplify } from '../src/data/transport.js';

const TOL = 0.03; // gradi (circa 3 km): sotto la precisione delle province
const MIN_AREA_DEG2 = 0.01; // scarta isolette sotto circa 120 km2
const src = JSON.parse(await readFile(new URL('../data/sources/ne_land_50m_world.json', import.meta.url), 'utf8'));
const area = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0)) / 2;
const polygons = [];
for (const rings of src.polygons) {
  if (area(rings[0]) < MIN_AREA_DEG2) continue;
  const out = [];
  rings.forEach((ring, i) => {
    const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    const s = simplify([...open, open[0]], TOL).slice(0, -1);
    if (s.length >= 3 && (i === 0 || area(s) >= MIN_AREA_DEG2 / 4)) out.push(s.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
  });
  if (out.length) polygons.push(out);
}
const file = { schema: 'land-base-v1', source: src.source, note: 'Terra neutra sotto le province (solo grafica, nessun effetto sulle regole). Rigenerare con node scripts/build-land-base.js', polygons };
await writeFile(new URL('../data/land_base.json', import.meta.url), `${JSON.stringify(file)}\n`);
console.log(`poligoni ${polygons.length} (su ${src.polygons.length}), punti ${polygons.reduce((s, p) => s + p.reduce((a, r) => a + r.length, 0), 0)}`);
