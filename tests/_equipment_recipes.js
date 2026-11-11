// Ricette di equipaggiamento generate dal catalogo (le stesse dell'app), per i test che costruiscono il catalogo del motore.
// Le fabbriche iniziali di armi e artiglieria (data/industry/initial_industry.json) usano queste ricette, che non stanno in recipes.json.
import { readFileSync } from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
export const EQUIPMENT_RECIPE_LIST = buildEquipmentRecipes(mergeEquipmentCatalogs(['catalog', 'catalog_deu', 'catalog_fra', 'catalog_ita', 'catalog_ussr', 'catalog_jpn', 'catalog_usa'].map((n) => json(`units/equipment/${n}.json`))), json('units/equipment/equipment_production.json'));
/** Ricette scritte a mano + ricette di equipaggiamento. */
export const allRecipeList = () => [...json('industry/recipes.json').recipes, ...EQUIPMENT_RECIPE_LIST];
