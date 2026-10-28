// Vista della provincia per il pannello: assembla dati storici, dati per provincia e stato di partita in un oggetto
// pronto da disegnare. Funzione PURA e senza I/O. NON scrive nulla e NON contiene formule di gioco: mostra fatti e
// stati derivati in modo trasparente (conteggi di collegamenti, flag dello stato). Dati assenti → «n/d», mai un valore inventato.
//
// Struttura: { header, alert, cards }. Ogni scheda: titolo, stato, indicatore principale, al massimo 4 metriche,
// modificatori e dettagli (gerarchia dei livelli A/B/C: docs/DESIGN_PANNELLO_PROVINCIA.md).

import { SLOT_CAPACITY } from './slots.js';
import { provinceStateOf } from '../game/provinceState.js';

export const ND = 'n/d';

const fmt = (n) => Number(n).toLocaleString('it-IT');
const has = (v) => v !== undefined && v !== null;

export const LOGISTICS_STATUS = Object.freeze({
  excellent: { label: 'Ottima', tone: 'good' },
  normal: { label: 'Normale', tone: 'ok' },
  strained: { label: 'Sotto sforzo', tone: 'warn' },
  isolated: { label: 'Isolata', tone: 'bad' },
  unknown: { label: 'Dato non caricato', tone: 'na' },
});

/**
 * Collegamenti per provincia MADRE da data/links.json (nessuna seconda rete: si leggono i tratti già esistenti).
 * `file`: links.json; `pieces`: properties dei pezzi di provincia NELLO STESSO ORDINE usato per generare il file
 * (gli indici dei nodi puntano a quell'elenco). Conta solo i tratti fra province madri diverse.
 * Ritorna Map(idMadre → { links, rail, road }); t: 4 ferrovia, 1-3 strada (sterrata, strada, principale).
 */
export function provinceLinkStats(file, pieces) {
  const mother = pieces.map((p) => p.parentProvince ?? p.id);
  const out = new Map();
  const bump = (id, t) => {
    const s = out.get(id) ?? { links: 0, rail: 0, road: 0 };
    s.links += 1;
    if (t === 4) s.rail += 1; else s.road += 1;
    out.set(id, s);
  };
  const nodeMother = (i) => mother[file.nodes[i]?.p];
  for (const l of file?.links ?? []) {
    const a = nodeMother(l.a);
    const b = nodeMother(l.b);
    if (a === undefined || b === undefined || a === b) continue;
    bump(a, l.t);
    bump(b, l.t);
  }
  return out;
}

/** Stato logistico sintetico: isolata se senza collegamenti o segnata dallo stato; sotto sforzo se le infrastrutture sono danneggiate. */
export function logisticsStatus(stats, st) {
  if (st.isolated) return 'isolated';
  if (!stats) return 'unknown';
  if (stats.links === 0) return 'isolated';
  if (st.infrastructureDamage >= 0.3 || st.bombing >= 0.3 || st.logisticProblems) return 'strained';
  if (stats.rail >= 1 && stats.links >= 2) return 'excellent';
  return 'normal';
}

const level = (v) => (has(v) ? `L${v}` : ND);
const yesNo = (v) => (has(v) ? (v ? 'sì' : 'no') : ND);
const pct = (r) => `${Math.round(r * 100)}%`;

/**
 * input: {
 *   props, areaKm2,                       // feature selezionata (properties e area)
 *   nationNames, nationControl,           // come nel pannello attuale
 *   state,                                // stato di partita (facoltativo): usa state.provinces
 *   terrainLabel, resourceLabels,         // testi già pronti (facoltativi)
 *   population, agriculture, military,    // voci per provincia (provinceEntry) o null
 *   linkStats,                            // voce di provinceLinkStats o null/undefined se i collegamenti non sono caricati
 *   hydroMw                               // MW idroelettrici installati nella provincia madre o null
 * }
 */
export function buildProvinceView(input) {
  const { props, areaKm2, nationNames = {}, nationControl = {}, state = null, terrainLabel = null, resourceLabels = [],
    population = null, agriculture = null, military = null, linkStats = null, hydroMw = null } = input;
  const motherId = props.parentProvince ?? props.id;
  const st = provinceStateOf(state, motherId);
  const owner = props.owner;
  const controller = st.controller ?? nationControl[owner] ?? owner;
  const nameOf = (id) => nationNames[id] ?? id;
  const slots = props.kind === 'citta' ? SLOT_CAPACITY.cityPart : SLOT_CAPACITY.province;
  const logi = logisticsStatus(linkStats, st);
  const logiInfo = LOGISTICS_STATUS[logi];
  const bombed = st.damage >= 0.3 || st.bombing > 0;

  // ---- stato sintetico dell'intestazione ----
  let status = { id: 'stable', label: 'Stabile', tone: 'good' };
  if (has(st.stability) && st.stability < 40) status = { id: 'unstable', label: 'Instabile', tone: 'warn' };
  if (st.occupation === 'contested') status = { id: 'contested', label: 'Contesa', tone: 'warn' };
  if (st.occupation === 'occupied') status = { id: 'occupied', label: 'Occupata', tone: 'warn' };
  if (bombed) status = { id: 'damaged', label: 'Danneggiata', tone: 'bad' };
  if (logi === 'isolated') status = { id: 'isolated', label: 'Isolata', tone: 'bad' };

  const header = {
    name: props.name,
    nameLocal: props.nameLocal && props.nameLocal !== props.name ? props.nameLocal : null,
    owner, ownerName: nameOf(owner),
    controller, controllerName: nameOf(controller),
    status,
    indicators: [
      { id: 'population', label: 'Popolazione', value: has(population?.population) ? fmt(population.population) : ND, tone: has(population?.population) ? 'ok' : 'na' },
      { id: 'industry', label: 'Industria', value: `${slots} slot`, tone: 'ok' },
      { id: 'energy', label: 'Energia', value: has(hydroMw) && hydroMw > 0 ? `${fmt(Math.round(hydroMw))} MW` : ND, tone: st.powerShortage ? 'bad' : has(hydroMw) && hydroMw > 0 ? 'ok' : 'na' },
      { id: 'resources', label: 'Risorse', value: String(resourceLabels.length), tone: resourceLabels.length ? 'ok' : 'na' },
      { id: 'logistics', label: 'Logistica', value: logiInfo.label, tone: logiInfo.tone },
    ],
  };

  // ---- avviso dinamico (priorità: porta l'attenzione sul problema, non cambia i dati) ----
  let alert = null;
  if (logi === 'isolated') alert = { id: 'isolated', tone: 'bad', label: 'Logistica: provincia isolata' };
  if (bombed) alert = { id: 'damage', tone: 'bad', label: `Danni${st.damage > 0 ? `: ${pct(st.damage)}` : ''}${st.bombing > 0 ? ` · bombardamenti ${pct(st.bombing)}` : ''}` };

  const modifiers = (...pairs) => pairs.filter(([cond]) => cond).map(([, text]) => text);

  const cards = {
    overview: {
      id: 'overview', level: 'A', title: 'Panoramica', open: true,
      status: status,
      main: null,
      lines: [
        `${props.kind === 'citta' ? 'Zona urbana' : 'Provincia'} di ${nameOf(owner)}${terrainLabel ? `, terreno ${terrainLabel.toLowerCase()}` : ''}, circa ${fmt(Math.round(areaKm2 ?? 0))} km²`,
        resourceLabels.length ? `Risorse: ${resourceLabels.join(', ')}` : 'Nessuna risorsa registrata',
        has(population?.population) || has(military?.garrison) ? null : 'Popolazione e presenza militare: dato mancante',
      ].filter(Boolean),
      metrics: [
        { label: 'Popolazione', value: has(population?.population) ? fmt(population.population) : ND },
        { label: 'Industria', value: `${slots} slot` },
        { label: 'Energia', value: has(hydroMw) && hydroMw > 0 ? `${fmt(Math.round(hydroMw))} MW` : ND },
        { label: 'Logistica', value: logiInfo.label },
      ],
      modifiers: [], details: [],
    },
    military: {
      id: 'military', level: 'B', title: 'Militare',
      status: military ? { label: 'Presenza registrata', tone: 'ok' } : { label: 'Nessun dato', tone: 'na' },
      main: { label: 'Guarnigione', value: has(military?.garrison) ? fmt(military.garrison) : ND },
      metrics: [
        { label: 'Quartier generale', value: yesNo(military?.hq) },
        { label: 'Fortificazioni', value: level(military?.fortifications) },
        { label: 'Antiaerea', value: level(military?.antiAir) },
        { label: 'Radar', value: level(military?.radar) },
      ],
      modifiers: modifiers([st.occupation !== 'none', 'Controllo non pacifico']),
      details: [{ label: 'Installazioni', value: military?.installations?.length ? military.installations.join(', ') : ND }],
    },
    logistics: {
      id: 'logistics', level: 'B', title: 'Logistica',
      status: logiInfo,
      main: { label: 'Collegamenti', value: linkStats ? String(linkStats.links) : ND },
      metrics: [
        { label: 'Ferrovia', value: linkStats ? String(linkStats.rail) : ND },
        { label: 'Strade', value: linkStats ? String(linkStats.road) : ND },
      ],
      modifiers: modifiers([st.infrastructureDamage > 0, `Infrastrutture danneggiate ${pct(st.infrastructureDamage)}`], [st.isolated, 'Segnata come isolata']),
      details: [{ label: 'Origine dei dati', value: 'tratti di data/links.json (rete moderna, ipotesi)' }],
    },
    economy: {
      id: 'economy', level: 'B', title: 'Economia',
      status: st.resourceShortage || st.powerShortage || st.workforceShortage ? { label: 'Carenze', tone: 'warn' } : { label: 'Nessuna carenza segnalata', tone: 'ok' },
      main: { label: 'Slot industriali', value: String(slots) },
      metrics: [
        { label: 'Risorse', value: resourceLabels.length ? String(resourceLabels.length) : '0' },
        { label: 'Idroelettrico', value: has(hydroMw) && hydroMw > 0 ? `${fmt(Math.round(hydroMw))} MW` : ND },
        { label: 'Potenziale agricolo', value: has(agriculture?.potential) ? `${agriculture.potential}/10` : ND },
        { label: 'Frumento', value: has(agriculture?.wheatShare) ? pct(agriculture.wheatShare) : ND },
      ],
      modifiers: modifiers([st.resourceShortage, 'Carenza di risorse'], [st.powerShortage, 'Carenza di energia'], [st.workforceShortage, 'Carenza di manodopera'], [st.damage > 0, `Danni ${pct(st.damage)}`]),
      details: resourceLabels.length ? [{ label: 'Elenco risorse', value: resourceLabels.join(', ') }] : [],
    },
    infrastructure: {
      id: 'infrastructure', level: 'B', title: 'Infrastrutture',
      status: st.infrastructureDamage > 0 ? { label: 'Danneggiate', tone: 'warn' } : { label: 'Integre', tone: 'ok' },
      main: { label: 'Danno alle infrastrutture', value: pct(st.infrastructureDamage) },
      metrics: [
        { label: 'Ferrovia', value: linkStats ? String(linkStats.rail) : ND },
        { label: 'Strade', value: linkStats ? String(linkStats.road) : ND },
        { label: 'Installazioni', value: military?.installations ? String(military.installations.length) : ND },
      ],
      modifiers: modifiers([st.bombing > 0, `Bombardamenti ${pct(st.bombing)}`]),
      details: [{ label: 'Ponti e guadi', value: 'stato in data/crossings.json (nessun dato qui: una sola fonte)' }],
    },
    population: {
      id: 'population', level: 'C', title: 'Popolazione',
      status: has(population?.population) ? { label: 'Dato presente', tone: 'ok' } : { label: 'Dato mancante', tone: 'na' },
      main: { label: 'Abitanti', value: has(population?.population) ? fmt(population.population) : ND },
      metrics: [
        { label: 'Forza lavoro', value: has(population?.workforce) ? fmt(population.workforce) : ND },
        { label: 'Crescita annua', value: has(population?.growthPerYear) ? pct(population.growthPerYear) : ND },
      ],
      modifiers: modifiers([st.workforceShortage, 'Carenza di manodopera']),
      details: population?.quality ? [{ label: 'Qualità del dato', value: population.quality }] : [],
    },
    occupation: {
      id: 'occupation', level: 'C', title: 'Occupazione',
      status: st.occupation === 'occupied' ? { label: 'Occupata', tone: 'warn' } : st.occupation === 'contested' ? { label: 'Contesa', tone: 'warn' } : { label: 'Nessuna', tone: 'ok' },
      main: { label: 'Controllo', value: nameOf(controller) },
      metrics: [
        { label: 'Proprietario', value: nameOf(owner) },
        { label: 'Stabilità', value: has(st.stability) ? `${st.stability}/100` : ND },
        { label: 'Resistenza', value: `${st.resistance}/100` },
      ],
      modifiers: [],
      details: [],
    },
    data: {
      id: 'data', level: 'C', title: 'Dati e fonti',
      status: { label: props.borderQuality === 'verified' ? 'verificato' : props.borderQuality === 'approximate' ? 'approssimato' : 'ipotesi', tone: props.borderQuality === 'verified' ? 'good' : 'na' },
      main: null,
      metrics: [],
      modifiers: [],
      details: [
        { label: 'Validità', value: `${props.validFrom} → ${props.validTo === '9999-12-31' ? 'oggi' : props.validTo}${props.dateBasis === 'assumed' ? ' (assunta)' : ''}` },
        { label: 'Fonte', value: props.source ?? ND },
        { label: 'Licenza', value: props.license ?? ND },
      ],
      knownIssues: props.knownIssues ?? [],
      notes: props.notes ?? null,
    },
  };

  // ---- ordine delle schede in base alla situazione (dinamico, senza toccare i dati) ----
  let order = ['overview', 'military', 'logistics', 'economy', 'infrastructure', 'population', 'occupation', 'data'];
  if (logi === 'isolated') order = ['overview', 'logistics', 'military', 'infrastructure', 'economy', 'population', 'occupation', 'data'];
  if (bombed) order = ['overview', 'military', 'infrastructure', 'economy', 'logistics', 'population', 'occupation', 'data'];
  if (st.occupation !== 'none' && !alert) order = ['overview', 'occupation', 'military', 'logistics', 'economy', 'infrastructure', 'population', 'data'];

  const attention = new Set(alert?.id === 'damage' ? ['military', 'infrastructure'] : alert?.id === 'isolated' ? ['logistics'] : []);
  const ordered = order.map((id) => ({ ...cards[id], open: cards[id].open === true || attention.has(id) }));
  return { header, alert, cards: ordered };
}
