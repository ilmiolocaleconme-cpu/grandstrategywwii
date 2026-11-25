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
  'VEH-DEU-TRUCK': 'veicoli', 'VEH-DEU-SDKFZ251': 'veicoli', 'TNK-DEU-TANK': 'corazzati', // divisioni a battaglioni (18/11/2026)
  'VEH-DEU-KRAD': 'veicoli', 'VEH-DEU-SDKFZ222': 'veicoli', 'ART-DEU-FLAK88': 'artiglieria', 'ART-DEU-GEBG36': 'artiglieria', // battaglioni del 19/11/2026
  'INW-USSR-PISTOL-TT33': 'individuali', 'INW-USSR-SMG-PPD': 'individuali', 'INW-USSR-SMG-PPSH41': 'individuali', 'ART-USSR-MOR50': 'mortai', 'ART-USSR-MOR82': 'mortai', 'ART-USSR-MOR120': 'mortai', // battaglioni sovietici (19/11/2026)
  'ART-USSR-GUN76-REGT': 'artiglieria', 'ART-USSR-AA37': 'contraerea', 'ART-USSR-AA76': 'contraerea', 'VEH-USSR-GAZAA': 'veicoli', 'VEH-USSR-ZIS5': 'veicoli', 'VEH-USSR-MOTO': 'veicoli', 'VEH-USSR-BA10': 'veicoli',
  'ART-USSR-PTRD': 'anticarro', 'ART-USSR-BM13': 'artiglieria', 'ART-DEU-NBW41': 'artiglieria', 'ART-DEU-PZW42': 'artiglieria', 'ART-DEU-AA-20': 'contraerea', 'ART-USA-CALLIOPE': 'artiglieria', 'ART-USSR-MOR107': 'mortai', 'ART-USSR-GUN76-GORN': 'artiglieria', // 20/11/2026
  'INW-USA-PISTOL-M1911': 'individuali', 'INW-USA-SMG-THOMPSON': 'individuali', 'INW-USA-SMG-M3': 'individuali', 'ART-USA-MOR60': 'mortai', 'ART-USA-HOW75-PACK': 'artiglieria', 'ART-USA-AT57': 'anticarro', 'ART-USA-AA40': 'contraerea', 'VEH-USA-TRUCK15': 'veicoli', 'VEH-USA-GMC-CCKW': 'veicoli', 'VEH-USA-JEEP': 'veicoli', 'VEH-USA-M3-SCOUT': 'veicoli', 'VEH-USA-M3-HT': 'veicoli', 'VEH-USA-M8': 'veicoli', // catalogo USA (20/11/2026)
  'GL-USA-BAZOOKA': 'anticarro', 'GL-DEU-PANZERSCHRECK': 'anticarro', 'GL-DEU-PANZERFAUST': 'anticarro', 'VEH-USA-MOTO': 'veicoli', // anticarro della fanteria e moto USA (20/11/2026)
  'INW-GBR-NO4': 'individuali', 'INW-GBR-PISTOL-WEBLEY': 'individuali', 'INW-GBR-SMG-LANCHESTER': 'individuali', 'INW-GBR-SMG-STEN': 'individuali', 'MG-GBR-LEWIS': 'mitragliatrici', 'MG-GBR-BREN': 'mitragliatrici', 'MG-GBR-VICKERS': 'mitragliatrici', 'ART-GBR-BOYS': 'anticarro', 'GL-GBR-PIAT': 'anticarro', 'ART-GBR-MOR2IN': 'mortai', 'ART-GBR-MOR3IN': 'mortai', 'ART-GBR-MOR42IN': 'mortai', 'ART-GBR-18PDR': 'artiglieria', 'ART-GBR-HOW45': 'artiglieria', 'ART-GBR-HOW55': 'artiglieria', 'ART-GBR-6PDR': 'anticarro', 'ART-GBR-17PDR': 'anticarro', 'ART-GBR-BOFORS': 'contraerea', 'ART-GBR-AA37IN': 'contraerea', 'VEH-GBR-TRUCK15': 'veicoli', 'VEH-GBR-TRUCK3T': 'veicoli', 'VEH-GBR-CARRIER': 'veicoli', 'VEH-GBR-MOTO': 'veicoli', 'VEH-GBR-MORRIS-AC': 'veicoli', 'VEH-GBR-DAIMLER-AC': 'veicoli', // Regno Unito, catalogo per modelli (24/11/2026)
  'TNK-GBR-INFANTRY-TANK': 'corazzati', 'TNK-GBR-MK6': 'corazzati', 'TNK-GBR-TETRARCH': 'corazzati', 'TNK-GBR-A9': 'corazzati', 'TNK-GBR-A10': 'corazzati', 'TNK-GBR-A13': 'corazzati', 'TNK-GBR-CRUSADER': 'corazzati', 'TNK-GBR-CROMWELL': 'corazzati', 'TNK-GBR-COMET': 'corazzati', 'TNK-GBR-MATILDA1': 'corazzati', 'TNK-GBR-MATILDA2': 'corazzati', 'TNK-GBR-VALENTINE': 'corazzati', 'TNK-GBR-CHURCHILL': 'corazzati', // carri britannici per modello (24/11/2026)
  'INW-ITA-CARCANO-9138': 'individuali', 'INW-ITA-PISTOL-BERETTA34': 'individuali', 'INW-ITA-SMG-MAB38': 'individuali', 'MG-ITA-BREDA30': 'mitragliatrici', 'MG-ITA-FIAT1435': 'mitragliatrici', 'MG-ITA-BREDA37': 'mitragliatrici', 'ART-ITA-GUN65-17': 'artiglieria', 'ART-ITA-HOW75-18': 'artiglieria', 'ART-ITA-GUN105-28': 'artiglieria', 'ART-ITA-HOW149-13': 'artiglieria', 'ART-ITA-AA20-BREDA': 'contraerea', 'ART-ITA-AA75-46': 'contraerea', 'ART-ITA-AA90-53': 'contraerea', 'VEH-ITA-SPA-DOV35': 'veicoli', 'VEH-ITA-FIAT626': 'veicoli', 'VEH-ITA-LANCIA3RO': 'veicoli', 'VEH-ITA-TL37': 'veicoli', 'VEH-ITA-MOTO-GT17': 'veicoli', 'VEH-ITA-MOTO-ALCE': 'veicoli', 'VEH-ITA-AB40': 'veicoli', 'VEH-ITA-AB41': 'veicoli', // Italia, catalogo per modelli (24/11/2026)
  'TNK-ITA-L3-33': 'corazzati', 'TNK-ITA-L3-35': 'corazzati', 'TNK-ITA-L6-40': 'corazzati', 'TNK-ITA-M11-39': 'corazzati', 'TNK-ITA-M13-40': 'corazzati', 'TNK-ITA-M14-41': 'corazzati', 'TNK-ITA-M15-42': 'corazzati', 'TNK-ITA-P40': 'corazzati', 'TD-ITA-SEM-47-32': 'corazzati', 'TD-ITA-SEM-75-18': 'corazzati', 'TD-ITA-SEM-75-34': 'corazzati', 'TD-ITA-SEM-105-25': 'corazzati', // carri italiani per modello (24/11/2026)
  'INW-FRA-MAS36': 'individuali', 'INW-FRA-PISTOL-MAS35': 'individuali', 'INW-FRA-SMG-MAS38': 'individuali', 'ART-FRA-MOR50': 'mortai', 'ART-FRA-GUN105L': 'artiglieria', 'ART-FRA-GUN155GPF': 'artiglieria', 'ART-FRA-GUN75-MONT': 'artiglieria', 'ART-FRA-AA25': 'contraerea', 'ART-FRA-AA75': 'contraerea', 'VEH-FRA-RENAULT-UE': 'veicoli', 'VEH-FRA-LORRAINE37L': 'veicoli', 'VEH-FRA-CITROEN23': 'veicoli', 'VEH-FRA-RENAULT-3T': 'veicoli', 'VEH-FRA-LAFFLY-S20': 'veicoli', 'VEH-FRA-MOTO-RG': 'veicoli', 'VEH-FRA-MOTO-AX2': 'veicoli', 'VEH-FRA-AMD-WL': 'veicoli', 'VEH-FRA-PANHARD178': 'veicoli', // Francia, catalogo per modelli (24/11/2026)
  'TNK-FRA-LIGHT-TANK': 'corazzati', 'TNK-FRA-MEDIUM-TANK': 'corazzati', 'TNK-FRA-R35': 'corazzati', 'TNK-FRA-H35': 'corazzati', 'TNK-FRA-FCM36': 'corazzati', 'TNK-FRA-AMR35': 'corazzati', 'TNK-FRA-SOMUA-S35': 'corazzati', 'TNK-FRA-D2': 'corazzati', 'TNK-FRA-B1': 'corazzati', // carri francesi per modello (25/11/2026)
  'INW-JPN-ARISAKA-T99': 'individuali', 'INW-JPN-PISTOL-T14': 'individuali', 'INW-JPN-SMG-T100': 'individuali', 'MG-JPN-T11': 'mitragliatrici', 'MG-JPN-T96': 'mitragliatrici', 'MG-JPN-T99': 'mitragliatrici', 'MG-JPN-T92': 'mitragliatrici', 'GL-JPN-T89': 'individuali', 'ART-JPN-MOR81-T97': 'mortai', 'ART-JPN-MOR90-T94': 'mortai', 'ART-JPN-GUN70-T92': 'artiglieria', 'ART-JPN-GUN75-MT-T94': 'artiglieria', 'ART-JPN-GUN75-T38': 'artiglieria', 'ART-JPN-GUN75-T90': 'artiglieria', 'ART-JPN-HOW105-T91': 'artiglieria', 'ART-JPN-HOW150-T96': 'artiglieria', 'ART-JPN-AA20-T98': 'contraerea', 'ART-JPN-AA75-T88': 'contraerea', 'VEH-JPN-ISUZU-T94': 'veicoli', 'VEH-JPN-NISSAN-180': 'veicoli', 'VEH-JPN-TRACTOR-T92': 'veicoli', 'VEH-JPN-MOTO-RIKUO': 'veicoli', 'VEH-JPN-MOTO-T97': 'veicoli', 'VEH-JPN-AC-T93': 'veicoli', // Giappone, catalogo per modelli (25/11/2026)
  'INW-DEU-G43': 'individuali', 'INW-USSR-SVT40': 'individuali', 'INW-USA-GARAND': 'individuali', 'INW-USA-CARBINE-M1': 'individuali', // fucili nello schema unico (21/11/2026)
  'ART-USA-HOW155-M1918': 'artiglieria', // obice M1918 (21/11/2026)
  'TNK-USA-M2A2': 'corazzati', 'TNK-USA-M2A4': 'corazzati', 'TNK-USA-M3-STUART': 'corazzati', 'TNK-USA-M5-STUART': 'corazzati', 'TNK-USA-M24': 'corazzati', 'TNK-USA-M2-MEDIUM': 'corazzati', 'TNK-USA-M3-LEE': 'corazzati', 'TNK-USA-M4-75': 'corazzati', 'TNK-USA-M4-76': 'corazzati', 'TNK-USA-M26': 'corazzati', 'TD-USA-M10': 'corazzati', 'TD-USA-M18': 'corazzati', 'TD-USA-M36': 'corazzati', 'ART-USA-M7-PRIEST': 'artiglieria', // carri USA per modello (21/11/2026)
  'TD-DEU-STUG-III': 'corazzati', 'TD-DEU-STUG-III-G': 'corazzati', 'TD-DEU-PZJG-I': 'corazzati', 'TD-DEU-MARDER-III': 'corazzati', 'TD-DEU-JPZ-IV': 'corazzati', 'TD-DEU-HETZER': 'corazzati', 'TD-DEU-JAGDPANTHER': 'corazzati', // cacciacarri
  fucili: 'individuali', pistole: 'individuali', 'INW-DEU-RIFLE-1939': 'individuali', 'INW-DEU-PISTOL-1939': 'individuali',
  'INW-FRA-RIFLE-1939': 'individuali', 'INW-FRA-PISTOL-1939': 'individuali', 'INW-ITA-RIFLE-1940': 'individuali', 'INW-ITA-PISTOL-1940': 'individuali',
  'INW-USSR-RIFLE-1939': 'individuali', 'INW-JPN-RIFLE-1939': 'individuali', 'INW-USA-RIFLE-1940': 'individuali', 'INW-GBR-RIFLE': 'individuali',
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
  'TNK-USSR-KV-1940': 'corazzati', 'TNK-USSR-T34-1940': 'corazzati', 'TNK-USSR-BT-1940': 'corazzati', 'TNK-USSR-T26-1940': 'corazzati', 'ART-USSR-HOW122-ARM-1940': 'artiglieria', 'ART-USSR-HOW152-ARM-1940': 'artiglieria',
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
