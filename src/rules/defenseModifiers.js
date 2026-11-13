// Moltiplicatore di difesa di una provincia da terreno e fortificazioni (data/combat/defense_modifiers.json). Funzioni PURE.
// Si passa a resolveBattleDay come `defenseMultiplier`. I numeri sono ipotesi di bilanciamento (vedi il file). Nulla viene inventato:
// terreno o livello sconosciuti valgono 1.
export const DEFENSE_SCHEMA = 'defense-modifiers-v1';
const TERRAINS = ['pianura', 'collina', 'montagna', 'foresta', 'palude', 'deserto', 'tundra'];
const LEVELS = ['0', '1', '2', '3'];

/** Errori del documento (vuoto = valido). */
export function validateDefenseModifiers(doc) {
  const errors = [];
  if (doc?.schema !== DEFENSE_SCHEMA) return [`difesa: schema ${JSON.stringify(doc?.schema)}`];
  if (!['ipotesi', 'utente'].includes(doc.basis)) errors.push('difesa: basis non valido');
  if (!String(doc.note ?? '').trim()) errors.push('difesa: nota di origine mancante');
  const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5;
  for (const t of TERRAINS) if (!ok(doc.terrain?.[t])) errors.push(`difesa: terreno ${t} deve essere un numero tra 1 e 5`);
  for (const k of Object.keys(doc.terrain ?? {})) if (!TERRAINS.includes(k)) errors.push(`difesa: terreno sconosciuto ${k}`);
  for (const l of LEVELS) if (!ok(doc.fortification?.[l])) errors.push(`difesa: fortificazione ${l} deve essere un numero tra 1 e 5`);
  for (const k of Object.keys(doc.fortification ?? {})) if (!LEVELS.includes(k)) errors.push(`difesa: livello sconosciuto ${k}`);
  for (let i = 1; i < LEVELS.length; i += 1) if (doc.fortification?.[LEVELS[i]] < doc.fortification?.[LEVELS[i - 1]]) errors.push('difesa: le fortificazioni non possono diminuire con il livello');
  if (!ok(doc.cap)) errors.push('difesa: tetto non valido');
  if (doc.river !== undefined && !ok(doc.river?.crossing)) errors.push('difesa: bonus fiume deve essere un numero tra 1 e 5');
  return errors;
}

/** Moltiplicatore di una provincia: terrain (classe o null), fortification (0-3 o null). Prodotto, con tetto `cap`. */
export function defenseMultiplier(cfg, { terrain = null, fortification = null } = {}) {
  const t = cfg.terrain[terrain] ?? 1;
  const f = cfg.fortification[String(fortification)] ?? 1;
  return Math.min(cfg.cap, t * f);
}

/**
 * Funzione `(provincia, stato) => moltiplicatore` per il contesto del teatro. terrainOf / fortificationOf: id provincia → classe / livello (o null);
 * isCity(provincia, stato, rete): le zone urbane hanno le loro regole e valgono 1. Una provincia divisa in sponde si cerca anche per la madre (motherOf, facoltativo).
 */
export function createDefenseMultiplier({ cfg, terrainOf, fortificationOf, isCity = () => false, motherOf = (p) => p }) {
  return (province, state, net) => {
    if (isCity(province, state, net)) return 1;
    const m = motherOf(province) ?? province;
    return defenseMultiplier(cfg, { terrain: terrainOf(province) ?? terrainOf(m), fortification: fortificationOf(province) ?? fortificationOf(m) });
  };
}

/**
 * Fattore dei difensori contro chi ha forzato un fiume: 1 + (bonus−1)×quota di attaccanti che ha attraversato (0-1).
 * Con un ponte integro non c'è bonus (si attraversa senza combattere sull'acqua). Senza configurazione vale 1.
 */
export function riverFactor(cfg, { crossedShare = 0, bridge = false } = {}) {
  const bonus = cfg?.river?.crossing;
  if (!bonus || bridge || !(crossedShare > 0)) return 1;
  return 1 + (bonus - 1) * Math.min(1, crossedShare);
}
