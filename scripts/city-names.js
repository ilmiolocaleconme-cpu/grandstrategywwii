// Nomi originali (non italiani) delle città, da Natural Earth 10m populated places (pubblico dominio).
//
//   node scripts/city-names.js --places=<ne_10m_populated_places.geojson>   (crea data/sources/ne_places_citta.json)
//
// Per ogni città (cittaId) cerca il luogo abitato NE: prima per nome (italiano, inglese, ascii o alternativo uguale a un
// nome NE) entro 60 km dal centro, poi, se nessun nome coincide, il più vicino entro 15 km. Il nome originale è nella lingua
// del paese che nel 1936 possedeva la città (tabella LINGUA_PER_NAZIONE); dove NE non ha quel campo si usa NAME.
// build-cities.js legge il sottoinsieme e scrive nameLocal, nameLocalLang e la base del dato su ogni zona.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cyrillicToLatin, greekToLatin } from './translit.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
export const SUBSET_NAMES = 'sources/ne_places_citta.json';

/** Lingua del nome originale per nazione 1936: [codice lingua, campo NE]. Campo null = si usa NAME (di solito già locale). */
export const LINGUA_PER_NAZIONE = {
  DEU: ['de', 'NAME_DE'], AUT: ['de', 'NAME_DE'], LIE: ['de', 'NAME_DE'], DANZIG: ['de', 'NAME_DE'],
  FRA: ['fr', 'NAME_FR'], ESP: ['es', 'NAME_ES'], MAR_ES: ['es', 'NAME_ES'], ITA: ['it', 'NAME_IT'], POL: ['pl', 'NAME_PL'], TUR: ['tr', 'NAME_TR'],
  GRC: ['el', 'NAME_EL'], CYP: ['el', 'NAME_EL'], HUN: ['hu', 'NAME_HU'], NLD: ['nl', 'NAME_NL'], SWE: ['sv', 'NAME_SV'], PRT: ['pt', 'NAME_PT'],
  USSR: ['ru', 'NAME_RU'],
  // protettorati/colonie francesi: nome francese in uso nel 1936; paesi arabi: NAME di NE (alfabeto latino)
  ALG: ['fr', 'NAME_FR'], TUN: ['fr', 'NAME_FR'], MAR: ['fr', 'NAME_FR'],
  EGY: ['ar', null], SYR: ['ar', null], JOR: ['ar', null], LBN: ['ar', null], PAL: ['ar', null], LBA: ['ar', null],
};
// senza campo NE dedicato: NAME. Lingue attese (solo informative): rumeno, serbo-croato/sloveno, bulgaro, ceco, finlandese,
// norvegese, danese, estone, lettone, albanese, irlandese/inglese, islandese, francese/tedesco/italiano (Svizzera), olandese/francese (Belgio)
export const LINGUA_NAME = { ROM: 'ro', YUG: 'sh', BGR: 'bg', CZE: 'cs', FIN: 'fi', NOR: 'no', DNK: 'da', EST: 'et', LVA: 'lv', ALB: 'sq', IRL: 'en', GBR: 'en', ISL: 'is', CHE: 'de', BEL: 'nl' };

// URSS: la lingua originale è quella della repubblica in cui sta la città (paese attuale del luogo NE). Il nome è sempre in
// alfabeto latino: cirillico e greco si traslitterano (scripts/translit.js); per l'arabo e le lingue senza campo NE si usa NAME
// di NE (nome latino, spesso esonimo inglese: limite dichiarato).
const LINGUA_URSS = {
  Russia: ['ru', 'NAME_RU'], Ukraine: ['uk', 'NAME_UK'], Belarus: ['be', 'NAME_RU'], Georgia: ['ka', null], Armenia: ['hy', null], Azerbaijan: ['az', null],
  Uzbekistan: ['uz', null], Kazakhstan: ['kk', null], Kyrgyzstan: ['ky', null], Tajikistan: ['tg', null], Turkmenistan: ['tk', null], Moldova: ['ro', null],
};

// Nomi del 1936 diversi da quelli odierni di Natural Earth (città poi rinominate): inseriti a mano da conoscenza storica,
// quindi sempre da verificare; traslitterati in alfabeto latino. cittaId -> [nome 1936, lingua].
export const NOMI_STORICI = {
  P_USSR_LENINGRADO_CITTA: ['Leningrad', 'ru'], P_USSR_STALINGRADO_CITTA: ['Stalingrad', 'ru'], P_USSR_NIZNIJ_NOVGOROD_CITTA: ['Gorkiy', 'ru'],
  P_USSR_SAMARA_CITTA: ['Kuybyshev', 'ru'], P_USSR_EKATERINBURG_CITTA: ['Sverdlovsk', 'ru'], P_USSR_ORENBURG_CITTA: ['Chkalov', 'ru'],
  P_USSR_PERM_CITTA: ['Molotov', 'ru'], P_USSR_TVER_CITTA: ['Kalinin', 'ru'], P_USSR_NOVOKUZNECK_CITTA: ['Stalinsk', 'ru'],
  P_USSR_STAVROPOL_CITTA: ['Voroshilovsk', 'ru'], P_USSR_VLADIKAVKAZ_CITTA: ['Ordzhonikidze', 'ru'], P_USSR_ALMATY_CITTA: ['Alma-Ata', 'kk'],
  P_USSR_BISKEK_CITTA: ['Frunze', 'ky'], P_USSR_DUSANBE_CITTA: ['Stalinabad', 'ru'], P_USSR_DNIPRO_CITTA: ['Dnipropetrovsk', 'uk'],
  P_USSR_DONEC_K_CITTA: ['Stalino', 'uk'], P_USSR_LUHANS_K_CITTA: ['Voroshylovhrad', 'uk'], P_USSR_KROPYVNYC_KYJ_CITTA: ['Kirovohrad', 'uk'],
};

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Vero se ogni lettera del testo è in alfabeto latino (cifre, spazi e segni ammessi). */
export const isLatin = (t) => typeof t === 'string' && t.length > 0 && /^[\p{Script=Latin}\p{M}\d\s.,'’`ʹʼ()\/&-]+$/u.test(t);

/** Nome originale (sempre in alfabeto latino) da una riga NE e dal proprietario: { nameLocal, lang, basis } */
export function localName(owner, row, cittaId = null) {
  if (cittaId && NOMI_STORICI[cittaId]) return { nameLocal: NOMI_STORICI[cittaId][0], lang: NOMI_STORICI[cittaId][1], basis: 'nome storico 1936 (inserito a mano, traslitterato)' };
  const [lang, field] = (owner === 'USSR' && LINGUA_URSS[row.ADM0NAME]) || LINGUA_PER_NAZIONE[owner] || [LINGUA_NAME[owner] ?? null, null];
  if (field && row[field]) {
    if (isLatin(row[field])) return { nameLocal: row[field], lang, basis: `NE ${field}` };
    if (/[\u0400-\u04FF]/.test(row[field])) return { nameLocal: cyrillicToLatin(row[field], field === 'NAME_UK' ? 'uk' : 'ru'), lang, basis: `NE ${field} traslitterato` };
    if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(row[field])) return { nameLocal: greekToLatin(row[field]), lang, basis: `NE ${field} traslitterato` };
  }
  for (const k of ['NAME', 'NAMEASCII']) if (isLatin(row[k])) return { nameLocal: row[k], lang, basis: `NE ${k}` };
  return { nameLocal: row.NAMEASCII ?? row.NAME, lang, basis: 'NE NAMEASCII' };
}

const centreOf = (g) => {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let x = 0; let y = 0; let n = 0;
  for (const p of polys) for (const [lon, lat] of p[0]) { x += lon; y += lat; n += 1; }
  return [x / n, y / n];
};

export async function main(argv) {
  const placesPath = argv.find((a) => a.startsWith('--places='))?.slice(9);
  if (!placesPath) throw new Error('serve --places=<ne_10m_populated_places.geojson>');
  const places = JSON.parse(await readFile(placesPath, 'utf8')).features;
  const cities = JSON.parse(await readFile(dataUrl('citta_grandi.json'), 'utf8')).features;
  const groups = new Map();
  for (const f of cities) groups.set(f.properties.cittaId, [...(groups.get(f.properties.cittaId) ?? []), f]);
  const out = {};
  let byName = 0; let byDist = 0; let none = 0;
  for (const [cid, parts] of groups) {
    const main = parts[0];
    const [lon, lat] = centreOf(main.geometry);
    const wanted = new Set([norm(main.properties.name.replace(/ (sud|nord|est|ovest)( \d+)?$/, ''))]);
    const dist = (p) => Math.hypot((p.geometry.coordinates[0] - lon) * Math.cos((lat * Math.PI) / 180), p.geometry.coordinates[1] - lat) * 111.2;
    const near = places.map((p) => ({ p, d: dist(p) })).filter((x) => x.d < 60);
    const named = near.filter(({ p }) => [p.properties.NAME, p.properties.NAME_IT, p.properties.NAME_EN, p.properties.NAMEASCII, p.properties.NAMEALT, p.properties.NAMEPAR].some((n) => String(n ?? '').split(/[,;|]/).some((s) => wanted.has(norm(s)))));
    let pick = null;
    let basis = null;
    if (named.length) { pick = named.sort((a, b) => a.d - b.d || b.p.properties.POP_MAX - a.p.properties.POP_MAX)[0]; basis = 'nome'; byName += 1; }
    else {
      const close = near.filter((x) => x.d <= 15).sort((a, b) => a.d - b.d || b.p.properties.POP_MAX - a.p.properties.POP_MAX)[0];
      if (close) { pick = close; basis = 'distanza'; byDist += 1; } else none += 1;
    }
    if (!pick) continue;
    const q = pick.p.properties;
    const keep = {};
    for (const k of Object.keys(q)) if (k === 'NAME' || k === 'NAMEASCII' || k === 'ADM0NAME' || k.startsWith('NAME_')) if (q[k]) keep[k] = q[k];
    out[cid] = { ne: q.NE_ID ?? q.ne_id ?? null, distKm: Math.round(pick.d * 10) / 10, basis, names: keep };
  }
  console.log(`città: ${groups.size}; abbinate per nome: ${byName}; per distanza: ${byDist}; senza luogo NE: ${none}`);
  await writeFile(dataUrl(SUBSET_NAMES), `${JSON.stringify({ schema: 'ne-places-subset-v1', source: 'Natural Earth 10m populated places (ne_10m_populated_places)', license: 'Public Domain (Natural Earth)', note: 'Un luogo NE per città (scripts/city-names.js): serve a build-cities.js per nameLocal.', cities: out })}\n`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
