// Toglie le «sponde» troppo piccole delle province divise lungo i fiumi: una sponda sotto la soglia (km²) non è una
// provincia ma una scheggia (isolotti, lembi oltre il fiume). Ogni scheggia viene FUSA nella sponda sorella con cui
// confina di più (o, se non confina con nessuna, nella più vicina, come parte staccata): il territorio non cambia e non
// restano buchi. Se di una provincia resta una sola sponda, torna provincia intera (id e nome della madre).
//
//   node scripts/merge-small-sponde.js --dry            (stampa cosa farebbe, non scrive nulla)
//   node scripts/merge-small-sponde.js [--min=200] [--whole=P_BGR_SOFIA,...]   (--whole: queste province tornano intere, qualunque sia l'area delle sponde; scrive data/provinces/*.json, data/sources/citta_base.json, data/crossings.json)
//
// Dopo: node scripts/build-cities.js, npm run build:adjacency, build:sea, build:labels, build:links.
// Idempotente: una seconda esecuzione non trova più sponde sotto la soglia.
// Non tocca le province che non sono sponde (Gibraltar, Lussemburgo, le città a parte...).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pointInPolygon, signedArea } from '../src/data/polyclip.js';
import { ringKm2 } from '../src/data/splitline.js';

export const MIN_SPONDA_KM2 = 200;
const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
// vertici uguali SOLO se identici: i confini condivisi dei file usano gli stessi numeri (tests/province_files.test.js, spain.test.js);
// agganciare «entro 1 m» spezzerebbe i grappoli di vertici quasi coincidenti e lascerebbe fessure
const key = (p) => `${p[0]},${p[1]}`;
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const geomOf = (polys) => (polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys });

/** Area in km² di una geometria (anelli esterni meno i buchi). */
export function areaKm2(geom) {
  return polysOf(geom).reduce((s, p) => s + p.reduce((a, r, i) => a + (i === 0 ? 1 : -1) * ringKm2(r), 0), 0);
}

const open = (ring) => {
  const out = ring.slice();
  if (out.length > 1 && key(out[0]) === key(out.at(-1))) out.pop();
  return out;
};

/** Lati orientati (esterni antiorari, buchi orari) di tutti gli anelli di una geometria: [{ a, b, ka, kb }]. */
function edgesOf(geom) {
  const edges = [];
  for (const poly of polysOf(geom)) {
    poly.forEach((ring0, i) => {
      let ring = open(ring0);
      const ccw = signedArea(ring) > 0;
      if (ccw !== (i === 0)) ring = ring.slice().reverse();
      for (let k = 0; k < ring.length; k += 1) {
        const a = ring[k]; const b = ring[(k + 1) % ring.length];
        const ka = key(a); const kb = key(b);
        if (ka !== kb) edges.push({ a, b, ka, kb });
      }
    });
  }
  return edges;
}

/** Quanti lati i due contorni hanno in comune (uguali o opposti, vertici identici). */
export function sharedEdges(g1, g2) {
  const set = new Set();
  for (const e of edgesOf(g1)) set.add(e.ka < e.kb ? `${e.ka}#${e.kb}` : `${e.kb}#${e.ka}`);
  let n = 0;
  for (const e of edgesOf(g2)) if (set.has(e.ka < e.kb ? `${e.ka}#${e.kb}` : `${e.kb}#${e.ka}`)) n += 1;
  return n;
}

/**
 * Unisce due geometrie che confinano: i lati comuni (percorsi in verso opposto) si annullano, i lati rimasti si
 * ricuciono in anelli. Ritorna null se non si riesce (nessun lato comune o la ricucitura non torna): chi chiama
 * allora accoda le parti come MultiPolygon.
 */
export function stitch(g1, g2) {
  const live = new Map();
  let cancelled = 0;
  for (const e of [...edgesOf(g1), ...edgesOf(g2)]) {
    const back = `${e.kb}>${e.ka}`;
    if (live.has(back)) { live.delete(back); cancelled += 1; } else live.set(`${e.ka}>${e.kb}`, e);
  }
  if (cancelled === 0) return null;
  const from = new Map();
  for (const e of live.values()) (from.get(e.ka) ?? from.set(e.ka, []).get(e.ka)).push(e);
  const used = new Set();
  const rings = [];
  for (const start of live.values()) {
    if (used.has(start)) continue;
    const ring = [];
    let e = start;
    let guard = 0;
    while (e && !used.has(e) && guard < 1e6) {
      used.add(e); ring.push(e.a); guard += 1;
      if (e.kb === start.ka) break;
      e = (from.get(e.kb) ?? []).find((x) => !used.has(x));
    }
    if (ring.length < 3 || ring.length === 0) return null;
    rings.push(ring);
  }
  const outers = []; const holes = [];
  for (const r of rings) {
    const a = signedArea(r);
    if (ringKm2(r) < 0.02) return null; // una cucitura che non torna (vertici quasi uguali): meglio non fondere i contorni
    (a > 0 ? outers : holes).push(r);
  }
  if (outers.length === 0) return null;
  const polys = outers.map((o) => [[...o, o[0]]]);
  for (const h of holes) {
    const host = outers.findIndex((o) => pointInPolygon(h[0][0], h[0][1], [o]));
    if (host < 0) return null;
    polys[host].push([...h, h[0]]);
  }
  const out = geomOf(polys);
  const want = areaKm2(g1) + areaKm2(g2);
  return Math.abs(areaKm2(out) - want) <= Math.max(0.5, want * 1e-3) ? out : null;
}

/** Distanza minima (gradi) tra i vertici di due geometrie, a campione. */
function gap(g1, g2) {
  let best = Infinity;
  const pts = (g) => polysOf(g).flatMap((p) => p[0]);
  const a = pts(g1); const b = pts(g2);
  const sa = Math.max(1, Math.floor(a.length / 300)); const sb = Math.max(1, Math.floor(b.length / 300));
  for (let i = 0; i < a.length; i += sa) for (let j = 0; j < b.length; j += sb) best = Math.min(best, Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]));
  return best;
}

/**
 * Fonde le sponde sotto `minKm2` di ogni provincia divisa. `features` = le province di UN file (modificate sul posto).
 * Ritorna { features, idMap (id vecchio → id nuovo), letterMap (madre|numero → numero nuovo o null se la provincia è tornata intera), log }.
 */
export function mergeSmall(features, minKm2 = MIN_SPONDA_KM2, whole = new Set()) {
  const idMap = new Map();
  const letterMap = new Map();
  const log = [];
  const groups = new Map();
  for (const f of features) if (f.properties.sponda_fiume === true) (groups.get(f.properties.parentProvince) ?? groups.set(f.properties.parentProvince, []).get(f.properties.parentProvince)).push(f);
  const removed = new Set();
  for (const [mother, pieces0] of groups) {
    let pieces = pieces0.slice();
    for (;;) {
      if (pieces.length < 2) break;
      const areas = new Map(pieces.map((p) => [p, areaKm2(p.geometry)]));
      const limit = whole.has(mother) ? Infinity : minKm2; // province volute intere: si fonde fino a una sola sponda
      const small = pieces.filter((p) => areas.get(p) < limit).sort((a, b) => areas.get(a) - areas.get(b))[0];
      if (!small) break;
      const sibs = pieces.filter((p) => p !== small);
      const ranked = sibs.map((s) => ({ s, shared: sharedEdges(small.geometry, s.geometry), d: gap(small.geometry, s.geometry) })).sort((a, b) => b.shared - a.shared || a.d - b.d);
      const target = ranked[0].s;
      const merged = ranked[0].shared > 0 ? stitch(small.geometry, target.geometry) : null;
      target.geometry = merged ?? geomOf([...polysOf(target.geometry), ...polysOf(small.geometry)]);
      idMap.set(small.properties.id, target.properties.id);
      letterMap.set(`${mother}|${small.properties.sponda}`, target.properties.sponda);
      log.push({ id: small.properties.id, km2: Math.round(areas.get(small)), into: target.properties.id, how: merged ? 'unita' : ranked[0].shared > 0 ? 'accodata (ricucitura non riuscita)' : 'accodata (staccata)' });
      removed.add(small);
      pieces = sibs;
    }
    if (pieces.length === 1 && pieces0.length > 1) { // una sola sponda rimasta: torna la provincia intera
      const last = pieces[0];
      const oldId = last.properties.id;
      const { sponda_fiume: _s, sponda: _n, parentProvince: _p, ...rest } = last.properties;
      const name = rest.name.replace(/ \(sponda [^)]*\)$/, '');
      last.properties = { ...rest, id: mother, name, nameLocal: rest.nameLocal.replace(/ \(sponda [^)]*\)$/, '') };
      last.id = mother;
      for (const [k, v] of idMap) if (v === oldId) idMap.set(k, mother);
      idMap.set(oldId, mother);
      for (const k of [...letterMap.keys()]) if (k.startsWith(`${mother}|`)) letterMap.set(k, null);
      letterMap.set(`${mother}|${_n}`, null);
    }
  }
  return { features: features.filter((f) => !removed.has(f)), idMap, letterMap, log };
}

// stesso aspetto dei file di dati (json di Python con ensure_ascii=False: ", " e ": ")
function dump(v) {
  if (Array.isArray(v)) return `[${v.map(dump).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${dump(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes('--dry');
  const min = Number(process.argv.find((a) => a.startsWith('--min='))?.slice(6) ?? MIN_SPONDA_KM2);
  const whole = new Set((process.argv.find((a) => a.startsWith('--whole='))?.slice(8) ?? '').split(',').filter(Boolean));
  const names = (await readdir(dataUrl('provinces/'))).filter((n) => n.endsWith('.json') && n !== '_meta.json').sort();
  const allIds = new Map(); const allLetters = new Map(); const log = [];
  let before = 0; let after = 0;
  for (const n of names) {
    const text = await readFile(dataUrl(`provinces/${n}`), 'utf8');
    const file = JSON.parse(text);
    before += file.features.length;
    const r = mergeSmall(file.features, min, whole);
    after += r.features.length;
    for (const [k, v] of r.idMap) allIds.set(k, v);
    for (const [k, v] of r.letterMap) allLetters.set(k, v);
    log.push(...r.log.map((l) => ({ ...l, file: n })));
    if (r.log.length && !dry) await writeFile(dataUrl(`provinces/${n}`), dump({ ...file, features: r.features }) + (text.endsWith('\n') ? '\n' : ''));
  }
  const how = {};
  for (const l of log) how[l.how] = (how[l.how] ?? 0) + 1;
  console.log(`soglia ${min} km²: ${before} province → ${after} (${log.length} sponde fuse, ${JSON.stringify(how)})`);
  if (dry) for (const l of log.slice(0, 15)) console.log(' ', l.file, l.id, `${l.km2} km²`, '→', l.into, `[${l.how}]`);
  if (!dry && log.length) {
    // città: la lettera della sponda fusa passa a quella della sponda che l'ha assorbita (o sparisce se la provincia è intera)
    const base = JSON.parse(await readFile(dataUrl('sources/citta_base.json'), 'utf8'));
    let moved = 0;
    for (const f of base.features) {
      const p = f.properties;
      if (!p.sponda) continue;
      const idx = p.sponda.charCodeAt(0) - 64;
      const k = `${p.parentProvince}|${idx}`;
      if (!allLetters.has(k)) continue;
      const to = allLetters.get(k);
      if (to === null) delete p.sponda; else p.sponda = String.fromCharCode(64 + Number(to));
      moved += 1;
    }
    await writeFile(dataUrl('sources/citta_base.json'), `${dump(base)}\n`);
    console.log(`data/sources/citta_base.json: ${moved} parti di città aggiornate`);
    // attraversamenti: le rive puntano alla provincia che ha assorbito la sponda
    let cr = await readFile(dataUrl('crossings.json'), 'utf8');
    let n = 0;
    for (const [from, to] of allIds) { const q = `"${from}"`; if (cr.includes(q)) { n += cr.split(q).length - 1; cr = cr.split(q).join(`"${to}"`); } }
    await writeFile(dataUrl('crossings.json'), cr);
    console.log(`data/crossings.json: ${n} riferimenti aggiornati`);
  }
}
