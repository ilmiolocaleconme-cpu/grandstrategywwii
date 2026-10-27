// Unisce i poligoni di una stessa provincia che si toccano lungo un lato comune (es. Matera: due pezzi separati da una retta
// di taglio che si vedeva come linea interna). Non tocca province con pezzi realmente separati (isole, exclavi).
// Uso: node scripts/merge-split-polygons.js [--write] [--only=P_ITA_]   (--only: solo gli id che iniziano così)
import { readProvinceDocs, writeProvinceDocs } from './province-io.js';

const key = (p) => `${p[0]},${p[1]}`;
const ek = (a, b) => `${key(a)}>${key(b)}`;

/** Unisce due anelli (chiusi, primo = ultimo) che condividono lati in verso opposto. Restituisce l'anello unito o null. */
export function mergeRings(r1, r2) {
  const e1 = new Set(); const e2 = new Set();
  for (let i = 0; i + 1 < r1.length; i += 1) e1.add(ek(r1[i], r1[i + 1]));
  for (let i = 0; i + 1 < r2.length; i += 1) e2.add(ek(r2[i], r2[i + 1]));
  const shared = new Set();
  for (const e of e1) { const [a, b] = e.split('>'); if (e2.has(`${b}>${a}`)) { shared.add(e); shared.add(`${b}>${a}`); } }
  if (!shared.size) return null;
  const next = new Map(); const pts = new Map();
  const add = (r) => { for (let i = 0; i + 1 < r.length; i += 1) { const e = ek(r[i], r[i + 1]); if (shared.has(e)) continue; const k = key(r[i]); if (next.has(k)) return false; next.set(k, r[i + 1]); pts.set(k, r[i]); } return true; };
  if (!add(r1) || !add(r2)) return null;
  const start = pts.keys().next().value;
  const out = [pts.get(start)]; let k = start; const seen = new Set([k]);
  for (;;) {
    const n = next.get(k); if (!n) return null;
    const nk = key(n);
    if (nk === start) { out.push(pts.get(start)); break; }
    if (seen.has(nk)) return null;
    seen.add(nk); out.push(n); k = nk;
  }
  return out.length - 1 === next.size ? out : null; // un solo anello che usa tutti i lati rimasti
}

/** Unisce ripetutamente i pezzi esterni (senza buchi) di un MultiPolygon. Restituisce { polys, merged }. */
export function mergePolys(polys) {
  let cur = polys.map((p) => p); let merged = 0; let again = true;
  while (again) {
    again = false;
    outer: for (let i = 0; i < cur.length; i += 1) for (let j = i + 1; j < cur.length; j += 1) {
      if (cur[i].length !== 1 || cur[j].length !== 1) continue; // solo pezzi senza buchi
      const m = mergeRings(cur[i][0], cur[j][0]);
      if (m) { cur = cur.filter((_, x) => x !== i && x !== j); cur.unshift([m]); merged += 1; again = true; break outer; }
    }
  }
  return { polys: cur, merged };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const docs = await readProvinceDocs();
  let n = 0;
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  for (const d of docs) {
    for (const f of d.data.features) {
      if (f.geometry.type !== 'MultiPolygon') continue;
      if (only && !f.properties.id.startsWith(only)) continue;
      const { polys, merged } = mergePolys(f.geometry.coordinates);
      if (!merged) continue;
      n += merged; console.log(f.properties.id, `${f.geometry.coordinates.length} -> ${polys.length} pezzi`);
      if (process.argv.includes('--write')) { f.geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }; d.touched = true; }
    }
  }
  console.log(`unioni: ${n}`);
  if (process.argv.includes('--write')) await writeProvinceDocs(docs);
}
