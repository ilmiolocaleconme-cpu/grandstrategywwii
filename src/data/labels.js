// Posizione dei nomi sulla mappa (data/labels.json), calcolata da `npm run build:labels`: nazioni, province (con le
// varianti del nome: intero, due righe, sigle) e zone marittime. Il browser non calcola nulla, filtra per zoom e vista.
// Il file è protetto da una somma di controllo degli id delle province e delle zone di mare: se cambiano, va rigenerato.
import { idsChecksum } from './adjacency.js';

export const LABELS_SCHEMA = 'labels-v1';

/** Errori del file (lista vuota = valido). `ids`: id delle province; `seaIds`: id delle zone marittime; `nationIds`: id dei proprietari. */
export function validateLabels(file, ids, seaIds, nationIds) {
  const errors = [];
  if (file === null || typeof file !== 'object') return ['nomi: file mancante'];
  if (file.schema !== LABELS_SCHEMA) errors.push(`nomi: schema ${JSON.stringify(file.schema)} (atteso ${LABELS_SCHEMA})`);
  if (file.checksum !== idsChecksum(ids)) errors.push('nomi: somma di controllo delle province diversa: rigenerare con npm run build:labels');
  if (file.seaChecksum !== idsChecksum(seaIds)) errors.push('nomi: somma di controllo delle zone marittime diversa: rigenerare con npm run build:labels');
  for (const key of ['nations', 'provinces', 'seas']) if (!Array.isArray(file[key])) errors.push(`nomi: ${key} non è un elenco`);
  if (errors.length) return errors;
  const known = { nations: new Set(nationIds), provinces: new Set(ids), seas: new Set(seaIds) };
  const check = (kind, e, where) => {
    if (!known[kind].has(e.id)) errors.push(`nomi: ${where} ${e.id} sconosciuto`);
    if (typeof e.x !== 'number' || typeof e.y !== 'number' || !Number.isFinite(e.x + e.y)) errors.push(`nomi: ${where} ${e.id} senza posizione`);
    if (!(e.s > 0)) errors.push(`nomi: ${where} ${e.id} corpo non positivo`);
    if (!Number.isFinite(e.r) || Math.abs(e.r) > 90) errors.push(`nomi: ${where} ${e.id} rotazione non valida`);
    if (!Array.isArray(e.l) || e.l.length < 1 || e.l.length > 3 || e.l.some((s) => typeof s !== 'string' || s === '')) errors.push(`nomi: ${where} ${e.id} righe non valide`);
  };
  for (const kind of ['nations', 'seas']) {
    const seen = new Set();
    for (const e of file[kind]) { check(kind, e, kind); if (seen.has(e.id)) errors.push(`nomi: ${kind} ${e.id} duplicato`); seen.add(e.id); }
  }
  const seen = new Set();
  for (const p of file.provinces) {
    if (seen.has(p.id)) errors.push(`nomi: provincia ${p.id} duplicata`);
    seen.add(p.id);
    if (!known.provinces.has(p.id)) { errors.push(`nomi: provincia ${p.id} sconosciuta`); continue; }
    if (!Array.isArray(p.f) || p.f.length === 0) { errors.push(`nomi: provincia ${p.id} senza varianti`); continue; }
    for (const form of p.f) check('provinces', { ...form, id: p.id }, 'provincia');
  }
  return errors;
}
