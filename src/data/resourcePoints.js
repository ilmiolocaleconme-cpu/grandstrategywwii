// Modello a punti delle risorse: dal punteggio di output 1-10 di ogni giacimento (data/resources/punteggi_output.csv) alla «tiratura»,
// cioè quanti punti di produzione mondiale di una risorsa spettano a ogni centro produttivo, a ogni controllore e a ogni provincia.
// Bozza di design (quality = reference): serve a bilanciare il gioco, non a ricostruire la storia. Funzioni PURE: ricevono righe già lette.
//
// Regole (decise con l'utente, parametri in data/resources/modello_punti.json):
//  1. Il punteggio 1-10 è RELATIVO ALLA RISORSA (10 = massimo produttore di quella risorsa): non si confronta tra risorse diverse.
//  2. Entrano solo i giacimenti (`kind = deposit`) con `model_use = yes`; aggregati, totali nazionali, flussi e duplicati restano fuori.
//  3. Niente andamento anno per anno: le righe dello stesso luogo in anni diversi sono UN centro produttivo. Il punteggio BASE è quello della riga
//     più antica (la partenza del gioco è il 1° gennaio 1936); il punteggio massimo storico di quel luogo diventa il TETTO raggiungibile.
//  4. Il punteggio è una scala LOGARITMICA (da 1 a 10 le quantità reali coprono 3-4 ordini di grandezza): peso = step ^ (punteggio_finale - 1), cioè ogni
//     punto in più moltiplica la produzione per `step` (1 = tutti uguali; circa 2,8 = scala reale; più è basso, più il gioco è bilanciato).
//     I punti di una risorsa sommano a `budgetPerResource`.
//  5. I punti di un centro vanno al suo controllore (`control_text`) e si dividono in parti uguali tra le sue province (location_provinces.csv).
//  6. Sviluppo: il giocatore parte dall'output BASE e lo alza potenziando i centri o aprendo nuove miniere, fino al TETTO di ogni centro e di ogni
//     provincia. Ogni livello di potenziamento è +1 di punteggio (output × step). Tetto = max(punteggio massimo storico, base + extraLevels), al più 10.
//     Nuove miniere solo nelle province che hanno già la risorsa (nessun dato geologico altrove): alzano l'output fino al tetto della provincia.

export const POINTS_SCHEMA = 'resource-points-v1';
export const MODEL_SCHEMA = 'modello-punti-v1';
export const SCORE_HEADER = Object.freeze(['location_id', 'score_user', 'score_final', 'model_use', 'source', 'note']);
export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

/** Primo anno di un periodo («1938», «1938/39», «1934-38 media», «1935-45»); null se assente. */
export function startYear(period) {
  const m = /(\d{4})/.exec(String(period ?? ''));
  return m ? Number(m[1]) : null;
}

/** Chiave del luogo: la prima parola del nome, senza accenti né maiuscole («Ploiesti e altri campi» e «Ploiesti, Moreni…» coincidono). */
export function placeKey(place) {
  const first = String(place ?? '').trim().split(/[\s,;:]+/)[0] ?? '';
  return first.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Errori dei punteggi (lista vuota = validi): una riga per luogo, punteggi interi 1-10, motivo per ogni correzione ed esclusione. */
export function validateScores(scores, locations) {
  const errors = [];
  const ids = new Set(locations.map((l) => l.location_id));
  const seen = new Set();
  for (const s of scores) {
    if (!ids.has(s.location_id)) { errors.push(`punteggi: ${s.location_id} non è un luogo`); continue; }
    if (seen.has(s.location_id)) errors.push(`punteggi: ${s.location_id} duplicato`);
    seen.add(s.location_id);
    const fin = Number(s.score_final);
    if (!Number.isInteger(fin) || fin < MIN_SCORE || fin > MAX_SCORE) errors.push(`punteggi: ${s.location_id} punteggio finale ${JSON.stringify(s.score_final)} non è un intero ${MIN_SCORE}-${MAX_SCORE}`);
    if (s.score_user !== '' && (!Number.isInteger(Number(s.score_user)) || Number(s.score_user) < MIN_SCORE || Number(s.score_user) > MAX_SCORE)) errors.push(`punteggi: ${s.location_id} punteggio dell'utente non valido`);
    if (!['yes', 'no'].includes(s.model_use)) errors.push(`punteggi: ${s.location_id} model_use deve essere yes o no`);
    if (!['user_csv', 'claude_note'].includes(s.source)) errors.push(`punteggi: ${s.location_id} fonte sconosciuta`);
    const changed = s.score_user !== '' && Number(s.score_user) !== Number(s.score_final);
    if ((changed || s.model_use === 'no' || s.source === 'claude_note') && !String(s.note ?? '').trim()) errors.push(`punteggi: ${s.location_id} cambiato, escluso o aggiunto da Claude senza motivo`);
    if (s.source === 'user_csv' && s.score_user === '') errors.push(`punteggi: ${s.location_id} riga dell'utente senza il suo punteggio`);
  }
  for (const l of locations) if (!seen.has(l.location_id)) errors.push(`punteggi: manca ${l.location_id}`);
  return errors;
}

/**
 * Centri produttivi: righe `deposit` con model_use = yes raggruppate per risorsa + paese + luogo.
 * Ritorna [{ key, resource_id, country_text, control_text, place_text, base:{location_id,period,year,score}, peak:{location_id,period,score},
 *            provinces:[id], rows:[location_id], baseAfter1938 }] in ordine stabile.
 */
export function buildCenters(locations, links, scores) {
  const score = new Map(scores.map((s) => [s.location_id, s]));
  const provs = new Map();
  for (const k of links) { if (!provs.has(k.location_id)) provs.set(k.location_id, new Set()); provs.get(k.location_id).add(k.province_id); }
  const groups = new Map();
  for (const l of locations) {
    const s = score.get(l.location_id);
    if (l.kind !== 'deposit' || !s || s.model_use !== 'yes') continue;
    const key = `${l.resource_id}|${l.country_text}|${placeKey(l.place_text)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ l, s, year: startYear(l.period) ?? 9999 });
  }
  const centers = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => a.year - b.year || (a.l.location_id < b.l.location_id ? -1 : 1));
    const base = rows[0];
    const peak = rows.reduce((p, r) => (Number(r.s.score_final) > Number(p.s.score_final) ? r : p), rows[0]);
    const provinces = new Set();
    for (const r of rows) for (const p of provs.get(r.l.location_id) ?? []) provinces.add(p);
    centers.push({
      key, resource_id: base.l.resource_id, country_text: base.l.country_text, control_text: base.l.control_text || base.l.country_text, place_text: base.l.place_text,
      base: { location_id: base.l.location_id, period: base.l.period, year: base.year, score: Number(base.s.score_final) },
      peak: { location_id: peak.l.location_id, period: peak.l.period, score: Number(peak.s.score_final) },
      provinces: [...provinces].sort(), rows: rows.map((r) => r.l.location_id), baseAfter1938: base.year > 1938,
    });
  }
  return centers.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Peso di un centro: ogni punto di punteggio in più moltiplica la produzione per `step`. */
export function weightOf(score, step) {
  return step ** (score - MIN_SCORE);
}

/** Tetto di punteggio di un centro: il massimo storico del luogo, almeno `extraLevels` livelli sopra la base, mai oltre 10. */
export function maxScoreOf(center, extraLevels) {
  return Math.min(MAX_SCORE, Math.max(center.peak.score, center.base.score + extraLevels));
}

/**
 * Pesi e punti: ogni risorsa somma a `budget` all'output BASE. Aggiunge a ogni centro { weight, points, maxScore, maxPoints }.
 * `maxPoints` usa lo stesso denominatore della base, quindi è confrontabile: la somma dei tetti di una risorsa è il suo potenziale mondiale.
 */
export function allocate(centers, { step, budget, extraLevels = 2 }) {
  const total = new Map();
  for (const c of centers) total.set(c.resource_id, (total.get(c.resource_id) ?? 0) + weightOf(c.base.score, step));
  return centers.map((c) => {
    const maxScore = maxScoreOf(c, extraLevels);
    return {
      ...c,
      weight: round(weightOf(c.base.score, step), 4),
      points: round((budget * weightOf(c.base.score, step)) / total.get(c.resource_id)),
      maxScore,
      maxPoints: round((budget * weightOf(maxScore, step)) / total.get(c.resource_id)),
    };
  });
}

/** Indici di concentrazione di una risorsa: quota del maggior controllore e numero «effettivo» di produttori (1 / somma dei quadrati delle quote). */
export function balanceOf(points) {
  const total = Object.values(points).reduce((a, b) => a + b, 0);
  const shares = Object.entries(points).map(([k, v]) => [k, v / total]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const hhi = shares.reduce((a, [, s]) => a + s * s, 0);
  return { topControl: shares[0][0], topControlShare: round(shares[0][1], 3), effectiveProducers: round(1 / hhi, 2), controls: shares.length };
}

/**
 * Tiratura completa: { schema, params, resources: { id: { centers, byControl: {controllore: {base, max}}, totale: {base, max, potenziale}, balance } },
 * byProvince: { idProvincia: { idRisorsa: {base, max} } } }. `balance` è calcolato sull'output base.
 */
export function buildResourcePoints({ locations, links, scores, params }) {
  const { step, budgetPerResource: budget, extraLevels = 2 } = params;
  const centers = allocate(buildCenters(locations, links, scores), { step, budget, extraLevels });
  const resources = {};
  const byProvince = {};
  for (const c of centers) {
    const r = resources[c.resource_id] ?? (resources[c.resource_id] = { centers: [], byControl: {}, totale: { base: 0, max: 0, potenziale: 0 }, balance: null });
    r.centers.push({
      id: c.key, controllo: c.control_text, paese: c.country_text, luogo: c.place_text, punteggio: c.base.score, periodoBase: c.base.period, punteggioMax: c.maxScore,
      punti: c.points, puntiMax: c.maxPoints, province: c.provinces, baseDopo1938: c.baseAfter1938 || undefined,
    });
    const ctl = r.byControl[c.control_text] ?? (r.byControl[c.control_text] = { base: 0, max: 0 });
    ctl.base += c.points; ctl.max += c.maxPoints;
    r.totale.base += c.points; r.totale.max += c.maxPoints;
    for (const p of c.provinces) {
      const row = byProvince[p] ?? (byProvince[p] = {});
      const cell = row[c.resource_id] ?? (row[c.resource_id] = { base: 0, max: 0 });
      cell.base += c.points / c.provinces.length; cell.max += c.maxPoints / c.provinces.length;
    }
  }
  for (const r of Object.values(resources)) {
    r.balance = balanceOf(Object.fromEntries(Object.entries(r.byControl).map(([k, v]) => [k, v.base])));
    r.byControl = Object.fromEntries(Object.entries(r.byControl).sort((a, b) => b[1].base - a[1].base || (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, { base: round(v.base), max: round(v.max) }]));
    r.totale = { base: round(r.totale.base), max: round(r.totale.max), potenziale: round(r.totale.max / r.totale.base, 2) };
  }
  for (const row of Object.values(byProvince)) for (const k of Object.keys(row)) row[k] = { base: round(row[k].base), max: round(row[k].max) };
  return { schema: POINTS_SCHEMA, quality: 'reference', params: { step, budgetPerResource: budget, extraLevels }, resources: Object.fromEntries(Object.entries(resources).sort()), byProvince: Object.fromEntries(Object.entries(byProvince).sort()) };
}

/** Quota del maggior controllore di ogni risorsa per `step` diversi: serve a scegliere `step` guardando la concentrazione. */
export function sensitivity({ locations, links, scores }, steps = [1.4, 1.7, 2, 2.8]) {
  const centers = buildCenters(locations, links, scores);
  const out = {};
  for (const e of steps) {
    const alloc = allocate(centers, { step: e, budget: 100 });
    const by = {};
    for (const c of alloc) { by[c.resource_id] ??= {}; by[c.resource_id][c.control_text] = (by[c.resource_id][c.control_text] ?? 0) + c.points; }
    for (const [res, pts] of Object.entries(by)) { out[res] ??= {}; out[res][e] = balanceOf(pts); }
  }
  return out;
}

const pct = (v) => `${Math.round(v * 100)}%`;
const times = (v) => `×${String(v).replace('.', ',')}`;

/**
 * Tabella leggibile (Markdown) della tiratura: primi tre controllori per risorsa (output base), potenziale massimo e quota del primo al variare di `step`.
 * `labels`: { idRisorsa: nome }. File GENERATO da scripts/build-resource-points.js: non modificarlo a mano.
 */
export function pointsTableMarkdown(file, sens, labels, steps) {
  const { step, budgetPerResource: budget, extraLevels } = file.params;
  const lines = [
    '# Tiratura delle risorse a punti (generato)',
    '',
    'File generato da `npm run build:resource-points`: non modificare a mano. Spiegazione e regole in `docs/RISORSE_PUNTI.md`.',
    `Parametri: step ${step}, ${budget} punti di output base mondiale per risorsa (quindi percentuali), almeno ${extraLevels} livelli di sviluppo oltre la base. Punteggio 1 = peso 1; ogni punto in più moltiplica l'output per ${step}.`,
    '',
    `| Risorsa | Centri | Primi tre controllori (output base) | Produttori effettivi | Potenziale mondiale (tetto / base) | Quota del primo a step ${steps.join(' / ')} | Dominante |`,
    '| --- | ---: | --- | ---: | ---: | --- | --- |',
  ];
  for (const [id, r] of Object.entries(file.resources)) {
    const top = Object.entries(r.byControl).slice(0, 3).map(([k, v]) => `${k} ${pct(v.base / budget)}`).join(', ');
    const sh = steps.map((s) => pct(sens[id][s].topControlShare)).join(' / ');
    lines.push(`| ${labels[id] ?? id} | ${r.centers.length} | ${top} | ${r.balance.effectiveProducers} | ${times(r.totale.potenziale)} | ${sh} | ${r.balance.topControlShare > 0.5 ? `sì (${r.balance.topControl})` : 'no'} |`);
  }
  lines.push('', '«Produttori effettivi» = 1 / somma dei quadrati delle quote dei controllori (più è alto, più la risorsa è distribuita). «Dominante» = un solo controllore oltre il 50%. «Potenziale mondiale» = somma dei tetti di tutti i centri divisa per l\'output base: di quanto può crescere in totale la risorsa se ogni centro arriva al suo tetto.', '');
  return lines.join('\n');
}
