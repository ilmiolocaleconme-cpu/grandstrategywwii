// Scelta dei modelli dell'IA (23/11/2026, IA passo 2; decisioni dell'utente 2A e 3A). Funzioni PURE.
//  - valore di un modello = (fuoco contro fanteria + fuoco contro carri) × corazza, come in battaglia (battle_v2.json, weaponWeight), diviso per le
//    tonnellate d'acciaio del pezzo; × la dottrina della nazione per il suo gruppo (data/ai/doctrines.json, al massimo +15% per settore).
//    La corazza conta: senza, il Pz III varrebbe appena il 12% più del Pz II per tonnellata e la Germania non lo produrrebbe mai.
//  - una linea che lavora passa a un modello migliore che riempie lo stesso posto nelle divisioni solo se il punteggio è almeno UPGRADE_GAIN volte
//    quello attuale (+20%: il malus d'esperienza della riconversione dev'essere ripagato).
import { weaponWeight } from './battleV2.js';
import { doctrineFactor } from '../data/doctrines.js';

export const UPGRADE_GAIN = 1.2;

/** Gruppo di equipaggiamento della dottrina (src/rules/unitSheet.js) per categoria del catalogo. */
export const DOCTRINE_ROLE = Object.freeze({
  INDIVIDUAL_WEAPON: 'individuali', MACHINE_GUN: 'mitragliatrici', GRENADE_LAUNCHER: 'anticarro', MORTAR: 'mortai',
  ANTI_TANK_GUN: 'anticarro', FIELD_GUN: 'artiglieria', HOWITZER: 'artiglieria', ROCKET_ARTILLERY: 'artiglieria', ANTI_AIRCRAFT_GUN: 'contraerea',
  TANK: 'corazzati', TANK_DESTROYER: 'anticarro', TRUCK: 'veicoli', HALF_TRACK: 'veicoli', ARMORED_CAR: 'veicoli', SPECIAL_VEHICLE: 'veicoli',
});

/** Valore in battaglia per tonnellata (senza dottrina), null se il modello non ha peso in battaglia o massa. */
export function valuePerTonne(weapon, massTonnes, cfg) {
  if (!weapon || !(massTonnes > 0)) return null;
  const w = weaponWeight(weapon, cfg);
  if (!w) return null;
  const v = ((w.soft ?? 0) + (w.hard ?? 0)) * (w.armor ?? 1);
  return v > 0 ? v / massTonnes : null;
}

/** Punteggio del modello: valore per tonnellata × dottrina del suo gruppo. `active` = doctrinesOf(...). null se non valutabile. */
export function modelScore(weapon, massTonnes, cfg, active = null) {
  const v = valuePerTonne(weapon, massTonnes, cfg);
  if (v == null) return null;
  const role = DOCTRINE_ROLE[weapon.category];
  return v * (active && role ? doctrineFactor(active, { role }) : 1);
}

/** Il candidato con il punteggio più alto, se supera `gain` volte quello attuale; altrimenti null. scoreOf(x) → number | null. */
export function betterModel(current, candidates, scoreOf, gain = UPGRADE_GAIN) {
  const base = scoreOf(current);
  if (!(base > 0)) return null;
  let best = null; let bestScore = base * gain;
  for (const c of candidates) {
    const s = scoreOf(c);
    if (s != null && s >= bestScore && (best == null || s > bestScore)) { best = c; bestScore = s; }
  }
  return best;
}

/** Posti nelle divisioni riforniti da ogni prodotto: Map(prodotto → Set(voci)). Due prodotti con una voce in comune sono intercambiabili. */
export function productSlots(divisions, sourcesOf) {
  const slots = new Map();
  for (const d of divisions) for (const [k, v] of Object.entries(d.items ?? {})) {
    if (!k.startsWith('equipment.') || !(v?.planned > 0)) continue;
    for (const s of sourcesOf ? sourcesOf(k) : [k]) {
      if (!slots.has(s)) slots.set(s, new Set());
      slots.get(s).add(k);
    }
  }
  return slots;
}

/** Vero se i due prodotti riempiono almeno una voce in comune. */
export function sameSlot(slots, a, b) {
  const A = slots.get(a); const B = slots.get(b);
  if (!A || !B) return false;
  for (const x of A) if (B.has(x)) return true;
  return false;
}

/**
 * Voci di classe che l'IA non deve produrre (21/11/2026): bersagli di `sameAs` nel catalogo (es. TNK-DEU-TANK, i carri medi USA 1940).
 * 23/11/2026: escluse quelle che sono anche un modello vero con il suo peso in battaglia (tankModels): T-26, T-34 (1940) e KV-1 sovietici,
 * che prima l'IA non poteva più produrre.
 */
export function classIdsWithModels(catalog, cfg) {
  const own = cfg?.firepower?.tankModels ?? {};
  return new Set(catalog.entries.filter((e) => e.sameAs).map((e) => e.sameAs).filter((id) => !own[id]));
}
