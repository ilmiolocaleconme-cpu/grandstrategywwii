// Battaglia terrestre v2: potenza di fuoco dalle armi, coesione, larghezza del fronte, munizioni e carburante, perdite divise, preparazione
// d'artiglieria, inseguimento, stagione. Funzioni PURE. I numeri stanno in data/units/battle_v2.json (IPOTESI DI BILANCIAMENTO, da approvare).
import { TERRAIN_CLASSES, COMBAT_CATEGORIES } from './terrainCombat.js';

export const BATTLE_V2_SCHEMA = 'battle-v2';
export const WEAPON_CLASSES = Object.freeze(['small', 'artillery', 'direct']);
export const COHESION_SCHEMA = 'cohesion-v1';
export const CASUALTIES_SCHEMA = 'casualties-v1';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (x) => Math.round(x * 100) / 100;

// ---- 1. potenza di fuoco ------------------------------------------------------------------------------------------------------------------

/**
 * Fuoco grezzo di una divisione dalle sue armi effettive. items: voci della divisione; categoryOf(voce) → categoria d'arma | null;
 * men: uomini effettivi (per colmare i BUCHI DEI DATI: vedi `defaults`). Ritorna { recognized, small: { soft, hard }, artillery, direct, filled }
 * (somme dei pezzi × peso); recognized = false se nessuna voce ha una quantità nota (allora vale la regola di prima, per uomini).
 * Buchi: molti template non hanno il numero di fucili o di mitragliatrici (quantità ignota). Una divisione riconosciuta senza NESSUNA quantità
 * nota di armi individuali, di mitragliatrici o dell'intera classe artiglieria riceve per quella voce il valore medio per uomo di `defaults`:
 * un dato mancante non deve valere zero. `filled` elenca le voci colmate.
 */
export function rawFirepower(items, categoryOf, cfg, men = 0) {
  const out = { recognized: false, small: { soft: 0, hard: 0 }, artillery: { soft: 0, hard: 0 }, direct: { soft: 0, hard: 0 }, filled: [] };
  const known = new Set();
  for (const [k, v] of Object.entries(items ?? {})) {
    const c = categoryOf(k);
    const w = cfg.firepower.weights[c];
    if (!w || !(v?.planned > 0)) continue;
    out.recognized = true; known.add(c); known.add(`class:${w.class}`);
    const n = Math.max(0, v.effective ?? 0);
    out[w.class].soft += n * w.soft; out[w.class].hard += n * w.hard;
  }
  const d = cfg.firepower.defaults; const m = Math.max(0, men);
  if (out.recognized && d && m > 0) {
    if (!known.has('INDIVIDUAL_WEAPON')) { out.small.soft += m * d.rifleSoftPerMan; out.filled.push('INDIVIDUAL_WEAPON'); }
    if (!known.has('MACHINE_GUN')) { out.small.soft += m * d.mgSoftPerMan; out.filled.push('MACHINE_GUN'); }
    if (!known.has('class:artillery')) { out.artillery.soft += m * d.artillerySoftPerMan; out.artillery.hard += m * d.artilleryHardPerMan; out.filled.push('artillery'); }
  }
  return out;
}

/** Quota di serventi: 1 finché gli uomini sono almeno `crewFullAt` del previsto, poi in proporzione. */
export function crewFactor(effective, planned, cfg) {
  if (!(planned > 0)) return 1;
  return clamp(effective / planned / cfg.firepower.crewFullAt, 0, 1);
}

/** Quota corazzata (0..1) di una parte: media delle categorie pesata sugli uomini; `fuel` (copertura 0..1) la riduce per chi dipende dal carburante. */
export function sideHardness(units, cfg) {
  let men = 0; let hard = 0;
  for (const u of units) {
    const m = Math.max(0, u.effective ?? 0);
    const fuel = cfg.supply.fuelCategories.includes(u.category) ? clamp(u.fuel ?? 1, 0, 1) : 1;
    men += m; hard += m * (cfg.firepower.hardness[u.category] ?? 0) * fuel;
  }
  return men > 0 ? hard / men : 0;
}

/** Moltiplicatori delle munizioni per classe d'arma, data la copertura (0..1): da ammoFloor a 1. */
export function ammoFactors(coverage, cfg) {
  const c = clamp(coverage ?? 1, 0, 1);
  return Object.fromEntries(WEAPON_CLASSES.map((k) => [k, cfg.supply.ammoFloor[k] + (1 - cfg.supply.ammoFloor[k]) * c]));
}

/** Moltiplicatore del carburante per una categoria (1 per chi marcia a piedi). */
export function fuelFactor(category, coverage, cfg) {
  if (!cfg.supply.fuelCategories.includes(category)) return 1;
  return cfg.supply.fuelFloor + (1 - cfg.supply.fuelFloor) * clamp(coverage ?? 1, 0, 1);
}

/**
 * Potenza base di una divisione contro un nemico con quota corazzata `enemyHardness`, nella scala di prima (≈ uomini per una fanteria tipo).
 * raw: rawFirepower(); opts: { effective, planned, category, ammo (0..1), fuel (0..1), prep (true = preparazione d'artiglieria) }.
 */
export function firepowerBase(raw, enemyHardness, opts, cfg) {
  const h = clamp(enemyHardness ?? 0, 0, 1);
  const af = ammoFactors(opts.ammo, cfg);
  let total = 0;
  for (const k of WEAPON_CLASSES) {
    const prep = k === 'artillery' && opts.prep ? 1 + cfg.phases.prepArtilleryBonus : 1;
    total += (raw[k].soft * (1 - h) + raw[k].hard * h) * af[k] * prep;
  }
  return total * cfg.firepower.scale * crewFactor(opts.effective, opts.planned, cfg) * fuelFactor(opts.category, opts.fuel, cfg);
}

/** Quota del fuoco contro fanteria data dall'artiglieria (0..1), per le schede e i test. */
export function artilleryShare(raw) {
  const all = raw.small.soft + raw.artillery.soft + raw.direct.soft;
  return all > 0 ? raw.artillery.soft / all : 0;
}

// ---- 2. coesione --------------------------------------------------------------------------------------------------------------------------

export const createCohesion = () => ({ schema: COHESION_SCHEMA, byUnit: {} });
export const cohesionOf = (cohesion, unitId) => clamp(cohesion?.byUnit?.[unitId] ?? 100, 0, 100);

/** Tenuta di una divisione: più alta = la coesione cala più piano. cond: { morale, experience } (0..100); commander: ha un comandante sopra. */
export function resilience(cond, commander, cfg) {
  const r = cfg.cohesion.resilience;
  return r.base + r.morale * clamp(cond?.morale ?? 70, 0, 100) / 100 + r.experience * clamp(cond?.experience ?? 45, 0, 100) / 100 + (commander ? r.commander : 0);
}

/** Calo di coesione di un giorno in linea. ratio = potenza nemica / propria; defending = difende il posto; entrench = quota del trinceramento massimo (0..1). */
export function cohesionLoss({ ratio, cond, commander = false, entrench = 0, defending = false }, cfg) {
  const c = cfg.cohesion;
  const pressure = Number.isFinite(ratio) ? clamp(ratio, 0, c.lossCap) : c.lossCap;
  return r2(c.lossBase * pressure / resilience(cond, commander, cfg) * (defending ? 1 - c.defenderShield : 1) * (1 - c.entrenchShield * clamp(entrench, 0, 1)));
}

/** Moltiplicatore della potenza per la coesione: da powerFloor (0) a 1 (100). */
export const cohesionPower = (value, cfg) => cfg.cohesion.powerFloor + (1 - cfg.cohesion.powerFloor) * clamp(value, 0, 100) / 100;

/** Moltiplicatore della potenza per l'esperienza (0..100). */
export function experiencePower(experience, cfg) {
  const e = cfg.cohesion.experiencePower;
  return e.min + (e.max - e.min) * clamp(experience ?? 50, 0, 100) / 100;
}

/** Una parte cede: coesione media in linea (pesata sugli uomini) a breakAt o sotto. units: [{ effective, cohesion }]. */
export function sideBreaks(units, cfg) {
  let men = 0; let sum = 0;
  for (const u of units) { const m = Math.max(0, u.effective); men += m; sum += m * u.cohesion; }
  return men > 0 && sum / men <= cfg.cohesion.breakAt;
}

/** Recupero di un giorno fuori dalla linea: mode = 'idle' | 'moving' | 'reserve'. Ritorna il nuovo valore (max 100). */
export function recoverCohesion(value, mode, cfg) {
  const step = mode === 'moving' ? cfg.cohesion.recoverMoving : mode === 'reserve' ? cfg.cohesion.recoverReserve : cfg.cohesion.recoverIdle;
  return Math.min(100, r2(value + step));
}

// ---- 3. larghezza del fronte --------------------------------------------------------------------------------------------------------------

/** Divisioni in linea per parte: zona urbana = `urbano`; altrimenti media pesata sulle frazioni del terreno; senza dato = pianura. Intero >= 1. */
export function frontageOf(terrain, isCity, cfg) {
  const f = cfg.frontage;
  if (isCity) return f.urbano;
  let sum = 0; let w = 0;
  for (const [k, v] of Object.entries(terrain?.frazioni ?? {})) if (v > 0 && f[k] > 0) { sum += v * f[k]; w += v; }
  return Math.max(1, Math.round(w > 0 ? sum / w : f.pianura));
}

/** Divide una parte in linea e riserva: in linea le `width` più coese (a parità più uomini, poi id). Ritorna { line, reserve }. */
export function splitLine(units, width) {
  const sorted = [...units].sort((a, b) => (b.cohesion - a.cohesion) || (b.effective - a.effective) || (a.id < b.id ? -1 : 1));
  return { line: sorted.slice(0, width), reserve: sorted.slice(width) };
}

// ---- 4. rifornimenti ----------------------------------------------------------------------------------------------------------------------

/** Preleva `need` tonnellate da una scorta: { coverage (0..1), used, left }. Fabbisogno nullo = copertura piena. */
export function drawSupply(stock, need) {
  if (!(need > 0)) return { coverage: 1, used: 0, left: stock ?? 0 };
  const have = Math.max(0, stock ?? 0);
  const used = Math.min(have, need);
  return { coverage: used / need, used: Math.round(used * 1000) / 1000, left: Math.round((have - used) * 1000) / 1000 };
}

// ---- 5. perdite divise --------------------------------------------------------------------------------------------------------------------

/** Divide `loss` uomini in { killed, wounded, missing } interi che sommano a loss (il resto dell'arrotondamento va ai feriti). */
export function splitCasualties(loss, cfg) {
  const n = Math.max(0, Math.round(loss));
  const killed = Math.floor(n * cfg.casualties.killed);
  const missing = Math.floor(n * cfg.casualties.missing);
  return { killed, wounded: n - killed - missing, missing };
}

/** Quota di uomini mobili (cavalleria, motorizzati, corazzati) di una parte: 0..1. */
export function mobileShare(units, cfg) {
  let men = 0; let mob = 0;
  for (const u of units) { const m = Math.max(0, u.effective); men += m; if (cfg.casualties.mobileCategories.includes(u.category)) mob += m; }
  return men > 0 ? mob / men : 0;
}

/** Prigionieri lasciati da una divisione in ritirata con `men` uomini rimasti, inseguita da una parte con quota mobile `mobile`. */
export function retreatPrisoners(men, mobile, cfg) {
  return Math.min(men, Math.round(men * (cfg.casualties.retreatPrisoners + cfg.casualties.pursuit * clamp(mobile, 0, 1))));
}

export const createCasualties = () => ({ schema: CASUALTIES_SCHEMA, byNation: {} });
const ZERO = Object.freeze({ killed: 0, wounded: 0, missing: 0, prisoners: 0, hospital: 0, recovered: 0 });
export const casualtiesOf = (casualties, nation) => ({ ...ZERO, ...(casualties?.byNation?.[nation] ?? {}) });

/** Aggiunge perdite al registro di una nazione. add: { killed?, wounded?, missing?, prisoners? }; i feriti entrano anche in `hospital`. */
export function addCasualties(casualties, nation, add) {
  const base = casualties ?? createCasualties();
  const cur = casualtiesOf(base, nation);
  const next = { ...cur, killed: cur.killed + (add.killed ?? 0), wounded: cur.wounded + (add.wounded ?? 0), missing: cur.missing + (add.missing ?? 0), prisoners: cur.prisoners + (add.prisoners ?? 0), hospital: cur.hospital + (add.wounded ?? 0) };
  return { ...base, byNation: { ...base.byNation, [nation]: next } };
}

/** Uomini tolti per sempre (o per ora) al pool reclutabile: morti, dispersi, prigionieri e feriti ancora in ospedale. */
export function casualtyDrain(casualties, nation) {
  const c = casualtiesOf(casualties, nation);
  return Math.round(c.killed + c.missing + c.prisoners + c.hospital);
}

// ---- 6. stagione --------------------------------------------------------------------------------------------------------------------------

/** Moltiplicatore dell'ATTACCANTE per stagione e posizione. date: 'AAAA-MM-GG'; centre: [lon, lat] | null. */
export function seasonFactor(date, centre, category, cfg) {
  if (!centre) return 1;
  const month = Number(String(date).slice(5, 7));
  const [lon, lat] = centre;
  const w = cfg.season.winter; const m = cfg.season.mud;
  let f = 1;
  if (w.months.includes(month) && lat >= w.minLat) f *= w.attacker;
  if (m.months.includes(month) && lat >= m.minLat && lon >= m.minLon && cfg.casualties.mobileCategories.includes(category)) f *= m.attackerMobile;
  return f;
}

// ---- validazione --------------------------------------------------------------------------------------------------------------------------

export function validateBattleV2(cfg, { weaponCategories = null } = {}) {
  if (cfg?.schema !== BATTLE_V2_SCHEMA) return [`battaglia v2: schema ${JSON.stringify(cfg?.schema)}`];
  const e = [];
  const unit = (v) => v >= 0 && v <= 1;
  for (const [c, w] of Object.entries(cfg.firepower?.weights ?? {})) {
    if (weaponCategories && !weaponCategories.has(c)) e.push(`battaglia v2: categoria d'arma ${c} inesistente`);
    if (!(w.soft >= 0) || !(w.hard >= 0) || !WEAPON_CLASSES.includes(w.class)) e.push(`battaglia v2: peso di ${c} non valido`);
  }
  if (!Object.keys(cfg.firepower?.weights ?? {}).length) e.push('battaglia v2: nessun peso');
  if (!(cfg.firepower?.scale > 0)) e.push('battaglia v2: scale non valido');
  for (const k of ['rifleSoftPerMan', 'mgSoftPerMan', 'artillerySoftPerMan', 'artilleryHardPerMan']) if (!(cfg.firepower?.defaults?.[k] >= 0)) e.push(`battaglia v2: defaults.${k} non valido`);
  if (!(cfg.firepower?.crewFullAt > 0 && cfg.firepower.crewFullAt <= 1)) e.push('battaglia v2: crewFullAt fuori da 0..1');
  for (const c of COMBAT_CATEGORIES) if (!unit(cfg.firepower?.hardness?.[c])) e.push(`battaglia v2: quota corazzata di ${c} fuori da 0..1`);
  if (!(cfg.losses?.base > 0 && cfg.losses.base <= 0.2) || !(cfg.losses?.cap >= 1)) e.push('battaglia v2: perdite (base o tetto) non valide');
  const co = cfg.cohesion ?? {};
  if (!(co.lossBase > 0) || !(co.lossCap >= 1) || !(co.breakAt > 0 && co.breakAt < 100)) e.push('battaglia v2: coesione, calo o soglia non validi');
  for (const k of ['recoverIdle', 'recoverMoving', 'recoverReserve']) if (!(co[k] > 0)) e.push(`battaglia v2: ${k} non valido`);
  if (!unit(co.powerFloor) || !unit(co.entrenchShield) || !unit(co.defenderShield)) e.push('battaglia v2: powerFloor o entrenchShield fuori da 0..1');
  if (!(co.resilience?.base > 0)) e.push('battaglia v2: tenuta di base non valida');
  if (!(co.experiencePower?.min > 0 && co.experiencePower.max >= co.experiencePower.min)) e.push('battaglia v2: esperienza non valida');
  for (const k of [...TERRAIN_CLASSES, 'urbano']) if (!(Number.isInteger(cfg.frontage?.[k]) && cfg.frontage[k] >= 1)) e.push(`battaglia v2: fronte di «${k}» deve essere un intero >= 1`);
  for (const k of WEAPON_CLASSES) if (!unit(cfg.supply?.ammoFloor?.[k])) e.push(`battaglia v2: ammoFloor.${k} fuori da 0..1`);
  if (!unit(cfg.supply?.fuelFloor)) e.push('battaglia v2: fuelFloor fuori da 0..1');
  for (const c of [...(cfg.supply?.fuelCategories ?? []), ...(cfg.casualties?.mobileCategories ?? [])]) if (!COMBAT_CATEGORIES.includes(c)) e.push(`battaglia v2: categoria ${c} sconosciuta`);
  const ca = cfg.casualties ?? {};
  if (Math.abs((ca.killed ?? 0) + (ca.wounded ?? 0) + (ca.missing ?? 0) - 1) > 1e-9) e.push('battaglia v2: morti + feriti + dispersi devono sommare a 1');
  if (!unit(ca.retreatPrisoners) || !unit(ca.pursuit)) e.push('battaglia v2: prigionieri o inseguimento fuori da 0..1');
  if (!(cfg.phases?.prepDays >= 0) || !(cfg.phases?.prepArtilleryBonus >= 0) || !unit(cfg.phases?.prepMinAmmo)) e.push('battaglia v2: preparazione non valida');
  for (const k of ['winter', 'mud']) if (!Array.isArray(cfg.season?.[k]?.months)) e.push(`battaglia v2: stagione ${k} senza mesi`);
  if (!(cfg.season?.winter?.attacker > 0 && cfg.season.winter.attacker <= 1) || !(cfg.season?.mud?.attackerMobile > 0 && cfg.season.mud.attackerMobile <= 1)) e.push('battaglia v2: moltiplicatori di stagione fuori da 0..1');
  return e;
}
