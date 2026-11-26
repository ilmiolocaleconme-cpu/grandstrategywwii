// Settori delle grandi città (25/11/2026, richiesta dell'utente: come in Fronte 1936). TOLTI il 26/11/2026 (`--annulla`):
// con le divisioni le città a quartieri erano ingiocabili e le postazioni non si potevano toccare. Non rieseguire senza
// prima risolvere selezione e movimento nelle zone piccole.
// Divide le zone urbane di Mosca,
// Leningrado e Stalingrado di data/citta_grandi.json in settori con nome, ognuno una zona vera (nodo di movimento,
// combattimento per zona). Dati dei settori: data/sources/settori_citta.json (nomi e centri da Fronte 1936).
//
//   node scripts/build-city-sectors.js
//   poi: node scripts/build-city-links.js && node scripts/build-province-industry.js && node scripts/build-deployment.js
//
// Metodo: ogni parte attuale della città (divisa dal fiume) si divide fra i centri dei settori che le cadono dentro, con celle
// di Voronoi in km (taglio del poligono con i semipiani). Una parte senza centri resta una zona sola (nome da `riva`).
// Idempotente: le parti originali sono salvate in data/sources/settori_citta_parti.json alla prima esecuzione.
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);
const readJson = async (n) => JSON.parse(await readFile(dataUrl(n), 'utf8'));
const exists = async (n) => access(dataUrl(n)).then(() => true, () => false);

const R = 6371.0088;
const toRad = (d) => (d * Math.PI) / 180;

/** Taglio di Sutherland-Hodgman di un anello col semipiano a·p <= c (coordinate locali in km). */
function clipRing(ring, a, c) {
  const out = [];
  const inside = (p) => a[0] * p[0] + a[1] * p[1] <= c + 1e-12;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const pin = inside(p);
    const qin = inside(q);
    if (pin) out.push(p);
    if (pin !== qin) {
      const dp = a[0] * p[0] + a[1] * p[1] - c;
      const dq = a[0] * q[0] + a[1] * q[1] - c;
      const t = dp / (dp - dq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

const ringArea = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const inGeom = (g, x, y) => polysOf(g).some((poly) => poly.reduce((n, r) => n + (inRing(x, y, r) ? 1 : 0), 0) % 2 === 1);

/** Divide la geometria fra i semi (lon/lat): una geometria (o null) per seme. */
export function voronoiSplit(geometry, seeds) {
  const lat0 = seeds.reduce((s, p) => s + p[1], 0) / seeds.length;
  const kx = R * toRad(1) * Math.cos(toRad(lat0));
  const ky = R * toRad(1);
  const fwd = ([lon, lat]) => [lon * kx, lat * ky];
  const back = ([x, y]) => [Math.round((x / kx) * 1e6) / 1e6, Math.round((y / ky) * 1e6) / 1e6];
  const S = seeds.map(fwd);
  return S.map((s, i) => {
    const polys = [];
    for (const poly of polysOf(geometry)) {
      const rings = [];
      for (const [ri, ring] of poly.entries()) {
        let r = ring.slice(0, -1).map(fwd);
        for (let j = 0; j < S.length && r.length; j += 1) {
          if (j === i) continue;
          const t = S[j];
          const a = [t[0] - s[0], t[1] - s[1]];
          const c = (t[0] * t[0] + t[1] * t[1] - s[0] * s[0] - s[1] * s[1]) / 2;
          r = clipRing(r, a, c);
        }
        if (r.length >= 3 && ringArea(r) > 1e-4) {
          const ll = r.map(back);
          ll.push(ll[0]);
          rings.push(ll);
        } else if (ri === 0) break; // anello esterno vuoto: il pezzo non tocca la cella
      }
      if (rings.length) polys.push(rings);
    }
    if (!polys.length) return null;
    return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
  });
}

/** Area in km² (anelli con buchi, proiezione locale). */
export function areaKm2(g) {
  let a = 0;
  for (const poly of polysOf(g)) {
    const lat0 = poly[0].reduce((s, p) => s + p[1], 0) / poly[0].length;
    const kx = R * toRad(1) * Math.cos(toRad(lat0));
    const ky = R * toRad(1);
    poly.forEach((r, i) => { const v = ringArea(r.map(([x, y]) => [x * kx, y * ky])); a += i ? -v : v; });
  }
  return a;
}

/** Rimette le zone di prima (parti del fiume) al posto dei settori. */
export async function annulla() {
  const parti = (await readJson('sources/settori_citta_parti.json')).features;
  const ids = new Set(parti.map((f) => f.properties.cittaId));
  const file = await readJson('citta_grandi.json');
  const out = [];
  let fatto = false;
  for (const f of file.features) {
    if (!ids.has(f.properties.cittaId)) { out.push(f); continue; }
    if (!fatto) { out.push(...parti); fatto = true; }
  }
  file.features = out;
  await writeFile(dataUrl('citta_grandi.json'), `${JSON.stringify(file)}\n`);
  console.log(`settori tolti: ${parti.length} zone di prima rimesse`);
}

export async function main() {
  if (process.argv.includes('--annulla')) return annulla();
  const src = await readJson('sources/settori_citta.json');
  const file = await readJson('citta_grandi.json');
  const ids = new Set(src.citta.map((c) => c.cittaId));
  const PARTI = 'sources/settori_citta_parti.json';
  if (!(await exists(PARTI))) {
    const parti = file.features.filter((f) => ids.has(f.properties.cittaId));
    await writeFile(dataUrl(PARTI), `${JSON.stringify({ schema: 'settori-citta-parti-v1', nota: 'zone urbane prima dei settori (scripts/build-city-sectors.js)', features: parti })}\n`);
  }
  const originali = (await readJson(PARTI)).features;
  const nuove = new Map();
  for (const citta of src.citta) {
    const parti = originali.filter((f) => f.properties.cittaId === citta.cittaId);
    const assegnati = new Map(parti.map((p) => [p.properties.id, []]));
    for (const [nome, lon, lat] of citta.settori) {
      // il centro può cadere in un buco della zona (parchi: Sokol'niki): allora vale la parte più vicina
      const vicina = (p) => Math.min(...polysOf(p.geometry).flatMap((poly) => poly[0].map(([x, y]) => Math.hypot((x - lon) * Math.cos(toRad(lat)), y - lat))));
      const dentro = parti.find((p) => inGeom(p.geometry, lon, lat)) ?? [...parti].sort((a, b) => vicina(a) - vicina(b))[0];
      assegnati.get(dentro.properties.id).push([nome, lon, lat]);
    }
    const zone = [];
    for (const p of parti) {
      const semi = assegnati.get(p.properties.id);
      const pezzi = semi.length ? voronoiSplit(p.geometry, semi.map(([, x, y]) => [x, y])) : [p.geometry];
      const nomi = semi.length ? semi.map(([n]) => n) : [citta.riva?.[p.properties.id] ?? p.properties.name];
      pezzi.forEach((g, k) => {
        if (!g) { console.warn(`${citta.nome}: settore ${nomi[k]} senza area, saltato`); return; }
        zone.push({ geometry: g, settore: nomi[k], partiFiume: p.properties.id, base: p.properties });
      });
    }
    // ordine: il settore principale per primo (porta il nome e la stella della capitale), poi nell'ordine della fonte
    const ordine = (z) => (z.settore === citta.principale ? -1 : citta.settori.findIndex(([n]) => n === z.settore) + (citta.settori.some(([n]) => n === z.settore) ? 0 : 1000));
    zone.sort((a, b) => ordine(a) - ordine(b));
    nuove.set(citta.cittaId, zone.map((z, i) => {
      const id = `${citta.cittaId}_P${i + 1}`;
      const { id: _old, name: _n, parti: _p, areaKm2: _a, ...resto } = z.base;
      return {
        type: 'Feature',
        id,
        properties: {
          id,
          name: `${citta.nome} – ${z.settore}`,
          ...resto,
          parti: zone.length,
          settore: z.settore,
          principale: z.settore === citta.principale,
          partiFiume: z.partiFiume,
          areaKm2: Math.round(areaKm2(z.geometry) * 10) / 10,
          source: `${resto.source}; settori da Fronte 1936 (data/sources/settori_citta.json), celle di Voronoi: ipotesi`,
        },
        geometry: z.geometry,
      };
    }));
    console.log(`${citta.nome}: ${zone.length} zone (${parti.length} parti del fiume)`);
  }
  const out = [];
  const fatte = new Set();
  for (const f of file.features) {
    const c = f.properties.cittaId;
    if (!ids.has(c)) { out.push(f); continue; }
    if (fatte.has(c)) continue;
    fatte.add(c);
    out.push(...nuove.get(c));
  }
  file.features = out;
  await writeFile(dataUrl('citta_grandi.json'), `${JSON.stringify(file)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
