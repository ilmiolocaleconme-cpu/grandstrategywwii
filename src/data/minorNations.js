// Nazioni minori a battaglioni (25/11/2026, scelte dell'utente: catalogo comune generico, battaglioni e modelli di base comuni).
// UNA base comune (armi, battaglioni, composizioni) da cui si genera, per ogni nazione minore, un catalogo con la nazione nel codice
// (es. INW-BEL-RIFLE) e i battaglioni MOD-BEL-*: così valgono le regole di tutte le altre nazioni (armi della propria nazione,
// fabbriche, riserva, editor). Armi GENERICHE («fucile d'ordinanza»), non modelli storici: stima di Claude dalla memoria, da
// sostituire nazione per nazione con cataloghi documentati. Funzioni PURE, nessun I/O; i file si generano con
// `node scripts/build-minor-nations.js` (data/units/equipment/catalog_minors.json e data/units/modules/modules_minors.json).

export const MINOR_NOTE = 'Stima di Claude dalla memoria (25/11/2026), NON verificata su fonti: base comune generica delle nazioni minori, da sostituire con dati documentati per nazione.';

/** Nazioni minori convertite: tutte quelle con una fascia di riserva > 0 che non sono tra le sette grandi (initial_equipment_rules.json). */
export const MINOR_NATIONS = Object.freeze(['AFG', 'ALB', 'ARG', 'AUS', 'AUT', 'BEL', 'BGR', 'BOL', 'BRA', 'CAN', 'CHE', 'CHL', 'CHN', 'COL', 'CRI', 'CUB', 'CZE', 'DNK', 'DOM', 'ECU',
  'EGY', 'ESP', 'EST', 'ETH', 'FIN', 'GRC', 'GTM', 'HND', 'HTI', 'HUN', 'IRL', 'LBR', 'LTU', 'LVA', 'MAN', 'MENG', 'MEX', 'MNG', 'NIC', 'NLD', 'NOR', 'NZL', 'PAN', 'PER',
  'POL', 'PRT', 'PRY', 'ROM', 'SAU', 'SIA', 'SLV', 'SWE', 'TUR', 'URY', 'VEN', 'YEM', 'YUG', 'ZAF']);

/** Armi della base comune: id = <prefisso>-<NAZIONE>-<chiave>. group = gruppo della scheda dell'unità (unitSheet.js). */
export const MINOR_EQUIPMENT = Object.freeze([
  { prefix: 'INW', key: 'RIFLE', category: 'INDIVIDUAL_WEAPON', caliber: null, name: "Fucile d'ordinanza", role: 'individual_infantry_weapon', group: 'individuali' },
  { prefix: 'INW', key: 'PISTOL', category: 'INDIVIDUAL_WEAPON', caliber: null, name: "Pistola d'ordinanza", role: 'officer_and_specialist_sidearm', group: 'individuali' },
  { prefix: 'MG', key: 'LMG', category: 'MACHINE_GUN', caliber: null, name: 'Fucile mitragliatore', role: 'squad_automatic_weapon', group: 'mitragliatrici' },
  { prefix: 'MG', key: 'HMG', category: 'MACHINE_GUN', caliber: null, name: 'Mitragliatrice pesante', role: 'sustained_fire_support', group: 'mitragliatrici' },
  { prefix: 'ART', key: 'MOR81', category: 'MORTAR', caliber: 81, massTonnes: 0.06, name: 'Mortaio da 81 mm', role: 'close_indirect_fire', group: 'mortai' },
  { prefix: 'ART', key: 'GUN75', category: 'FIELD_GUN', caliber: 75, massTonnes: 1.2, name: 'Cannone da campagna da 75 mm', role: 'divisional_light_indirect_fire', group: 'artiglieria' },
  { prefix: 'ART', key: 'GUN75-MT', category: 'FIELD_GUN', caliber: 75, massTonnes: 0.6, name: 'Cannone da montagna da 75 mm', role: 'mountain_gun', group: 'artiglieria' },
  { prefix: 'ART', key: 'HOW105', category: 'HOWITZER', caliber: 105, massTonnes: 1.9, name: 'Obice da 105 mm', role: 'divisional_heavy_indirect_fire', group: 'artiglieria' },
  { prefix: 'ART', key: 'AT37', category: 'ANTI_TANK_GUN', caliber: 37, massTonnes: 0.37, name: 'Cannone anticarro da 37 mm', role: 'anti_tank', group: 'anticarro' },
  { prefix: 'ART', key: 'AA20', category: 'ANTI_AIRCRAFT_GUN', caliber: 20, massTonnes: 0.4, name: 'Mitragliera contraerea da 20 mm', role: 'light_anti_aircraft', group: 'contraerea' },
  { prefix: 'VEH', key: 'TRUCK', category: 'TRUCK', caliber: null, name: 'Autocarro', role: 'truck', group: 'veicoli' },
  { prefix: 'VEH', key: 'MOTO', category: 'SPECIAL_VEHICLE', caliber: null, name: 'Motocicletta', role: 'motorcycle', group: 'veicoli' },
  { prefix: 'TNK', key: 'LIGHT', category: 'TANK', caliber: null, name: 'Carro leggero', role: 'light_tank', group: 'corazzati' },
]);

export const minorEquipmentId = (nation, key) => {
  const e = MINOR_EQUIPMENT.find((x) => x.key === key);
  if (!e) throw new Error(`arma comune ${key} inesistente`);
  return `${e.prefix}-${nation}-${e.key}`;
};

const MOT = 'TECH-MOT-INF';
/** Pesi per modello dell'artiglieria comune (equipment_production.json overrides: ogni pezzo d'artiglieria producibile ha il suo peso). Stima di Claude. */
export function minorArtilleryMasses(nations = MINOR_NATIONS) {
  const out = {};
  for (const n of nations) for (const e of MINOR_EQUIPMENT) if (e.massTonnes) out[`${e.prefix}-${n}-${e.key}`] = { massTonnes: e.massTonnes };
  return out;
}

/** Battaglioni comuni: id MOD-<NAZIONE>-<chiave>; equipment per chiave dell'arma comune. */
export const MINOR_MODULES = Object.freeze([
  { key: 'INF', type: 'infantry', native: 'Infantry battalion', it: 'Battaglione di fanteria', men: 850, horses: 60, eq: { RIFLE: 650, PISTOL: 30, LMG: 27, HMG: 8, MOR81: 2 }, mobility: 'foot', ill: 'fanteria' },
  { key: 'REGT', type: 'support', native: 'Regimental headquarters and support companies', it: 'Comando e compagnie reggimentali', men: 400, horses: 100, eq: { RIFLE: 250, PISTOL: 20, LMG: 6, MOR81: 4 }, mobility: 'foot', ill: 'fanteria' },
  { key: 'RECON', type: 'recon', native: 'Divisional reconnaissance group', it: 'Gruppo esplorante divisionale', men: 400, horses: 300, eq: { RIFLE: 330, PISTOL: 15, LMG: 8, HMG: 4, MOTO: 10 }, mobility: 'foot', ill: 'cavalleria' },
  { key: 'ART75', type: 'artillery', native: 'Field artillery battalion (75 mm, horse-drawn)', it: 'Gruppo da 75 ippotrainato', men: 500, horses: 350, eq: { GUN75: 12, RIFLE: 250, PISTOL: 40 }, mobility: 'foot', ill: 'artiglieria_ippotrainata' },
  { key: 'ART105', type: 'artillery', native: 'Howitzer battalion (105 mm)', it: 'Gruppo obici da 105', men: 500, horses: 400, eq: { HOW105: 12, RIFLE: 250, PISTOL: 40 }, mobility: 'foot', ill: 'artiglieria_trainata' },
  { key: 'ART-MT', type: 'artillery', native: 'Mountain artillery battalion (75 mm, pack)', it: 'Gruppo da montagna da 75 someggiato', men: 450, horses: 350, eq: { 'GUN75-MT': 12, RIFLE: 220, PISTOL: 30 }, mobility: 'foot', ill: 'salmerie' },
  { key: 'AT', type: 'anti_tank', native: 'Divisional anti-tank company (37 mm)', it: 'Compagnia anticarro divisionale (37 mm)', men: 150, horses: 40, eq: { AT37: 12, RIFLE: 100, PISTOL: 10 }, mobility: 'foot', ill: 'anticarro' },
  { key: 'AA', type: 'anti_air', native: 'Anti-aircraft company (20 mm)', it: 'Compagnia contraerea (20 mm)', men: 150, horses: 0, eq: { AA20: 8, RIFLE: 100, PISTOL: 10, TRUCK: 8 }, mobility: 'foot', ill: 'contraerea' },
  { key: 'ENG', type: 'engineer', native: 'Engineer battalion', it: 'Battaglione del genio', men: 500, horses: 50, eq: { RIFLE: 400, PISTOL: 20, LMG: 9 }, mobility: 'foot', ill: 'genio' },
  { key: 'SVC', type: 'support', native: 'Division headquarters, transport and medical services', it: 'Comando, trasporti e sanità divisionali', men: 2500, horses: 1200, eq: { RIFLE: 900, PISTOL: 200, TRUCK: 60, MOTO: 20 }, mobility: 'foot', ill: 'trasporto_ippotrainato', divisional: true },
  { key: 'CAV', type: 'cavalry', native: 'Cavalry regiment', it: 'Reggimento di cavalleria', men: 600, horses: 650, eq: { RIFLE: 500, PISTOL: 30, LMG: 12, HMG: 4 }, mobility: 'foot', ill: 'cavalleria' },
  { key: 'MTN', type: 'mountain_infantry', native: 'Mountain infantry battalion', it: 'Battaglione da montagna', men: 800, horses: 250, eq: { RIFLE: 620, PISTOL: 30, LMG: 27, HMG: 8, MOR81: 2 }, mobility: 'foot', ill: 'fanteria' },
  { key: 'TANK', type: 'tank', native: 'Light tank battalion', it: 'Battaglione carri leggeri', men: 350, horses: 0, eq: { LIGHT: 30, RIFLE: 150, PISTOL: 150, TRUCK: 30, MOTO: 10 }, mobility: 'armored', ill: 'carro_leggero' },
  { key: 'MOTINF', type: 'motorized_infantry', native: 'Motorized infantry battalion', it: 'Battaglione di fanteria motorizzata', men: 800, horses: 0, eq: { RIFLE: 620, PISTOL: 30, LMG: 27, HMG: 8, MOR81: 2, TRUCK: 50 }, mobility: 'motorized', ill: 'fanteria_motorizzata', requiresTech: MOT },
  { key: 'SVC-MOT', type: 'support', native: 'Motorized division headquarters and services', it: 'Comando e servizi della divisione motorizzata', men: 2000, horses: 0, eq: { RIFLE: 800, PISTOL: 200, TRUCK: 150, MOTO: 30 }, mobility: 'motorized', ill: 'logistica_camion', divisional: true, requiresTech: MOT },
]);

/** Composizione storica comune (diventa un template per nazione) e modelli di partenza dell'editor. */
export const MINOR_INFANTRY_1936 = Object.freeze([['INF', 9], ['REGT', 3], ['RECON', 1], ['ART75', 3], ['ART105', 1], ['AT', 1], ['ENG', 1], ['SVC', 1]]);
export const MINOR_PRESETS = Object.freeze([
  { key: 'MTN', name: 'Divisione da montagna (base comune)', modules: [['MTN', 6], ['REGT', 2], ['ART-MT', 2], ['ENG', 1], ['SVC', 1]] },
  { key: 'CAV', name: 'Divisione di cavalleria (base comune)', modules: [['CAV', 6], ['ART75', 1], ['ENG', 1], ['SVC', 1]] },
  { key: 'ARM-LIGHT', name: 'Divisione leggera corazzata (base comune)', modules: [['TANK', 2], ['MOTINF', 3], ['ART75', 1], ['ENG', 1], ['SVC-MOT', 1]] },
]);

/** Nome del file di una nazione: «Stato Libero d'Irlanda» → stato_libero_d_irlanda. */
export const nationSlug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');

/** Gruppo della scheda dell'unità per ogni arma comune di ogni nazione minore (tabella esplicita, unitSheet.js). */
export function minorEquipmentGroups() {
  const out = {};
  for (const n of MINOR_NATIONS) for (const e of MINOR_EQUIPMENT) out[`${e.prefix}-${n}-${e.key}`] = e.group;
  return out;
}

/** Catalogo comune: una voce di classe per arma e nazione, con l'alias (chiave del template = id). */
export function buildMinorCatalog(nations = MINOR_NATIONS) {
  const entries = [];
  const aliases = [];
  for (const n of nations) for (const e of MINOR_EQUIPMENT) {
    const id = `${e.prefix}-${n}-${e.key}`;
    entries.push({ equipment_id: id, nation: n, category: e.category, granularity: 'class', caliber_mm: null, // classe generica: il calibro sta nel nome, non come caratteristica (equipment_catalog.test.js)
       designation: `${e.name} (modello generico)`, name_it: e.name, role: e.role, durable: true, models: [], reliability: 'ESTIMATED', source_note: MINOR_NOTE });
    aliases.push({ nation: n, templateKey: id, equipment_id: id });
  }
  return {
    schema: 'equipment-catalog-v1', status: 'DESIGN_DEFAULT',
    note: 'File generato da scripts/build-minor-nations.js (src/data/minorNations.js): non modificare a mano. Catalogo comune generico delle nazioni minori (scelta dell\'utente del 25/11/2026): armi per classe, senza modelli storici.',
    source: 'Stima di Claude dalla memoria', entries, aliases,
  };
}

/** Battaglioni, composizione di fanteria 1936 e modelli di partenza per ogni nazione minore. names: { ID: nome italiano }. */
export function buildMinorModules(names, nations = MINOR_NATIONS) {
  const modules = [];
  const compositions = [];
  const presets = [];
  for (const n of nations) {
    if (!names[n]) throw new Error(`${n}: nome della nazione mancante`);
    for (const m of MINOR_MODULES) {
      const d = { id: `MOD-${n}-${m.key}`, nation: n, type: m.type, name_native: m.native, name_it: m.it, men: m.men, horses: m.horses,
        equipment: Object.fromEntries(Object.entries(m.eq).map(([k, v]) => [minorEquipmentId(n, k), v])), mobility: m.mobility, illustration: m.ill };
      if (m.requiresTech) d.requiresTech = m.requiresTech;
      if (m.divisional) d.divisional = true;
      d.note = MINOR_NOTE;
      modules.push(d);
    }
    compositions.push({ templateId: `TPL-${n}-INF-1936`, name: 'Divisione di fanteria (1936)', file: `divisione_fanteria_${nationSlug(names[n])}_1936.json`, category: 'infantry', activeFrom: '1936-01-01',
      formation: 'divisione di fanteria della base comune delle nazioni minori: 3 reggimenti di 3 battaglioni, compagnie reggimentali, gruppo esplorante, 3 gruppi da 75 e uno di obici da 105, compagnia anticarro, genio, servizi',
      modules: MINOR_INFANTRY_1936.map(([k, c]) => [`MOD-${n}-${k}`, c]) });
    for (const p of MINOR_PRESETS) presets.push({ id: `PRE-${n}-${p.key}`, name: p.name, modules: p.modules.map(([k, c]) => [`MOD-${n}-${k}`, c]) });
  }
  return {
    schema: 'battalion-modules-v1', status: 'DESIGN_DEFAULT', asOf: '2026-11-25',
    note: 'File generato da scripts/build-minor-nations.js (src/data/minorNations.js): non modificare a mano. Battaglioni comuni delle nazioni minori (scelte dell\'utente del 25/11/2026: catalogo comune generico, base comune). Organici STIMATI da Claude, NON verificati; name_native in inglese (nome generico, non nella lingua della nazione).',
    modules, compositions, presets,
  };
}
