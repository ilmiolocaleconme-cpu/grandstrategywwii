// Scheda unità, fase 2: regole pure (read model). Nessuna nuova regola di simulazione: legge ciò che il motore già produce.
// - affiliationOf: amico / nemico / neutrale rispetto al giocatore (alleati inclusi), dallo stato di guerra e di diplomazia esistenti.
// - natoSpec: simbolo NATO semplificato (cornice per affiliazione, glifo per categoria, indicatore di scaglione).
// - sheetSections: sezioni della scheda, ciascuna con stato 'dato' o 'non_disponibile' (mostrate sempre, fase 2 decisione B).
import { atWar } from './war.js';
import { areAllied } from './diplomacy.js';

/** Amico (giocatore o alleato), nemico (in guerra con il giocatore), neutrale (altrimenti). Senza giocatore: neutrale. */
export function affiliationOf(state, nation) {
  const player = state?.player;
  if (!player || !nation) return 'neutrale';
  if (nation === player || areAllied(state.diplomacy, player, nation)) return 'amico';
  if (state.war && atWar(state.war, player, nation)) return 'nemico';
  return 'neutrale';
}

// Glifo per categoria. Versione SEMPLIFICATA del simbolo NATO (APP-6): da verificare con lo standard completo nella fase 8.
export const NATO_GLYPH = Object.freeze({
  infantry: 'x', mountain: 'x', airborne: 'x', motorized: 'wheel', mechanized: 'oval-x', armored: 'oval', cavalry: 'slash', command: 'none',
});
export const NATO_FRAME = Object.freeze({ amico: 'rect', nemico: 'diamond', neutrale: 'square' });

/** Scaglione: divisione = 2 barre, brigata = 1, corpo = 3, armata = 4; altrimenti nessun indicatore. */
export function echelonMarks(unit) {
  if (unit.echelon === 'division') return 2;
  if (unit.echelon === 'brigade') return 1;
  if (unit.echelon === 'command' && unit.commandLevel === 'corps') return 3;
  if (unit.echelon === 'command' && unit.commandLevel === 'army') return 4;
  return 0;
}

/** Descrizione del simbolo: { frame, glyph, marks, affiliation, label }. Categoria sconosciuta: glifo 'none' (mai un'icona inventata). */
export function natoSpec(unit, affiliation) {
  const aff = NATO_FRAME[affiliation] ? affiliation : 'neutrale';
  return {
    frame: NATO_FRAME[aff], glyph: NATO_GLYPH[unit.category] ?? 'none', marks: echelonMarks(unit), affiliation: aff,
    label: `${aff}, ${unit.category ?? 'categoria sconosciuta'}`,
  };
}

/** Sezioni della scheda. `available` = il dato c'è davvero; le altre compaiono con «dato non disponibile». */
export function sheetSections(info) {
  const has = (x) => x !== null && x !== undefined;
  return [
    { id: 'panoramica', label: 'Panoramica', available: true },
    { id: 'organico', label: 'Organico', available: has(info.strength?.manpower) },
    { id: 'composizione', label: 'Composizione', available: has(info.composition) },
    { id: 'equipaggiamento', label: 'Equipaggiamento', available: (info.equipment ?? []).length > 0 },
    { id: 'rinforzi', label: 'Rinforzi', available: has(info.reinforcements) },
    { id: 'comando', label: 'Comando', available: true },
    { id: 'operazioni', label: 'Operazioni', available: true },
    { id: 'condizione', label: 'Condizione', available: has(info.condition) },
    { id: 'logistica', label: 'Logistica', available: false },
    { id: 'sanita', label: 'Sanità', available: false },
    { id: 'storia', label: 'Storia', available: false },
  ];
}

// ---- Fase 3: equipaggiamento per categoria ----
// Tabella ESPLICITA: una voce entra in un gruppo solo se è qui. Le chiavi sconosciute (o ambigue) restano in «non classificati»
// con il loro codice originale: nessuna categoria attribuita automaticamente (specifica, sez. 8).
export const EQUIPMENT_GROUP_LABEL = Object.freeze({
  individuali: 'Armi individuali', mitragliatrici: 'Mitragliatrici', mortai: 'Mortai', artiglieria: 'Artiglieria',
  anticarro: 'Anticarro', contraerea: 'Contraerea', veicoli: 'Veicoli', corazzati: 'Corazzati', trasmissioni: 'Trasmissioni',
  non_classificati: 'Non classificati',
});
export const EQUIPMENT_GROUP = Object.freeze({
  fucili: 'individuali', pistole: 'individuali', 'INW-DEU-RIFLE-1939': 'individuali', 'INW-DEU-PISTOL-1939': 'individuali',
  'INW-FRA-RIFLE-1939': 'individuali', 'INW-FRA-PISTOL-1939': 'individuali', 'INW-ITA-RIFLE-1940': 'individuali', 'INW-ITA-PISTOL-1940': 'individuali',
  'INW-USSR-RIFLE-1939': 'individuali', 'INW-JPN-RIFLE-1939': 'individuali', 'INW-USA-RIFLE-1940': 'individuali',
  mitragliatrici: 'mitragliatrici', mitragliatriciLeggere: 'mitragliatrici', mitragliatriciPesanti: 'mitragliatrici',
  'MG-DEU-MG34-L': 'mitragliatrici', 'MG-DEU-MG34-S': 'mitragliatrici', 'MG-FRA-FM2429': 'mitragliatrici', 'MG-FRA-HOTCHKISS1914': 'mitragliatrici',
  'MG-ITA-HMG-1940': 'mitragliatrici', 'MG-ITA-LMG-1940': 'mitragliatrici',
  'MG-USSR-HMG-1939': 'mitragliatrici', 'MG-USSR-LMG-1939': 'mitragliatrici', 'MG-JPN-HMG-1939': 'mitragliatrici', 'MG-JPN-LMG-1939': 'mitragliatrici', 'MG-USA-BAR-1940': 'mitragliatrici', 'MG-USA-HMG-1940': 'mitragliatrici', 'MG-USA-M2-1940': 'mitragliatrici',
  mortai: 'mortai', mortaiLeggeri50mm: 'mortai', mortaiPesanti81mm: 'mortai', 'ART-DEU-GRW34': 'mortai', 'ART-DEU-GRW36': 'mortai',
  'ART-FRA-MORTAR60': 'mortai', 'ART-FRA-MORTAR81': 'mortai', 'ART-ITA-MORTAR81-1940': 'mortai', 'ART-ITA-BRIXIA45-1940': 'mortai', 'ART-USA-MORTAR81-1940': 'mortai',
  artiglieria: 'artiglieria', artiglieriaCampale: 'artiglieria', cannoni105mm: 'artiglieria', cannoniFanteria75mm: 'artiglieria',
  cannoniFanteriaPesanti150mm: 'artiglieria', obiciLeggeri105mm: 'artiglieria', obiciPesanti150mm: 'artiglieria',
  'ART-DEU-K18-105': 'artiglieria', 'ART-DEU-LEFH18': 'artiglieria', 'ART-DEU-LEIG18': 'artiglieria', 'ART-DEU-SFH18': 'artiglieria',
  'ART-DEU-SIG33': 'artiglieria', 'ART-FRA-ART75M1897': 'artiglieria', 'ART-FRA-HOW155C': 'artiglieria', 'ART-ITA-GUN75-1940': 'artiglieria',
  'ART-ITA-HOW75-1940': 'artiglieria', 'ART-ITA-HOW100-1940': 'artiglieria',
  'ART-USSR-GUN76-1939': 'artiglieria', 'ART-USSR-HOW122-1939': 'artiglieria', 'ART-USSR-HOW152-1939': 'artiglieria', 'ART-JPN-GUN75-DIV-1939': 'artiglieria', 'ART-JPN-GUN75-REG-1939': 'artiglieria', 'ART-USA-HOW105-1940': 'artiglieria', 'ART-USA-HOW155-1940': 'artiglieria', 'ART-USA-GUN75-1940': 'artiglieria',
  controcarro: 'anticarro', controcarro37mm: 'anticarro', 'ART-DEU-PAK36': 'anticarro', 'ART-FRA-AT25': 'anticarro', 'ART-ITA-AT47-1940': 'anticarro', 'ART-USSR-AT45-1939': 'anticarro', 'ART-JPN-AT37-1939': 'anticarro', 'ART-USA-AT37-1940': 'anticarro',
  antiaerei: 'contraerea', antiaerei20mm: 'contraerea',
  veicoli: 'veicoli', carri: 'corazzati', radio: 'trasmissioni',
  // divisioni corazzate (12/11/2026)
  'TNK-FRA-B1BIS-1940': 'corazzati', 'TNK-FRA-H39-1940': 'corazzati', 'TNK-GBR-LIGHT-TANK-1939': 'corazzati', 'TNK-GBR-CRUISER-1939': 'corazzati', 'TNK-ITA-M13-1940': 'corazzati', 'TNK-ITA-L3-ARM-1940': 'corazzati', 'TNK-USA-LIGHT-TANK-1940': 'corazzati', 'TNK-USA-MEDIUM-TANK-1940': 'corazzati', 'TNK-JPN-TYPE97-1942': 'corazzati', 'TNK-JPN-TYPE95-1942': 'corazzati',
  'ART-FRA-HOW105-ARM-1940': 'artiglieria', 'ART-GBR-25PDR-ARM-1939': 'artiglieria', 'ART-ITA-GUN75-27-ARM-1940': 'artiglieria', 'ART-USA-HOW105-ARM-1940': 'artiglieria', 'ART-JPN-GUN75-ARM-1942': 'artiglieria',
  'ART-FRA-AT47-ARM-1940': 'anticarro', 'ART-GBR-2PDR-ARM-1939': 'anticarro', 'ART-ITA-AT47-ARM-1940': 'anticarro', 'ART-USA-AT37-ARM-1940': 'anticarro', 'ART-JPN-AT47-ARM-1942': 'anticarro',
});

/** Raggruppa le voci di dotazione. rows: [{ item, planned, effective, ratio, source? }]. Nessuna voce viene scartata. */
export function equipmentGroups(rows) {
  const out = Object.keys(EQUIPMENT_GROUP_LABEL).map((g) => ({ id: g, label: EQUIPMENT_GROUP_LABEL[g], rows: [] }));
  const byId = new Map(out.map((g) => [g.id, g]));
  for (const r of rows ?? []) {
    const g = EQUIPMENT_GROUP[r.item] ?? 'non_classificati';
    byId.get(g).rows.push({ ...r, group: g, difference: (r.effective ?? 0) - (r.planned ?? 0) });
  }
  return out.filter((g) => g.rows.length > 0);
}
