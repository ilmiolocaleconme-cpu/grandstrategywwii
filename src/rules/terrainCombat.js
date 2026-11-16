// Terreno e fiumi nella battaglia terrestre. Funzioni PURE. I numeri stanno in data/units/terrain_combat.json (IPOTESI DI BILANCIAMENTO,
// da approvare): qui solo il calcolo.
//  - terrainDefense: moltiplicatore della potenza dei difensori = media delle classi di terreno pesata sulle `frazioni` della provincia;
//  - terrainCategoryFactor: moltiplicatore della potenza di UNA divisione per categoria e terreno (attacco e difesa), stessa media pesata;
//  - riverFactor: moltiplicatore di un ATTACCANTE che è entrato nel posto attraversando un fiume medio o grande.
// Terreno assente (zona urbana, provincia senza dato) = 1: i dati mancanti non penalizzano né aiutano.
export const TERRAIN_COMBAT_SCHEMA = 'terrain-combat-v1';
export const TERRAIN_CLASSES = Object.freeze(['pianura', 'collina', 'montagna', 'foresta', 'palude', 'deserto', 'tundra']);
export const COMBAT_CATEGORIES = Object.freeze(['infantry', 'mountain', 'airborne', 'cavalry', 'motorized', 'mechanized', 'armored']);
export const RIVER_WIDTHS = Object.freeze(['medium', 'large']);

const round4 = (x) => Math.round(x * 10000) / 10000;

/** Media di `valueOf(classe)` pesata sulle frazioni (normalizzate: i file sommano a 1 con una tolleranza). Senza frazioni valide: 1. */
function weighted(fractions, valueOf) {
  let sum = 0; let weight = 0;
  for (const [k, f] of Object.entries(fractions ?? {})) {
    if (!(f > 0)) continue;
    sum += f * valueOf(k); weight += f;
  }
  return weight > 0 ? round4(sum / weight) : 1;
}

/** Moltiplicatore della difesa per il terreno. terrain: voce di data/terrain.json ({ frazioni }) oppure null. */
export function terrainDefense(terrain, cfg) {
  if (!terrain || !cfg) return 1;
  return weighted(terrain.frazioni, (k) => cfg.defense?.[k] ?? 1);
}

/** Moltiplicatore della potenza di una divisione di `category` su quel terreno. */
export function terrainCategoryFactor(category, terrain, cfg) {
  if (!terrain || !cfg) return 1;
  const row = cfg.category?.[category];
  if (!row) return 1;
  return weighted(terrain.frazioni, (k) => row[k] ?? 1);
}

/** Moltiplicatore di un attaccante che ha attraversato un fiume di larghezza `widthClass` (small o assente = 1). */
export function riverFactor(widthClass, cfg) {
  const v = cfg?.river?.[widthClass];
  return v > 0 ? v : 1;
}

/** Errori della configurazione (lista vuota = valida). */
export function validateTerrainCombat(cfg) {
  if (cfg === null || typeof cfg !== 'object') return ['terreno in battaglia: configurazione mancante'];
  const errors = [];
  if (cfg.schema !== TERRAIN_COMBAT_SCHEMA) errors.push(`terreno in battaglia: schema ${JSON.stringify(cfg.schema)}`);
  for (const k of TERRAIN_CLASSES) if (!(cfg.defense?.[k] >= 1 && cfg.defense[k] <= 3)) errors.push(`terreno in battaglia: difesa di «${k}» deve stare tra 1 e 3`);
  for (const k of Object.keys(cfg.defense ?? {})) if (!TERRAIN_CLASSES.includes(k)) errors.push(`terreno in battaglia: classe «${k}» sconosciuta`);
  for (const [cat, row] of Object.entries(cfg.category ?? {})) {
    if (!COMBAT_CATEGORIES.includes(cat)) { errors.push(`terreno in battaglia: categoria «${cat}» sconosciuta`); continue; }
    for (const [k, v] of Object.entries(row ?? {})) {
      if (!TERRAIN_CLASSES.includes(k)) errors.push(`terreno in battaglia: ${cat}, classe «${k}» sconosciuta`);
      else if (!(v > 0 && v <= 2)) errors.push(`terreno in battaglia: ${cat} su ${k} deve stare tra 0 e 2`);
    }
  }
  for (const w of RIVER_WIDTHS) if (!(cfg.river?.[w] > 0 && cfg.river[w] <= 1)) errors.push(`terreno in battaglia: fiume «${w}» deve stare tra 0 e 1`);
  if (cfg.river?.large > cfg.river?.medium) errors.push('terreno in battaglia: un fiume grande non può pesare meno di uno medio');
  return errors;
}
