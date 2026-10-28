// Popolazione per provincia: il totale nazionale 1936 (CSV dell'utente, data/population/nazioni_1936.csv) viene DISTRIBUITO sulle
// province madri della nazione. La distribuzione è una scelta di DESIGN, non un dato storico: metà del peso segue il territorio
// ABITABILE (area × densità relativa del terreno, da data/terrain.json) e metà la popolazione del luogo abitato principale di ogni
// provincia (Natural Earth, MODERNA, già usata per i nodi di data/links.json). Entrambe le quote sono compresse (esponente 0,5) per
// non far dominare le province enormi e semivuote né le megalopoli moderne. Il totale nazionale resta esatto.
// LIMITE NOTO: nel repository non c'è una densità per provincia, quindi i singoli valori possono essere lontani dal vero di un
// fattore 5-10 (province enormi e semivuote sovrastimate, province con una megalopoli moderna idem). Il totale nazionale è affidabile.
// Solo funzioni PURE, nessun I/O (lo script scripts/build-province-population.js legge e scrive i file).

export const POPULATION_YEAR = 1936;

/** Quota della popolazione dei luoghi abitati (moderna, urbana) nel peso di una provincia; il resto è il territorio abitabile. Scelta di design. */
export const URBAN_WEIGHT = 0.5;
/** Esponente applicato al territorio abitabile (1 = lineare; < 1 attenua le province enormi e semivuote). Scelta di design. */
export const AREA_POWER = 0.5;
/** Esponente applicato alla popolazione dei luoghi abitati prima di pesarla (1 = lineare; < 1 comprime le megalopoli moderne). Scelta di design. */
export const URBAN_POWER = 0.5;

/** Densità relativa per tipo di terreno (1 = pianura). Valori di DESIGN, non misure: servono solo a non popolare deserti e tundre come pianure. */
export const TERRAIN_DENSITY = Object.freeze({ pianura: 1, collina: 0.7, foresta: 0.4, palude: 0.3, montagna: 0.25, deserto: 0.03, tundra: 0.03 });
/** Densità usata quando una provincia non ha il terreno (città-provincia, casi senza dato). */
export const DEFAULT_DENSITY = 0.5;

/** Densità media di una provincia dalle frazioni di terreno ({classe: quota}); DEFAULT_DENSITY se mancano o sono sconosciute. */
export function habitableFactor(fractions) {
  const entries = Object.entries(fractions ?? {}).filter(([k, v]) => k in TERRAIN_DENSITY && v > 0);
  const sum = entries.reduce((t, [, v]) => t + v, 0);
  if (sum <= 0) return DEFAULT_DENSITY;
  return entries.reduce((t, [k, v]) => t + (v / sum) * TERRAIN_DENSITY[k], 0);
}

/**
 * Nome del paese nel CSV → id proprietario del repository. Corrispondenze NON ovvie:
 *  - Vietnam → INDO: nel repository l'Indocina francese è Vietnam + Laos + Cambogia, quindi il totale del CSV (solo Vietnam) è
 *    attribuito a tutta l'entità e la sottostima;
 *  - Indonesia → NLD_EI (Indie orientali olandesi); Thailandia → SIA; Giappone → JPN (Corea e Taiwan, a parte, restano senza dato);
 *  - Cina → CHN (il Manciukuo, MAN, resta senza dato: se il totale cinese lo include, CHN è sovrastimata).
 */
export const NATION_TO_OWNER = Object.freeze({
  Italia: 'ITA', 'Stati Uniti': 'USA', 'Regno Unito': 'GBR', Francia: 'FRA', Germania: 'DEU', 'Unione Sovietica': 'USSR',
  Giappone: 'JPN', Cina: 'CHN', India: 'IND', Polonia: 'POL', Spagna: 'ESP', Brasile: 'BRA', Messico: 'MEX', Argentina: 'ARG',
  Canada: 'CAN', Australia: 'AUS', 'Paesi Bassi': 'NLD', Belgio: 'BEL', Svizzera: 'CHE', Svezia: 'SWE', Norvegia: 'NOR',
  Danimarca: 'DNK', Finlandia: 'FIN', Austria: 'AUT', Ungheria: 'HUN', Romania: 'ROM', Bulgaria: 'BGR', Grecia: 'GRC',
  Portogallo: 'PRT', Turchia: 'TUR', Egitto: 'EGY', Sudafrica: 'ZAF', Indonesia: 'NLD_EI', Filippine: 'PHL', Vietnam: 'INDO',
  Thailandia: 'SIA',
});

export const MAPPING_NOTES = Object.freeze({
  INDO: 'il CSV dà il Vietnam, ma nel repository INDO è Vietnam + Laos + Cambogia: totale probabilmente sottostimato per l\'entità',
  CHN: 'il Manciukuo (MAN) e il Tibet (TIB) non hanno dato; se il totale del CSV li include, CHN è sovrastimata',
  JPN: 'solo il Giappone metropolitano; Corea (KOR) e Taiwan (TWN) senza dato',
  ITA: 'totale metropolitano (censimento 1936); Libia e Somalia italiane senza dato',
  NLD_EI: 'Indonesia del CSV = Indie orientali olandesi',
  SIA: 'Thailandia del CSV = Siam',
});

/**
 * Ripartisce `total` (intero) in parti intere proporzionali a `weights` (> 0) con il metodo del resto maggiore:
 * la somma è ESATTAMENTE `total`; a parità di resto vince l'indice più basso (risultato deterministico).
 */
export function distribute(total, weights) {
  if (!Number.isInteger(total) || total < 0) throw new RangeError('distribute: total deve essere un intero >= 0');
  if (weights.length === 0) throw new RangeError('distribute: nessun peso');
  if (weights.some((w) => !(w > 0))) throw new RangeError('distribute: i pesi devono essere > 0');
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const base = exact.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - base[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k += 1, left -= 1) base[order[k][1]] += 1;
  return base;
}

/** Righe del CSV → { totals: {owner: n}, errors }. Il CSV: nazione, anno, popolazione_stimata, fonte. */
export function nationalTotals(rows) {
  const errors = [];
  const totals = {};
  for (const r of rows) {
    const owner = NATION_TO_OWNER[r.nazione];
    if (!owner) { errors.push(`popolazione: paese "${r.nazione}" senza corrispondenza in NATION_TO_OWNER`); continue; }
    if (Number(r.anno) !== POPULATION_YEAR) errors.push(`popolazione: ${r.nazione} ha anno ${r.anno}, atteso ${POPULATION_YEAR}`);
    const n = Number(r.popolazione_stimata);
    if (!Number.isInteger(n) || n <= 0) { errors.push(`popolazione: ${r.nazione} ha un totale non valido (${r.popolazione_stimata})`); continue; }
    if (owner in totals) errors.push(`popolazione: ${r.nazione} compare due volte`);
    totals[owner] = n;
  }
  return { totals, errors };
}

/**
 * Distribuisce i totali nazionali sulle province madri.
 * rows: righe del CSV; pieces: [{ id, owner, mother, habitableKm2 }] (tutti i pezzi, sponde incluse; area × densità del terreno);
 * piecePop: popolazione moderna dei luoghi abitati per pezzo (stesso ordine di `pieces`, 0 se nessuno). Ritorna { byProvince, totals, errors, noProvinces }.
 */
export function buildProvincePopulation({ rows, pieces, piecePop, urbanWeight = URBAN_WEIGHT, urbanPower = URBAN_POWER, areaPower = AREA_POWER }) {
  const { totals, errors } = nationalTotals(rows);
  const byMother = new Map();
  pieces.forEach((p, i) => {
    const m = byMother.get(p.mother) ?? { id: p.mother, owner: p.owner, area: 0, pop: 0 };
    m.area += p.habitableKm2 > 0 ? p.habitableKm2 : 0;
    m.pop += piecePop?.[i] > 0 ? piecePop[i] : 0;
    byMother.set(p.mother, m);
  });
  const byOwner = new Map();
  for (const m of byMother.values()) (byOwner.get(m.owner) ?? byOwner.set(m.owner, []).get(m.owner)).push(m);

  const byProvince = {};
  const noProvinces = [];
  for (const owner of Object.keys(totals).sort()) {
    const list = byOwner.get(owner);
    if (!list) { noProvinces.push(owner); continue; }
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const areaSum = list.reduce((s, m) => s + m.area ** areaPower, 0);
    const popSum = list.reduce((s, m) => s + m.pop ** urbanPower, 0);
    const weights = list.map((m) => {
      const a = areaSum > 0 ? (m.area ** areaPower) / areaSum : 1 / list.length;
      const p = popSum > 0 ? (m.pop ** urbanPower) / popSum : a; // nessun luogo abitato noto: si usa solo l'area
      return (1 - urbanWeight) * a + urbanWeight * p || 1e-12;
    });
    const parts = distribute(totals[owner], weights);
    list.forEach((m, i) => { byProvince[m.id] = { population: parts[i] }; });
  }
  return { byProvince, totals, errors, noProvinces };
}
