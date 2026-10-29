// Profili di scambio per nazione (data/trade/trade_profiles_1930.json): cosa produce e cosa importa, in modo qualitativo.
// IPOTESI, non dato storico: nessuna quantità, nessuna rotta automatica. Il commercio vero (volumi, accordi, rotte percorribili) verrà
// dopo e dovrà usare porti, ferrovie e fiumi realmente esistenti. Funzioni PURE: ricevono il documento e gli ID già caricati.

export const TRADE_SCHEMA = 'trade-profiles-v1';
export const TRADE_QUALITY = 'hypothesis';

/**
 * Errori di coerenza (lista vuota = valido). nationIds: ID delle entità politiche; productIds: ID di data/resources.json.
 * Controlla: schema e qualità, nazioni esistenti e uniche, classi e segnalazioni note, prodotti e partner esistenti,
 * partner mai uguale alla nazione stessa, nessuna quantità inventata.
 */
export function validateTradeProfiles(doc, { nationIds, productIds }) {
  const errors = [];
  if (doc === null || typeof doc !== 'object') return ['scambi: documento non valido'];
  if (doc.schema !== TRADE_SCHEMA) errors.push(`scambi: schema ${JSON.stringify(doc.schema)} (atteso ${TRADE_SCHEMA})`);
  if (doc.quality !== TRADE_QUALITY) errors.push(`scambi: qualità ${JSON.stringify(doc.quality)} (attesa ${TRADE_QUALITY}: non sono dati storici verificati)`);
  const classes = new Set(doc.goodClasses ?? []);
  const flags = new Set(doc.flags ?? []);
  const seen = new Set();
  for (const p of doc.profiles ?? []) {
    if (!nationIds.has(p.nation)) errors.push(`scambi: nazione inesistente ${p.nation}`);
    if (seen.has(p.nation)) errors.push(`scambi: nazione doppia ${p.nation}`);
    seen.add(p.nation);
    for (const dir of ['produces', 'imports']) {
      if (!Array.isArray(p[dir]) || p[dir].length === 0) errors.push(`scambi: ${p.nation} senza voci in ${dir}`);
      for (const it of p[dir] ?? []) {
        const at = `${p.nation}/${dir}/${String(it.good).slice(0, 30)}`;
        if (typeof it.good !== 'string' || it.good === '') errors.push(`scambi: ${at} senza descrizione`);
        if (!classes.has(it.goodClass)) errors.push(`scambi: ${at} con classe sconosciuta ${JSON.stringify(it.goodClass)}`);
        if (it.productId !== undefined && !productIds.has(it.productId)) errors.push(`scambi: ${at} con prodotto inesistente ${it.productId}`);
        for (const f of it.flags ?? []) if (!flags.has(f)) errors.push(`scambi: ${at} con segnalazione sconosciuta ${f}`);
        for (const k of Object.keys(it)) if (/quantit|volume|tonn|amount|value/i.test(k)) errors.push(`scambi: ${at} ha un campo numerico non ammesso (${k}): nessuna quantità inventata`);
        for (const partner of it.partners ?? []) {
          if (!nationIds.has(partner)) errors.push(`scambi: ${at} con partner inesistente ${partner}`);
          if (partner === p.nation) errors.push(`scambi: ${at} ha come partner la nazione stessa`);
        }
        if (dir === 'produces' && (it.partners ?? []).length > 0) errors.push(`scambi: ${at} è una produzione ma ha partner`);
        if (dir === 'imports' && (it.partners ?? []).length === 0 && !(it.flags ?? []).includes('partner_unnamed')) errors.push(`scambi: ${at} importazione senza partner e senza segnalazione partner_unnamed`);
      }
    }
  }
  return errors;
}

/** Importazioni di una nazione per classe di merce: { classe: [voci] }. Nazione senza profilo = {}. */
export function importsByClass(doc, nation) {
  const p = (doc.profiles ?? []).find((x) => x.nation === nation);
  const out = {};
  for (const it of p?.imports ?? []) (out[it.goodClass] ??= []).push(it);
  return out;
}
