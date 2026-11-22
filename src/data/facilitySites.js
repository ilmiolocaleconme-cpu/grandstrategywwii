// Dati della collocazione degli impianti iniziali (usato da scripts/build-facility-sites.js e dal test che controlla il file generato).
// Prepara per src/rules/facilityPlacement.js le province madri di ogni territorio con popolazione, punti risorse, porto e posto sulla mappa.
import { buildNations } from '../game/economyState.js';
import { bankIndex } from './moveNet.js';
import { entityOfProvinceId } from './provinceOwner.js';
import { placeFacilities } from '../rules/facilityPlacement.js';
import { SLOT_CAPACITY } from '../rules/slots.js';

/**
 * Contenuto di data/industry/initial_facility_sites.json. features: tasselli della mappa (province e sponde); j(percorso) legge un JSON di data/;
 * factoryClassOf(tipo) → factory_class del catalogo (loadIndustryCatalog).
 * Sponda di una madre divisa (decisione 5): quella della zona urbana più grande della madre (accesso di data/city_links.json), altrimenti la più grande.
 */
export function facilitySitesFile({ features, j, factoryClassOf }) {
  const political = j('political_1936.json');
  const nationIds = j('nations.json').map((n) => n.id);
  const entityIds = political.map((e) => e.id);
  const cfg = j('industry/facility_placement.json');
  const points = j('resources/resource_points.json');
  const population = j('population/province_population.json').byProvince;
  const ports = j('ports/ports_1936.json').ports;
  const cities = j('citta_grandi.json').features.map((f) => f.properties);
  const access = new Map((j('city_links.json').links ?? []).filter((l) => l.type === 'access').map((l) => [l.a, l.b]));
  const banks = bankIndex(features);
  const start = { nationIds, industry: j('industry/initial_industry.json'), stocks: j('industry/initial_stocks.json') };
  const nations = buildNations({ political, ...start });
  // province madri per territorio
  const mothers = new Map();
  for (const f of features) {
    const p = f.properties;
    if (p.kind === 'citta') continue;
    const m = p.parentProvince ?? p.id;
    if (mothers.has(m)) continue;
    const ent = entityOfProvinceId(m, entityIds);
    mothers.set(m, { id: m, entity: ent });
  }
  const bigCity = new Map(); // madre → zona urbana più grande
  const urban = new Map(); // madre → km² di zone urbane grandi (citta_grandi.json, poligoni Natural Earth): peso della regola 'urban'
  for (const c of cities) urban.set(c.parentProvince, (urban.get(c.parentProvince) ?? 0) + (c.areaKm2 ?? 0));
  for (const c of cities) { const b = bigCity.get(c.parentProvince); if (!b || (c.areaKm2 ?? 0) > (b.areaKm2 ?? 0) || ((c.areaKm2 ?? 0) === (b.areaKm2 ?? 0) && c.id < b.id)) bigCity.set(c.parentProvince, c); }
  const portLevel = new Map();
  for (const p of Object.values(ports)) portLevel.set(p.parentProvince, Math.max(portLevel.get(p.parentProvince) ?? 0, p.level ?? 0));
  const byTerritory = new Map();
  for (const m of [...mothers.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    let bank = m.id;
    if (banks.isSplit(m.id)) {
      const c = bigCity.get(m.id); const t = c ? access.get(c.cittaId ?? c.id) : null;
      bank = t && banks.isBank(t) && banks.provinceOf(t) === m.id ? t : banks.canon(m.id);
    }
    const pts = {};
    for (const [r, v] of Object.entries(points.byProvince[m.id] ?? {})) pts[r] = v.base ?? 0;
    for (const [r, v] of Object.entries(points.byProvinceProducts?.[m.id] ?? {})) pts[r] = v.base ?? 0;
    (byTerritory.get(m.entity) ?? byTerritory.set(m.entity, []).get(m.entity)).push({ id: m.id, bank, urban: urban.get(m.id) ?? 0, population: population[m.id]?.population ?? 0, points: pts, port: portLevel.get(m.id) ?? 0 });
  }
  const facilities = [];
  for (const id of Object.keys(nations).sort()) for (const f of nations[id].facilities) facilities.push({ id: f.id, type: f.type, recipeId: f.recipeId, territory: f.territory });
  // fonti storiche: provincia madre → posto della mappa con la stessa regola della sponda; madre sconosciuta = errore nei dati
  const bankOf = new Map(); for (const list of byTerritory.values()) for (const m of list) bankOf.set(m.id, m.bank);
  const sources = (cfg.sources ?? []).map((s) => {
    const bank = bankOf.get(s.provinceId) ?? (features.some((f) => f.properties.id === s.provinceId) ? s.provinceId : null);
    if (!bank) throw new Error(`facility_placement: fonte con provincia sconosciuta ${s.provinceId}`);
    return { ...s, provinceId: bank };
  });
  const usesSlot = (type) => factoryClassOf(type) === 'industry'; // come construction.js: solo la classe 'industry' occupa spazi
  const r = placeFacilities(facilities, { mothersOf: (t) => byTerritory.get(t) ?? [], rules: cfg.rules, sources, usesSlot, capacity: SLOT_CAPACITY.province });
  const counts = { rule: 0, data: 0, source: 0 };
  for (const s of Object.values(r.sites)) counts[s.basis] = (counts[s.basis] ?? 0) + 1;
  return {
    schema: 'initial-facility-sites-v1',
    quality: 'DESIGN_DEFAULT',
    note: "Generato da scripts/build-facility-sites.js (npm run build:facility-sites): non modificare a mano. Posizione di ogni impianto iniziale: basis 'rule' = regola di facility_placement.json (stima, NON storica), 'data' = dati del repository (centri di fonderia), 'source' = fonte storica. Le chiavi sono gli id degli impianti creati da buildNations.",
    counts,
    sites: r.sites,
    unplaced: r.unplaced,
  };
}
