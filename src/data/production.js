// Produzione storica 1936 per risorsa e territorio (data/resources/production_1936.json), da due CSV dell'utente.
// Solo dati e funzioni PURE. Il valore è in milioni di tonnellate l'anno (Mt/anno), stima dell'utente: NON verificata da fonti primarie.
// Il file «completo» prevale dove si sovrappone al primo; le righe presenti solo nel primo si aggiungono (deciso in chat 26/10/2026).
export const PRODUCTION_SCHEMA = 'production-1936-v1';
/** 1 tonnellata lunga = 1,016047 t metriche → Mt. */
export const LONG_TON_TO_MT = 1.016047e-6;

export const RESOURCE_IDS = Object.freeze({
  Carbone: 'coal', Petrolio: 'oil', 'Minerale di Ferro': 'iron_ore', 'Gomma Naturale': 'rubber', Rame: 'copper', Bauxite: 'bauxite', Zolfo: 'sulphur', Stagno: 'tin',
});

/**
 * Nome della nazione nel CSV → prefisso degli id delle province (`P_<prefisso>_...`) e, se il territorio è solo una parte del prefisso,
 * `scope` = inizio dell'id che le province devono avere. Le righe «Belgio / Congo Belga» (primo file) sono aggregati e si saltano.
 */
export const TERRITORIES = Object.freeze({
  'Stati Uniti': { prefix: 'USA' }, 'Regno Unito': { prefix: 'GBR' }, Germania: { prefix: 'DEU' }, 'Unione Sovietica': { prefix: 'USSR' },
  Francia: { prefix: 'FRA' }, 'Cina (Nazionalista)': { prefix: 'CHN' }, 'India Britannica': { prefix: 'IND' }, 'Unione Sudafricana': { prefix: 'ZAF' },
  Manciukuò: { prefix: 'MAN' }, Canada: { prefix: 'CAN' }, Polonia: { prefix: 'POL' }, Belgio: { prefix: 'BEL' }, Venezuela: { prefix: 'VEN' },
  'Indie Orientali Olandesi': { prefix: 'NLD', scope: 'P_NLD_EI_' }, Iran: { prefix: 'IRN' }, Iraq: { prefix: 'IRQ' },
  'Algeria (Colonia Francese)': { prefix: 'ALG' }, 'Malesia Britannica': { prefix: 'MAL' }, Liberia: { prefix: 'LBR' }, Cile: { prefix: 'CHL' },
  'Rhodesia Settentrionale': { prefix: 'ZAM' }, 'Congo Belga': { prefix: 'COD' }, Giappone: { prefix: 'JPN' }, Ungheria: { prefix: 'HUN' }, Italia: { prefix: 'ITA' },
  Suriname: { prefix: 'SUR' }, Bolivia: { prefix: 'BOL' }, 'Nigeria Britannica': { prefix: 'NGA' }, Siam: { prefix: 'SIA' }, Ceylon: { prefix: 'CEY' }, 'Indocina Francese': { prefix: 'INDO' }, Brasile: { prefix: 'BRA' }, Svezia: { prefix: 'SWE' }, Romania: { prefix: 'ROM' },
  'Stati Uniti (Terranova)': { prefix: 'NFL' }, Australia: { prefix: 'AUS' },
});
const SKIP = new Set(['Belgio / Congo Belga']);

/** Riga del CSV → { resource, territory, prefix, scope?, region, mt, context } (Mt/anno); null se la nazione è un aggregato da saltare. */
function normalize(row, unit) {
  const name = row.Nazione;
  if (SKIP.has(name)) return null;
  const resource = RESOURCE_IDS[row.Risorsa];
  if (!resource) throw new Error(`produzione: risorsa sconosciuta "${row.Risorsa}"`);
  // il ferro canadese di Terranova sta nel prefisso NFL
  const key = name === 'Canada' && /Terranova/i.test(row.Provincia_Regione_Storica ?? row.Regione_Provincia ?? '') ? 'Stati Uniti (Terranova)' : name;
  const t = key === 'Stati Uniti (Terranova)' ? { prefix: 'NFL' } : TERRITORIES[key];
  if (!t) throw new Error(`produzione: nazione sconosciuta "${name}"`);
  const raw = Number(row[unit.column]);
  if (!(raw > 0)) throw new Error(`produzione: valore non valido per ${row.Risorsa}/${name}`);
  return { resource, territory: key === 'Stati Uniti (Terranova)' ? 'Canada (Terranova)' : name, prefix: t.prefix, ...(t.scope ? { scope: t.scope } : {}), region: row.Provincia_Regione_Storica ?? row.Regione_Provincia, mt: Math.round(raw * unit.factor * 1e6) / 1e6, context: row.Contesto_Geopolitico };
}

/**
 * Fonde i due file: tutte le righe del «completo»; dal primo, solo quelle (risorsa, territorio) che il completo non ha.
 * Ritorna { rows, conflicts }: `conflicts` elenca le sovrapposizioni con valori diversi (vince il completo) e le righe saltate.
 */
export function mergeProduction(first, complete, research = []) {
  const rows = [];
  const conflicts = [];
  const key = (r) => `${r.resource}|${r.territory}`;
  const seen = new Map();
  for (const r of complete) { const n = normalize(r, { column: 'Produzione_1936_Mt', factor: 1 }); if (!n) continue; if (seen.has(key(n))) throw new Error(`produzione: duplicato ${key(n)}`); seen.set(key(n), n); rows.push({ ...n, source: 'completo' }); }
  for (const r of first) {
    const n = normalize(r, { column: 'Produzione_Tonnellate', factor: 1e-6 });
    if (!n) { conflicts.push({ kind: 'saltata', resource: RESOURCE_IDS[r.Risorsa], territory: r.Nazione, reason: 'aggregato (Belgio / Congo Belga): il completo ha Congo Belga e Belgio separati' }); continue; }
    const have = seen.get(key(n));
    if (have) { if (Math.abs(have.mt - n.mt) > 1e-9) conflicts.push({ kind: 'valore diverso', resource: n.resource, territory: n.territory, completo: have.mt, primo: n.mt, reason: 'prevale il completo' }); continue; }
    if (n.resource === 'coal' && n.territory === 'Australia') { conflicts.push({ kind: 'saltata', resource: 'coal', territory: 'Australia', primo: n.mt, reason: 'il primo file dice 1,45 Mt, la tabella di sintesi 14,5 Mt, il completo non la riporta: da decidere' }); continue; }
    seen.set(key(n), n);
    rows.push({ ...n, source: 'primo' });
  }
  // terza sorgente (ricerca web del 29/10/2026, tonnellate lunghe): solo le righe che gli altri due file non hanno
  for (const r of research) {
    const n = normalize(r, { column: 'Produzione_Tonnellate_Lunghe', factor: LONG_TON_TO_MT });
    if (!n || seen.has(key(n))) continue;
    seen.set(key(n), n);
    rows.push({ ...n, source: 'ricerca' });
  }
  rows.sort((a, b) => a.resource.localeCompare(b.resource) || b.mt - a.mt || a.territory.localeCompare(b.territory));
  return { rows, conflicts };
}

/** Errori (lista vuota = valido). ctx: { resources: [{id}], provinceIds: Set di tutti gli id provincia } */
export function validateProduction(file, { resources, provinceIds }) {
  const errors = [];
  if (file?.schema !== PRODUCTION_SCHEMA) return [`produzione: schema ${file?.schema}, atteso ${PRODUCTION_SCHEMA}`];
  const known = new Set(resources.map((r) => r.id));
  const seen = new Set();
  for (const r of file.rows ?? []) {
    const k = `${r.resource}|${r.territory}`;
    if (seen.has(k)) errors.push(`produzione: duplicato ${k}`);
    seen.add(k);
    if (!known.has(r.resource)) errors.push(`produzione: ${k} usa una risorsa che non esiste in resources.json`);
    if (!(r.mt > 0)) errors.push(`produzione: ${k} con mt non valido`);
    if (!['completo', 'primo', 'ricerca'].includes(r.source)) errors.push(`produzione: ${k} con fonte sconosciuta`);
    const start = r.scope ?? `P_${r.prefix}_`;
    if (![...provinceIds].some((id) => id.startsWith(start))) errors.push(`produzione: ${k} senza province con prefisso ${start}`);
  }
  return errors;
}

/** Mt/anno → t/giorno di gioco, con 1 t di gioco = `realPerGame` t reali (DESIGN_DEFAULT, vedi data/resources/production_1936.json). */
export function mtPerYearToGameTonsPerDay(mt, realPerGame) {
  return Math.round((mt * 1e6) / 365 / realPerGame * 10) / 10;
}
