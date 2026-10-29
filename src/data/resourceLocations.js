// Luoghi delle risorse: DOVE si trovano le risorse (non quanto si estrae). Dal CSV di riferimento fornito dall'utente
// (data/resources/risorse_riferimento.csv) e da righe aggiunte da Claude (data/resources/risorse_aggiunte.csv).
// Qualità sempre `reference`: serve a posizionare le risorse sulle province, non è un dato storico verificato. Quantità, capacità di
// estrazione e massimi arriveranno col sistema economico. Funzioni PURE: ricevono il testo dei CSV, non leggono file.
import { parseCsv } from './csv.js';

export const LOCATION_HEADER = Object.freeze(['location_id', 'resource_id', 'country_id', 'country_text', 'place_text', 'period', 'quantity_value', 'quantity_min', 'quantity_max', 'quantity_text', 'unit', 'quantity_t', 'quantity_t_min', 'quantity_t_max', 'unit_factor', 'precision', 'kind', 'control_text', 'status_text', 'quality', 'source', 'review_flags', 'source_note', 'review_note']);
export const LINK_HEADER = Object.freeze(['location_id', 'province_id', 'basis']);
export const PRECISIONS = Object.freeze(['exact', 'approximate', 'range', 'approximate_range', 'series', 'qualitative']);
export const KINDS = Object.freeze(['deposit', 'plant', 'national_total', 'aggregate', 'trade_flow']);
/** Prodotti industriali (non risorse naturali): le loro righe sono siti di impianto (`plant`), mai giacimenti (`deposit`). Deciso in chat, 29/10/2026. */
export const PLANT_RESOURCE_IDS = Object.freeze(['aluminium']);
export const SOURCES = Object.freeze(['user_csv', 'claude_note']);
export const QUALITY_REFERENCE = 'reference';
export const LINK_BASIS = 'place_name_approximate';

/** Risorsa del CSV → id in data/resources.json. */
export const RESOURCE_IDS = Object.freeze({
  Carbone: 'coal', Petrolio: 'oil', Ferro: 'iron_ore', Bauxite: 'bauxite', Alluminio: 'aluminium', 'Gomma naturale': 'rubber', Frumento: 'wheat',
  Tungsteno: 'tungsten', Zolfo: 'sulphur', Stagno: 'tin', Manganese: 'manganese', Cromo: 'chromium', Nichel: 'nickel', Cobalto: 'cobalt',
  Molibdeno: 'molybdenum', Vanadio: 'vanadium', Antimonio: 'antimony', Mercurio: 'mercury', Uranio: 'uranium',
});
/** Paese del CSV → id in data/political_1936.json (null = nessuna provincia nel repository). Il Saar è territorio tedesco dal 1935. */
export const COUNTRY_IDS = Object.freeze({
  Germania: 'DEU', Saar: 'DEU', 'Regno Unito': 'GBR', URSS: 'USSR', Francia: 'FRA', Polonia: 'POL', Belgio: 'BEL', 'Paesi Bassi': 'NLD', Turchia: 'TUR', Italia: 'ITA',
  Romania: 'ROM', Egitto: 'EGY', Cecoslovacchia: 'CZE', Ungheria: 'HUN', Grecia: 'GRC', Spagna: 'ESP', Bulgaria: 'BGR', Austria: 'AUT', Svezia: 'SWE', Norvegia: 'NOR',
  Jugoslavia: 'YUG', Svizzera: 'CHE', Portogallo: 'PRT', 'Marocco francese': 'MAR', 'Algeria francese': 'ALG',
  'Stati Uniti': 'USA', Canada: 'CAN', Terranova: 'NFL', Malaya: 'MAL', 'Indie orientali olandesi': 'NLD_EI', 'Congo belga': 'COD', Cina: 'CHN', Manciukuo: 'MAN',
  'Birmania britannica': 'BUR', Bolivia: 'BOL', Messico: 'MEX', 'Guyana olandese / Suriname': 'SUR', 'India britannica': 'IND', 'India britannica e Birmania': 'IND',
  'Rhodesia meridionale': 'ZIM', Sudafrica: 'ZAF', Brasile: 'BRA', Giappone: 'JPN', Cile: 'CHL', Cuba: 'CUB', 'Sierra Leone': 'SLE', "Costa d'Oro britannica": 'GHA',
  Peru: 'PER', 'Arabia Saudita': 'SAU', Argentina: 'ARG', Colombia: 'COL', Ecuador: 'ECU', Iran: 'IRN', Iraq: 'IRQ', Venezuela: 'VEN', 'Nigeria britannica': 'NGA',
  'Siam / Thailandia': 'SIA', Corea: 'KOR', Filippine: 'PHL',
});
const AGGREGATE_COUNTRIES = new Set(['Mondo', 'Germania e territori occupati']);
const NATIONAL_TOTAL_PLACES = new Set(['Impianti del Reich', 'Produzione nazionale']);

/**
 * Unità del CSV → tonnellate metriche (deciso in chat, 29/10/2026: tutto in tonnellate metriche, conversione esplicita).
 * `factor` = tonnellate metriche per unità (barili/giorno: per barile al giorno, annualizzato con 365 giorni). `quality`: `exact` per
 * definizione, `approximate` se dipende da una densità o da un prodotto. Unità non elencata = nessuna conversione (la quantità resta senza t).
 */
export const UNIT_TO_TONNES = Object.freeze({
  't metriche': { factor: 1, quality: 'exact', note: 'già in tonnellate metriche' },
  't metriche/anno': { factor: 1, quality: 'exact', note: 'già in tonnellate metriche annue' },
  'long ton': { factor: 1.016047, quality: 'exact', note: '1 long ton = 1016,0469 kg' },
  bushel: { factor: 0.0272155, quality: 'approximate', note: 'bushel USA di frumento = 60 lb = 27,2155 kg' },
  'barili/giorno': { factor: 0.136 * 365, quality: 'approximate', note: 'greggio ≈ 0,136 t per barile (densità media, varia 0,13-0,14); ×365 giorni per l\'anno' },
});

/** Quantità in tonnellate metriche per un valore e un'unità: null se l'unità è vuota o sconosciuta o il valore manca (mai un numero inventato). */
const tonnesCell = (value, unit) => toTonnes(value, unit) ?? '';

export function toTonnes(value, unit) {
  const u = UNIT_TO_TONNES[unit];
  if (!u || value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * u.factor * 1000) / 1000;
}

/** Quantità del CSV → { precision, value, min, max }. Testo non numerico = `qualitative`; nessun numero inventato. */
export function classifyQuantity(text) {
  const t = String(text ?? '').trim();
  let m;
  if (/^\d+$/.test(t)) return { precision: 'exact', value: Number(t), min: null, max: null };
  if ((m = /^Circa (\d+)$/.exec(t))) return { precision: 'approximate', value: Number(m[1]), min: null, max: null };
  if ((m = /^(\d+)-(\d+)$/.exec(t))) return { precision: 'range', value: null, min: Number(m[1]), max: Number(m[2]) };
  if ((m = /^Circa (\d+)-(\d+)$/.exec(t))) return { precision: 'approximate_range', value: null, min: Number(m[1]), max: Number(m[2]) };
  if (/^Circa \d+(;\d+)+$/.test(t)) return { precision: 'series', value: null, min: null, max: null };
  return { precision: 'qualitative', value: null, min: null, max: null };
}

/** Luoghi di una cella `provincia_o_giacimento`: separati da virgola, punto e virgola o due punti. */
export function splitPlaces(text) {
  return String(text).split(/[,;:]/).map((s) => s.trim()).filter(Boolean);
}

function kindOf(row) {
  if (AGGREGATE_COUNTRIES.has(row.nazione_o_territorio)) return 'aggregate';
  if (/^(Export|Quote)/.test(row.provincia_o_giacimento)) return 'trade_flow';
  if (NATIONAL_TOTAL_PLACES.has(row.provincia_o_giacimento)) return 'national_total';
  return PLANT_RESOURCE_IDS.includes(RESOURCE_IDS[row.risorsa]) ? 'plant' : 'deposit';
}

const matches = (rule, v) => rule === '*' || rule === v;

/**
 * Costruisce { locations, links, unmapped }. raw: righe del CSV di riferimento; added: righe aggiunte (stesso header); notes: location_notes.csv;
 * placeRows: place_provinces.csv. `unmapped` elenca i luoghi di un giacimento senza provincia nella tabella (da completare a mano).
 */
export function buildResourceLocations({ rawCsv, addedCsv, notesCsv, placesCsv }) {
  const parse = (text, name) => parseCsv(text, { name });
  const notes = parse(notesCsv, 'location_notes.csv');
  const places = new Map(parse(placesCsv, 'place_provinces.csv').map((p) => [`${p.country_id}|${p.place_text}`, p.province_ids.split(';').filter(Boolean)]));
  const input = [...parse(rawCsv, 'risorse_riferimento.csv').map((r) => ({ r, source: 'user_csv' })), ...parse(addedCsv, 'risorse_aggiunte.csv').map((r) => ({ r, source: 'claude_note' }))];
  const locations = []; const links = []; const unmapped = [];
  input.forEach(({ r, source }, i) => {
    const id = `RL-${String(i + 1).padStart(4, '0')}`;
    const resource_id = RESOURCE_IDS[r.risorsa];
    if (!resource_id) throw new Error(`risorse: risorsa sconosciuta "${r.risorsa}" (riga ${i + 2})`);
    const kind = kindOf(r);
    const country_id = COUNTRY_IDS[r.nazione_o_territorio] ?? '';
    const q = classifyQuantity(r.produzione_o_capacita);
    const unit = r.unita === '-' ? '' : r.unita;
    const hit = notes.filter((n) => matches(n.resource, r.risorsa) && matches(n.country_text, r.nazione_o_territorio) && matches(n.period, r.periodo));
    locations.push({
      location_id: id, resource_id, country_id, country_text: r.nazione_o_territorio, place_text: r.provincia_o_giacimento, period: r.periodo,
      quantity_value: q.value ?? '', quantity_min: q.min ?? '', quantity_max: q.max ?? '', quantity_text: r.produzione_o_capacita, unit,
      quantity_t: tonnesCell(q.value, unit), quantity_t_min: tonnesCell(q.min, unit), quantity_t_max: tonnesCell(q.max, unit), unit_factor: UNIT_TO_TONNES[unit]?.factor ?? '',
      precision: q.precision, kind, control_text: r.sovranita_o_controllo, status_text: r.stato_1935_45, quality: QUALITY_REFERENCE, source,
      review_flags: [...new Set(hit.map((n) => n.flag))].join(';'), source_note: r.note, review_note: hit.map((n) => n.note).join(' | '),
    });
    if ((kind !== 'deposit' && kind !== 'plant') || !country_id) return;
    const seen = new Set();
    for (const place of splitPlaces(r.provincia_o_giacimento)) {
      const ids = places.get(`${country_id}|${place}`);
      if (!ids) { unmapped.push({ location_id: id, country_id, place }); continue; }
      for (const province_id of ids) if (!seen.has(province_id)) { seen.add(province_id); links.push({ location_id: id, province_id, basis: LINK_BASIS }); }
    }
  });
  return { locations, links, unmapped };
}

/** Controlli sui due CSV generati. Opzioni: resourceIds, countryIds (political_1936), motherIds (province madri). */
export function validateResourceLocations({ locations, links }, { resourceIds, countryIds, motherIds }) {
  const errors = [];
  const ids = new Set();
  for (const l of locations) {
    if (ids.has(l.location_id)) errors.push(`risorse: location_id duplicato ${l.location_id}`);
    ids.add(l.location_id);
    if (!resourceIds.has(l.resource_id)) errors.push(`risorse: ${l.location_id} con risorsa inesistente ${l.resource_id}`);
    if (l.country_id && !countryIds.has(l.country_id)) errors.push(`risorse: ${l.location_id} con paese inesistente ${l.country_id}`);
    if (!PRECISIONS.includes(l.precision)) errors.push(`risorse: ${l.location_id} con precisione sconosciuta "${l.precision}"`);
    if (!KINDS.includes(l.kind)) errors.push(`risorse: ${l.location_id} con tipo sconosciuto "${l.kind}"`);
    if (l.kind === 'deposit' && PLANT_RESOURCE_IDS.includes(l.resource_id)) errors.push(`risorse: ${l.location_id} è un prodotto industriale (${l.resource_id}) classificato come giacimento`);
    if (l.kind === 'plant' && !PLANT_RESOURCE_IDS.includes(l.resource_id)) errors.push(`risorse: ${l.location_id} è un impianto ma ${l.resource_id} non è un prodotto industriale`);
    if (!SOURCES.includes(l.source)) errors.push(`risorse: ${l.location_id} con fonte sconosciuta "${l.source}"`);
    if (l.quality !== QUALITY_REFERENCE) errors.push(`risorse: ${l.location_id} con qualità "${l.quality}" (atteso ${QUALITY_REFERENCE})`);
    if (l.unit !== '' && !UNIT_TO_TONNES[l.unit]) errors.push(`risorse: ${l.location_id} con unità senza conversione in tonnellate "${l.unit}"`);
    for (const [col, src] of [['quantity_t', 'quantity_value'], ['quantity_t_min', 'quantity_min'], ['quantity_t_max', 'quantity_max']]) {
      const expected = toTonnes(l[src] === '' ? null : l[src], l.unit);
      if (String(l[col]) !== String(expected ?? '')) errors.push(`risorse: ${l.location_id} ${col} "${l[col]}" non coincide con la conversione di ${src} (${expected ?? 'nessuna'})`);
    }
    if (l.quantity_value !== '' && !Number.isFinite(Number(l.quantity_value))) errors.push(`risorse: ${l.location_id} con quantità non numerica`);
  }
  const pairs = new Set(); const withLink = new Set();
  for (const k of links) {
    if (!ids.has(k.location_id)) errors.push(`risorse: collegamento a luogo inesistente ${k.location_id}`);
    if (!motherIds.has(k.province_id)) errors.push(`risorse: ${k.location_id} punta a una provincia che non esiste o non è madre (${k.province_id})`);
    const key = `${k.location_id}|${k.province_id}`;
    if (pairs.has(key)) errors.push(`risorse: collegamento duplicato ${key}`);
    pairs.add(key);
    withLink.add(k.location_id);
  }
  for (const l of locations) if ((l.kind === 'deposit' || l.kind === 'plant') && l.country_id && !withLink.has(l.location_id)) errors.push(`risorse: ${l.location_id} (${l.place_text}) senza alcuna provincia`);
  return errors;
}
