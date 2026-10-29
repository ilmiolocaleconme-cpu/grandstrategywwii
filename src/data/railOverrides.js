// Declassamento delle ferrovie posteriori al 1936 nel grafo dei collegamenti (data/links.json). Funzioni PURE, senza I/O.
//
// PERCHÉ: la rete di partenza è quella MODERNA di Natural Earth e non porta anni di apertura: alcune linee costruite dopo il 1936
// compaiono come ferrovia (gradino 4). L'elenco curato sta in data/rail_overrides_1936.json (ipotesi, anni dalla memoria, NON verificati).
// COSA FA: un collegamento elencato passa dal gradino 4 al gradino `to` (strada sterrata di default), con i suoi tratti e i suoi ponti;
// il gradino delle sedi (province) si ricalcola come massimo dei loro collegamenti, così la strozzatura resta valida.
import { LADDER, markerLevelOfStep } from './links.js';

export const RAIL_OVERRIDES_SCHEMA = 'rail-overrides-v1';

/** Controlli sull'elenco: id unici, gradino di arrivo valido (1-3), motivo e base obbligatori. Ritorna la lista degli errori. */
export function validateRailOverrides(ov, { linkIds } = {}) {
  const errors = [];
  if (ov?.schema !== RAIL_OVERRIDES_SCHEMA) errors.push(`schema atteso ${RAIL_OVERRIDES_SCHEMA}`);
  if (ov?.quality !== 'hypothesis') errors.push('intestazione: qualità attesa "hypothesis"');
  const seen = new Set();
  for (const e of ov?.entries ?? []) {
    if (seen.has(e.link)) errors.push(`${e.link}: voce duplicata`);
    seen.add(e.link);
    if (!Number.isInteger(e.to) || e.to < 1 || e.to > 3) errors.push(`${e.link}: gradino di arrivo non valido ${e.to}`);
    if (!e.reason || !e.basis) errors.push(`${e.link}: motivo e base obbligatori`);
    if (linkIds && !linkIds.has(e.link)) errors.push(`${e.link}: collegamento sconosciuto`);
  }
  return errors;
}

/**
 * Applica l'elenco a una COPIA del file dei collegamenti. Idempotente: un collegamento non più al gradino 4 si salta.
 * Ritorna { file, applied: [id], skipped: [id] }.
 */
export function applyRailOverrides(file, ov) {
  const out = structuredClone(file);
  const byLink = new Map(ov.entries.map((e) => [e.link, e]));
  const applied = [];
  const skipped = [];
  const newT = new Map();
  for (const l of out.links) {
    const e = byLink.get(l.id);
    if (!e) continue;
    if (l.t !== 4) { skipped.push(l.id); continue; }
    l.t = e.to;
    newT.set(l.id, e.to);
    applied.push(l.id);
  }
  const lad = (t) => LADDER.find((x) => x.t === t);
  for (const s of out.segments) {
    const t = newT.get(s.link);
    if (t === undefined) continue;
    const st = lad(t);
    s.t = t; s.k = st.k; s.level = st.level; s.rank = st.rank;
  }
  for (const b of out.bridges) {
    const t = newT.get(b.link);
    if (t === undefined) continue;
    const st = lad(t);
    const ml = markerLevelOfStep(t);
    b.t = t; b.mode = st.k; b.level = ml; b.road = st.k === 'road' ? ml : 0; b.rail = st.k === 'rail' ? ml : 0;
  }
  if (applied.length > 0) {
    const nodeT = new Map();
    for (const l of out.links) for (const p of [l.a, l.b]) nodeT.set(p, Math.max(nodeT.get(p) ?? 1, l.t));
    for (const n of out.nodes) n.t = nodeT.get(n.p) ?? n.t;
  }
  out.railOverrides = { file: 'rail_overrides_1936.json', count: ov.entries.length, quality: 'hypothesis' };
  return { file: out, applied, skipped };
}
