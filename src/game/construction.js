// Costruzioni (fabbriche, centrali, miniere): ordine, pagamento, coda, completamento. Funzioni PURE su `state`.
// Vincoli all'avvio (decisi in chat 26/10/2026): denaro, acciaio, lavoratori liberi, energia disponibile (solo per le fabbriche) — via canStartBuild.
// Si paga TUTTO all'ordine (cassa e acciaio); i lavoratori sono occupati finché dura la costruzione e poi passano all'impianto finito.
// Miglioramento di una fabbrica (ordine kind 'upgrade', 29/10/2026): fabbrica → complesso industriale → grande complesso industriale (catalog.levels = factory_levels.json).
// Non occupa slot; paga tutto all'ordine; l'impianto continua a produrre al livello vecchio finché i lavori non finiscono, poi passa al nuovo (campo `level`).
// NON ancora: tecnologie richieste (MISSING_DATA: non esistono tecnologie iniziali, `requires` è sempre null), annullamento e rimborso, slot delle città,
// slot occupati dagli impianti iniziali (non hanno provincia: MISSING_DATA), consumo di energia del pompaggio del petrolio per le miniere.
import { canStartBuild } from '../rules/construction.js';
import { workersState } from '../rules/workers.js';
import { SLOT_CAPACITY } from '../rules/slots.js';
import { factoryBuildCost, mineCost } from '../data/economy.js';
import { fullCapacityFlows } from '../data/recipes.js';
import { techsOf } from './research.js';
import { levelDef, levelMult, maxFactoryLevel, upgradeCost } from '../data/factoryLevels.js';
import { hydroMwByOwner } from './economySystem.js';
import { entityOfProvinceId } from '../data/provinceOwner.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * ctx: { catalog: { recipes: Map, factories: Map, levels?: factory_levels.json }, economy, sites (mine_sites.json), hydro (hydro_plants.json), political,
 *        workersShare (quota della popolazione), provinceExists?: (id) => boolean }
 */
export function createConstruction({ catalog, economy, sites, hydro, political, workersShare, provinceExists = null }) {
  const entityIds = political.map((e) => e.id);
  const entityOf = (provinceId) => entityOfProvinceId(provinceId, entityIds); // anche MAR_ES, NLD_EI, JPN_MANDATE
  const ownerOf = new Map(political.map((e) => [e.id, e.owner ?? e.id]));

  /** Potenza (MW) disponibile e impegnata di una nazione alla data: centrali + idro + rete di base contro fabbriche attive e in costruzione. */
  function powerBalance(state, nation, nationId) {
    let supply = (hydroMwByOwner(hydro, state.date, ownerOf)[nationId] ?? 0) + nation.baseGridMw;
    let demand = 0;
    for (const f of nation.facilities) {
      const recipe = catalog.recipes.get(f.recipeId); const factory = catalog.factories.get(f.type);
      const flows = fullCapacityFlows(recipe, factory, levelMult(catalog.levels, f.level));
      if (flows.outputUnit === 'MW') supply += flows.outputPerDay * (1 - (f.damage ?? 0)); else demand += flows.energyMw * (f.throttle ?? 1);
    }
    for (const c of nation.construction) if (c.kind === 'factory' || c.kind === 'upgrade') demand += c.energyMw;
    return { supply: r3(supply), demand: r3(demand), surplus: r3(supply - demand) };
  }

  function quoteFactory(state, factoryId, recipeId) {
    const factory = catalog.factories.get(factoryId); const recipe = catalog.recipes.get(recipeId);
    if (!factory) return { ok: false, reason: 'unknown_factory' };
    if (!recipe || recipe.factory !== factoryId) return { ok: false, reason: 'recipe_mismatch' };
    return { ok: true, cost: { ...factoryBuildCost(economy, factory, state.difficulty), energyMw: fullCapacityFlows(recipe, factory).energyMw }, factory, recipe };
  }

  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

  /** Ordina una costruzione. order: { kind: 'factory', factoryId, recipeId, provinceId } | { kind: 'mine', provinceId, resource }. Ritorna { ok, state, entry } o { ok:false, reason, missing? }. */
  function start(state, nationId, order) {
    const nation = state.nations?.[nationId];
    if (!nation) return fail('unknown_nation');
    const { provinceId } = order;
    let entity = null;
    if (order.kind !== 'upgrade') {
      if (typeof provinceId !== 'string') return fail('invalid_province');
      if (provinceExists && !provinceExists(provinceId)) return fail('unknown_province');
      entity = entityOf(provinceId);
      if (state.control[entity] !== nationId) return fail('not_controlled');
    }
    let cost; let entry; let requiredEnergy = 0; let requires = null;
    if (order.kind === 'upgrade') {
      const f = nation.facilities.find((x) => x.id === order.facilityId);
      if (!f) return fail('no_facility');
      const factory = catalog.factories.get(f.type);
      if (!factory || factory.factory_class !== 'industry' || !catalog.levels) return fail('not_upgradable');
      if (state.control[f.territory] !== nationId) return fail('not_controlled');
      if (nation.construction.some((c) => c.kind === 'upgrade' && c.facilityId === f.id)) return fail('already_building');
      const level = f.level ?? 1;
      if (level >= maxFactoryLevel(catalog.levels)) return fail('max_level');
      const up = upgradeCost(economy, factory, level, catalog.levels, state.difficulty);
      if (!up) return fail('not_upgradable');
      cost = up;
      requires = levelDef(catalog.levels, level + 1)?.requires ?? null;
      requiredEnergy = r3(fullCapacityFlows(catalog.recipes.get(f.recipeId), factory).energyMw * up.energyFactor);
      entry = { kind: 'upgrade', facilityId: f.id, factoryId: f.type, recipeId: f.recipeId, provinceId: f.provinceId ?? null, territory: f.territory, fromLevel: level, level: level + 1, energyMw: requiredEnergy };
    } else if (order.kind === 'factory') {
      const q = quoteFactory(state, order.factoryId, order.recipeId);
      if (!q.ok) return fail(q.reason);
      cost = q.cost; requiredEnergy = cost.energyMw;
      if (q.factory.factory_class === 'industry') {
        const used = nation.facilities.filter((f) => f.provinceId === provinceId && catalog.factories.get(f.type).factory_class === 'industry').length
          + nation.construction.filter((c) => c.kind === 'factory' && c.provinceId === provinceId && c.slot).length;
        if (used + economy.construction.slotsPerFactory > SLOT_CAPACITY.province) return fail('no_slot', { used, capacity: SLOT_CAPACITY.province });
      }
      entry = { kind: 'factory', factoryId: order.factoryId, recipeId: order.recipeId, provinceId, territory: entity, energyMw: cost.energyMw, slot: q.factory.factory_class === 'industry' };
    } else if (order.kind === 'mine') {
      const site = sites.byProvince[provinceId]?.[order.resource];
      if (!site) return fail('no_site');
      const current = nation.mines.find((m) => m.provinceId === provinceId && m.resource === order.resource)?.level ?? 0;
      if (nation.construction.some((c) => c.kind === 'mine' && c.provinceId === provinceId && c.resource === order.resource)) return fail('already_building');
      const level = current + 1;
      if (level > economy.mines.gapParts) return fail('max_level');
      if (!(site.extraPerDay[level - 1] > 0)) return fail('no_gain'); // base = max: la provincia non può produrre di più
      cost = mineCost(economy, level, state.difficulty);
      entry = { kind: 'mine', provinceId, territory: entity, resource: order.resource, level };
    } else return fail('unknown_kind');

    const w = workersState(nation, { factoriesById: catalog.factories, share: workersShare, levels: catalog.levels ?? null });
    const have = { balance: nation.balance, steel: nation.stocks.steel ?? 0, workers: w.free, techs: techsOf(nation), powerSurplusMw: powerBalance(state, nation, nationId).surplus };
    const check = canStartBuild({ cost: { ecv: cost.ecv, steel: cost.steel, workers: cost.workers, energyMw: requiredEnergy }, requires }, have);
    if (!check.ok) return fail('missing', { missing: check.missing });

    const id = `${nationId}:${state.day}:${nation.construction.length}:${entry.kind}:${provinceId}`;
    const full = { id, ...entry, daysLeft: cost.days, totalDays: cost.days, workers: cost.workers, paid: { ecv: cost.ecv, steel: cost.steel }, startedOn: state.date };
    const stocks = { ...nation.stocks, steel: r3((nation.stocks.steel ?? 0) - cost.steel) };
    const next = { ...nation, balance: r3(nation.balance - cost.ecv), stocks, construction: [...nation.construction, full] };
    return { ok: true, entry: full, state: { ...state, nations: { ...state.nations, [nationId]: next } } };
  }

  /** Sistema giornaliero: avanza le costruzioni di un giorno e completa quelle a zero giorni. */
  function constructionDay(state) {
    if (!state.nations) return state;
    let nations = null;
    for (const id of Object.keys(state.nations).sort()) {
      const n = state.nations[id];
      if (n.construction.length === 0) continue;
      const queue = []; const facilities = [...n.facilities]; const mines = [...n.mines];
      for (const c of n.construction) {
        const left = c.daysLeft - 1;
        if (left > 0) { queue.push({ ...c, daysLeft: left }); continue; }
        if (c.kind === 'upgrade') {
          const i = facilities.findIndex((f) => f.id === c.facilityId);
          if (i >= 0) facilities[i] = { ...facilities[i], level: c.level };
        } else if (c.kind === 'factory') {
          const priority = facilities.reduce((m, f) => Math.max(m, f.priority ?? 0), 0) + 1;
          facilities.push({ id: `${id}:${c.provinceId}:${c.factoryId}:${c.recipeId}:d${state.day}:${facilities.length}`, type: c.factoryId, recipeId: c.recipeId, territory: c.territory, provinceId: c.provinceId, damage: 0, priority, active: true });
        } else {
          const i = mines.findIndex((m) => m.provinceId === c.provinceId && m.resource === c.resource);
          const mine = { id: `${c.provinceId}:${c.resource}`, provinceId: c.provinceId, territory: c.territory, resource: c.resource, level: c.level };
          if (i >= 0) mines[i] = mine; else mines.push(mine);
        }
      }
      nations ??= { ...state.nations };
      nations[id] = { ...n, construction: queue, facilities, mines };
    }
    return nations ? { ...state, nations } : state;
  }

  return { start, constructionDay, quoteFactory, powerBalance };
}
