// Ponti IPOTETICI dove una sponda e l'altra della stessa provincia sono divise da un fiume PRINCIPALE (class 'main') e data/links.json non ha nessun ponte.
// Regola unica (utente, 13/11/2026): un fiume principale si attraversa solo su un ponte agibile; senza ponte nei dati la coppia sarebbe una barriera assoluta per una
// lacuna della rete moderna. Qui si inferisce UN ponte per coppia: stesso fiume, posto al centro del confine fra le due sponde. TUTTO è ipotesi, non un ponte storico.
// Metodo: confine comune = vertici condivisi dei due poligoni (o entro ~300 m); fiume = quello con la mediana delle distanze dal confine comune più bassa (≤ 2 km).
// Uso: node scripts/infer-bridges.js   → scrive data/bridges_inferred.json
import { readFile, writeFile } from 'node:fs/promises';
import { loadProvinces } from './load-provinces.js';
import { buildRiverModel, distanceToLineKm } from '../src/data/rivers.js';
import { bridgeKey } from '../src/rules/bridges.js';

const data = async (n) => JSON.parse(await readFile(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const MAX_KM = 2;
const rings = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());
const q = (p, d = 4) => `${p[0].toFixed(d)},${p[1].toFixed(d)}`;

export async function inferBridges() {
  const prov = await loadProvinces();
  const ids = prov.features.map((f) => f.properties.id);
  const byId = new Map(prov.features.map((f) => [f.properties.id, f]));
  const mother = new Map(prov.features.map((f) => [f.properties.id, f.properties.parentProvince ?? null]));
  const adj = await data('adjacency.json'); const links = await data('links.json'); const riv = await data('rivers.json');
  const model = buildRiverModel(riv, await data('rivers_geo.json')); const info = new Map(riv.map((r) => [r.id, r]));
  const lk = new Map(links.links.map((l) => [l.id, l]));
  const bridged = new Set(links.bridges.map((b) => bridgeKey(ids[lk.get(b.link).a], ids[lk.get(b.link).b])));
  const out = []; const unresolved = [];
  for (const [i, j] of adj.edges) {
    const a = ids[i]; const b = ids[j];
    if (!mother.get(a) || mother.get(a) !== mother.get(b) || bridged.has(bridgeKey(a, b))) continue;
    const vb = new Set(); for (const r of rings(byId.get(b).geometry)) for (const p of r) vb.add(q(p));
    const vb3 = new Set(); for (const r of rings(byId.get(b).geometry)) for (const p of r) vb3.add(q(p, 2));
    let shared = []; for (const r of rings(byId.get(a).geometry)) for (const p of r) if (vb.has(q(p))) shared.push(p);
    if (shared.length === 0) for (const r of rings(byId.get(a).geometry)) for (const p of r) if (vb3.has(q(p, 2))) shared.push(p); // entro ~1 km: confine non agganciato
    if (shared.length === 0) { unresolved.push({ a, b, reason: 'confine comune non trovato' }); continue; }
    const step = Math.max(1, Math.floor(shared.length / 40)); let best = null;
    for (const [rid, { lines }] of model.rivers) {
      if (!lines.length) continue;
      const ds = [];
      for (let n = 0; n < shared.length; n += step) { let d = Infinity; for (const ln of lines) { d = Math.min(d, distanceToLineKm(shared[n][0], shared[n][1], ln.coordinates)); if (d < 0.3) break; } ds.push(d); }
      ds.sort((x, y) => x - y); const med = ds[Math.floor(ds.length / 2)];
      if (!best || med < best.med) best = { rid, med };
    }
    if (!best || best.med > MAX_KM) { unresolved.push({ a, b, reason: `nessun fiume entro ${MAX_KM} km (più vicino ${best?.rid} a ${best ? best.med.toFixed(1) : '?'} km)` }); continue; }
    const r = info.get(best.rid);
    if (r.class !== 'main') continue; // fiumi minori: si forzano, nessun ponte da inferire
    const mid = shared[Math.floor(shared.length / 2)];
    out.push({ id: `LB_INF_${String(out.length + 1).padStart(3, '0')}`, a, b, riverId: best.rid, widthClass: r.widthClass, lon: +mid[0].toFixed(4), lat: +mid[1].toFixed(4), distKm: +best.med.toFixed(2) });
  }
  return { out, unresolved };
}

if (process.argv[1] && process.argv[1].endsWith('infer-bridges.js')) {
  const { out, unresolved } = await inferBridges();
  await writeFile(new URL('../data/bridges_inferred.json', import.meta.url), `${JSON.stringify({
    schema: 'bridges-inferred-v1', basis: 'ipotesi', quality: 'hypothesis',
    method: 'un ponte per coppia di sponde divise da un fiume principale senza ponti in links.json; posto sul confine comune, fiume = il più vicino entro 2 km (scripts/infer-bridges.js)',
    note: 'Ponti IPOTETICI, non storici: servono perché la regola unica (fiume main = si passa solo su un ponte agibile) non trasformi una lacuna della rete moderna in una barriera assoluta.',
    unresolved, bridges: out,
  }, null, 1)}\n`);
  console.log(`ponti inferiti: ${out.length}; coppie non risolte: ${unresolved.length}`);
}
