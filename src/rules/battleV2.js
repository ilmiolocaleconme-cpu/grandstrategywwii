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
 * Peso di un'arma: { soft, hard, class, armor }. weapon: categoria (stringa) oppure { id, category, caliber, role }. Per i carri vale prima il
 * peso del modello (`tankModels`, per id), poi quello del ruolo.
 * Con il calibro si usa la fascia di `byCaliber` (prima fascia con max >= calibro); per i carri il `role` del catalogo sceglie `tankRoles`
 * (anche la corazza relativa `armor`); senza calibro né ruolo noti vale il peso medio della categoria.
 */
export function weaponWeight(weapon, cfg) {
  const w = typeof weapon === 'string' ? { category: weapon } : weapon;
  const base = cfg.firepower.weights[w?.category];
  if (!base) return null;
  if (w.category === 'TANK' || w.category === 'TANK_DESTROYER') { // cacciacarri e cannoni d'assalto: pesati per modello come i carri (18/11/2026)
    const m = cfg.firepower.tankModels?.[w.id]; // peso proprio del modello (es. i Panzer tedeschi), prima del ruolo
    if (m) return { soft: m.soft, hard: m.hard, class: base.class, armor: m.armor };
    const r = cfg.firepower.tankRoles?.[w.role];
    return r ? { soft: r.soft, hard: r.hard, class: base.class, armor: r.armor } : { ...base, armor: 1 };
  }
  const byRole = w.role ? cfg.firepower.byRole?.[w.role] : null; // peso per ruolo, prima del calibro (21/11/2026: fucile semiautomatico, carabina)
  if (byRole) return { soft: byRole.soft, hard: byRole.hard, class: base.class, armor: 1 };
  const band = typeof w.caliber === 'number' ? (cfg.firepower.byCaliber?.[w.category] ?? []).find((x) => w.caliber <= x.max) : null;
  return band ? { soft: band.soft, hard: band.hard, class: base.class, armor: 1 } : { ...base, armor: 1 };
}

/**
 * Fuoco grezzo di una divisione dalle sue armi effettive. items: voci della divisione; weaponOf(voce) → categoria | { category, caliber, role } | null;
 * men: uomini effettivi (per colmare i BUCHI DEI DATI: vedi `defaults`). Ritorna { recognized, small: { soft, hard }, artillery, direct, armor, filled }
 * (somme dei pezzi × peso); recognized = false se nessuna voce ha una quantità nota (allora vale la regola di prima, per uomini).
 * armor = corazza media dei carri effettivi (1 = carro medio; 1 anche senza carri noti): scala la quota corazzata della divisione.
 * Buchi: molti template non hanno il numero di fucili o di mitragliatrici (quantità ignota). Una divisione riconosciuta senza NESSUNA quantità
 * nota di armi individuali, di mitragliatrici o dell'intera classe artiglieria riceve per quella voce il valore medio per uomo di `defaults`:
 * un dato mancante non deve valere zero. `filled` elenca le voci colmate.
 */
/**
 * Parti di una voce di carri: [{ n, weapon }]. La voce può essere una CLASSE generica (i «carri armati» dei template tedeschi) che contiene modelli
 * diversi: `item.models` = { id del modello: pezzi } registra i carri arrivati dalla produzione per modello (src/rules/reinforcements.js); se
 * superano gli effettivi si riducono in proporzione. Il resto (carri mai tracciati: la dotazione iniziale) si divide secondo `fleetMix` della
 * classe per l'anno `year` (anno di nascita della divisione); senza `fleetMix` vale la voce così com'è.
 */
export function tankParts(item, weapon, n, year, cfg, resolve) {
  const model = (id) => resolve?.(id) ?? { id, category: weapon?.category ?? 'TANK', role: null }; // 21/11/2026: vale per ogni categoria (predecessori), non solo per i carri
  const tracked = Object.entries(item?.models ?? {}).filter(([, q]) => q > 0);
  const total = tracked.reduce((s, [, q]) => s + q, 0);
  const scale = total > n && total > 0 ? n / total : 1;
  const parts = tracked.map(([id, q]) => ({ n: q * scale, weapon: model(id) }));
  const rest = Math.max(0, n - total * scale);
  if (!(rest > 0)) return parts;
  const fleet = cfg.firepower.fleetMix?.[weapon?.id];
  if (!fleet?.length) return [...parts, { n: rest, weapon }];
  const row = [...fleet].reverse().find((r) => r.from <= year) ?? fleet[0];
  return [...parts, ...Object.entries(row.mix).map(([id, share]) => ({ n: rest * share, weapon: model(id) }))];
}

// opts: { year (anno di nascita della divisione, per `fleetMix`), resolve(id del modello) → arma del catalogo }
export function rawFirepower(items, weaponOf, cfg, men = 0, opts = {}) {
  const out = { recognized: false, small: { soft: 0, hard: 0 }, artillery: { soft: 0, hard: 0 }, direct: { soft: 0, hard: 0 }, armor: 1, filled: [] };
  const known = new Set();
  let tanks = 0; let armor = 0;
  for (const [k, v] of Object.entries(items ?? {})) {
    const weapon = weaponOf(k);
    const c = typeof weapon === 'string' ? weapon : weapon?.category;
    const w = weaponWeight(weapon, cfg);
    if (!w || !(v?.planned > 0)) continue;
    out.recognized = true; known.add(c); known.add(`class:${w.class}`);
    const n = Math.max(0, v.effective ?? 0);
    // una voce può contenere più modelli: i carri (fleetMix, scorte equivalenti) e, dal 21/11/2026, qualsiasi arma coperta da un modello
    // precedente (data/units/equipment/replacements.json): ogni pezzo vale come il proprio modello
    const tracked = Object.values(v.models ?? {}).some((q) => q > 0);
    if (typeof weapon === 'object' && (c === 'TANK' || tracked)) {
      for (const part of tankParts(v, weapon, n, opts.year ?? 0, cfg, opts.resolve)) {
        const pw = weaponWeight(part.weapon, cfg) ?? w;
        out[w.class].soft += part.n * pw.soft; out[w.class].hard += part.n * pw.hard;
        if (c === 'TANK' || c === 'TANK_DESTROYER') { tanks += part.n; armor += part.n * pw.armor; }
      }
      continue;
    }
    out[w.class].soft += n * w.soft; out[w.class].hard += n * w.hard;
    if (c === 'TANK' || c === 'TANK_DESTROYER') { tanks += n; armor += n * w.armor; } // i cacciacarri entrano nella corazza media
  }
  if (tanks > 0) out.armor = armor / tanks;
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

/** Quota corazzata (0..1) di una parte: media delle categorie pesata sugli uomini, scalata dalla corazza dei carri (`armor`); `fuel` (copertura 0..1) la riduce per chi dipende dal carburante. */
export function sideHardness(units, cfg) {
  let men = 0; let hard = 0;
  for (const u of units) {
    const m = Math.max(0, u.effective ?? 0);
    const fuel = cfg.supply.fuelCategories.includes(u.category) ? clamp(u.fuel ?? 1, 0, 1) : 1;
    men += m; hard += m * clamp((cfg.firepower.hardness[u.category] ?? 0) * (u.armor ?? 1), 0, 0.95) * fuel;
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

/** Posti occupati nel fronte: 1 per una divisione, `frontage.brigadeSlot` (0.5) per una brigata (18/11/2026). */
export function unitSlot(u, cfg) {
  return u?.echelon === 'brigade' ? (cfg?.frontage?.brigadeSlot ?? 0.5) : 1;
}

/**
 * Divide una parte in linea e riserva: in linea le più coese (a parità più uomini, poi id) finché i posti occupati non superano `width`.
 * slot(u) → posti dell'unità (predefinito 1: allora entrano esattamente `width` unità). Ritorna { line, reserve }.
 */
export function splitLine(units, width, slot = () => 1) {
  const sorted = [...units].sort((a, b) => (b.cohesion - a.cohesion) || (b.effective - a.effective) || (a.id < b.id ? -1 : 1));
  const line = []; const reserve = []; let used = 0;
  for (const u of sorted) {
    const s = slot(u);
    if (used + s <= width + 1e-9) { line.push(u); used += s; } else reserve.push(u);
  }
  return { line, reserve };
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

export function validateBattleV2(cfg, { weaponCategories = null, catalogIds = null } = {}) {
  if (cfg?.schema !== BATTLE_V2_SCHEMA) return [`battaglia v2: schema ${JSON.stringify(cfg?.schema)}`];
  const e = [];
  const unit = (v) => v >= 0 && v <= 1;
  for (const [c, w] of Object.entries(cfg.firepower?.weights ?? {})) {
    if (weaponCategories && !weaponCategories.has(c)) e.push(`battaglia v2: categoria d'arma ${c} inesistente`);
    if (!(w.soft >= 0) || !(w.hard >= 0) || !WEAPON_CLASSES.includes(w.class)) e.push(`battaglia v2: peso di ${c} non valido`);
  }
  if (!Object.keys(cfg.firepower?.weights ?? {}).length) e.push('battaglia v2: nessun peso');
  for (const [c, bands] of Object.entries(cfg.firepower?.byCaliber ?? {})) {
    if (!cfg.firepower.weights?.[c]) e.push(`battaglia v2: byCaliber di ${c} senza peso di categoria`);
    let prev = 0;
    for (const b of bands ?? []) { if (!(b.max > prev) || !(b.soft >= 0) || !(b.hard >= 0)) e.push(`battaglia v2: fascia di calibro di ${c} non valida`); prev = b.max; }
  }
  for (const [id, v] of Object.entries(cfg.firepower?.tankModels ?? {})) if (!(v.soft >= 0) || !(v.hard >= 0) || !(v.armor > 0 && v.armor <= 2)) e.push(`battaglia v2: modello di carro ${id} non valido`);
  for (const [id, rows] of Object.entries(cfg.firepower?.fleetMix ?? {})) {
    let prev = -Infinity;
    for (const row of rows ?? []) {
      if (!(row.from > prev)) e.push(`battaglia v2: fleetMix di ${id} non in ordine di anno`);
      prev = row.from;
      const sum = Object.values(row.mix ?? {}).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-6) e.push(`battaglia v2: fleetMix di ${id} dal ${row.from} non somma a 1`);
      if (catalogIds) for (const m of Object.keys(row.mix ?? {})) if (!catalogIds.has(m)) e.push(`battaglia v2: fleetMix di ${id}, modello ${m} inesistente`);
    }
    if (catalogIds && !catalogIds.has(id)) e.push(`battaglia v2: fleetMix di ${id} inesistente nel catalogo`);
  }
  if (catalogIds) for (const id of Object.keys(cfg.firepower?.tankModels ?? {})) if (!catalogIds.has(id)) e.push(`battaglia v2: modello di carro ${id} inesistente nel catalogo`);
  for (const [r, v] of Object.entries(cfg.firepower?.tankRoles ?? {})) if (!(v.soft >= 0) || !(v.hard >= 0) || !(v.armor > 0 && v.armor <= 2)) e.push(`battaglia v2: tipo di carro ${r} non valido`);
  const cd = cfg.condition ?? {};
  if (!(cd.experiencePerDay >= 0) || !(cd.experienceCap > 0 && cd.experienceCap <= 100)) e.push('battaglia v2: esperienza sul campo non valida');
  for (const k of ['moraleWin', 'moraleRetreat', 'moraleHeavyLoss', 'moraleRecoverPerDay']) if (!(cd[k] >= 0)) e.push(`battaglia v2: ${k} non valido`);
  if (!(cd.heavyLossShare > 0 && cd.heavyLossShare < 1)) e.push('battaglia v2: heavyLossShare fuori da 0..1');
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

/**
 * Anno della composizione dei carri NON registrati come modello (fleetMix) di una divisione (21/11/2026, decisione dell'utente): l'anno d'inizio
 * della partita, non quello di formazione o dell'ultimo cambio di template. Così i carri iniziali restano quelli del 1936 e una divisione migliora
 * solo con la produzione e la modernizzazione (pezzi registrati in `models`).
 */
export function fleetYearOf(state, division) {
  return Number(String(state?.startDate ?? division?.since ?? '').slice(0, 4)) || 0;
}
