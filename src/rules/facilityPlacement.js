// Collocazione degli impianti iniziali nelle province (decisioni dell'utente del 21/11/2026, uguali per tutte le nazioni).
// Funzioni PURE, senza lettura di file: i dati arrivano già pronti (scripts/build-facility-sites.js li prepara e scrive
// data/industry/initial_facility_sites.json; il gioco legge solo quel file).
//
// Ordine delle fonti di posizione (1 «regola ora, fonti dopo»):
//   1) `sources`: posizioni da fonti storiche (data/industry/facility_placement.json, elenco `sources`): basis 'source';
//   2) dati del repository (es. centri di fonderia dell'alluminio in resource_points.json): basis 'data';
//   3) regola per tipo (2 «per risorse e popolazione»): basis 'rule'.
// Spazi (3 «occupano spazi»): gli impianti di classe 'industry' contano nei 14 spazi della sponda; se il posto è pieno, il seguente in classifica.
// Sponda (5): provincia divisa da un fiume → la sponda della città più grande della provincia, altrimenti la sponda più grande.
// Distribuzione: un impianto alla volta nel posto con il punteggio più alto diviso (1 + impianti dello stesso tipo già messi lì),
// così le zone forti ne prendono di più senza ammassarli tutti in una provincia.

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Punteggio di una provincia madre per un criterio. by: 'population' | 'port' | elenco di risorse o prodotti (somma dei punti base).
 * m: { population, points: { risorsa: base }, port (livello del porto principale, 0 se nessuno) }.
 */
export function scoreOf(m, by) {
  if (by === 'population') return m.population ?? 0;
  if (by === 'port') return (m.port ?? 0) > 0 ? m.port * 1e9 + (m.population ?? 0) : 0;
  if (Array.isArray(by)) return r3(by.reduce((t, r) => t + (m.points?.[r] ?? 0), 0));
  if (by && typeof by === 'object') return r3(Object.entries(by).reduce((t, [r, w]) => t + w * (m.points?.[r] ?? 0), 0)); // pesi per risorsa
  throw new Error(`collocazione: criterio sconosciuto ${JSON.stringify(by)}`);
}

/**
 * Collocazione di un elenco di impianti iniziali.
 * facilities: [{ id, type, territory }] (nell'ordine in cui il gioco li crea).
 * ctx:
 *  - mothersOf(territory) → [{ id, population, points, port, bank }] (bank = posto della mappa scelto per la madre: se stessa o la sponda);
 *  - rules: { default: { by, fallback? }, [tipo]: { by, fallback?, basis? } } (facility_placement.json);
 *  - sources: [{ territory, factory, provinceId, count, source }] (posizioni storiche, prima di tutto);
 *  - usesSlot(tipo) → boolean (classe 'industry'); capacity (spazi per posto, 14).
 * Risultato: { sites: { [idImpianto]: { provinceId, basis, rule } }, unplaced: [{ id, reason }] }.
 */
export function placeFacilities(facilities, ctx) {
  const { mothersOf, rules, sources = [], usesSlot, capacity } = ctx;
  const sites = {};
  const unplaced = [];
  const used = new Map(); // posto → spazi occupati
  const sameType = new Map(); // `${tipo}|${madre}` → impianti di quel tipo già lì
  const left = new Map(sources.map((s, i) => [i, s.count ?? 1]));
  const free = (place, type) => !usesSlot(type) || (used.get(place) ?? 0) < capacity;
  const put = (f, mother, place, basis, rule) => {
    sites[f.id] = { provinceId: place, basis, rule };
    if (usesSlot(f.type)) used.set(place, (used.get(place) ?? 0) + 1);
    const k = `${f.type}|${mother}`; sameType.set(k, (sameType.get(k) ?? 0) + 1);
  };
  for (const f of facilities) {
    // 1) fonte storica per territorio e tipo
    const si = sources.findIndex((s, i) => left.get(i) > 0 && s.territory === f.territory && s.factory === f.type && free(s.provinceId, f.type));
    if (si >= 0) { left.set(si, left.get(si) - 1); put(f, sources[si].provinceId, sources[si].provinceId, 'source', sources[si].source ?? 'fonte'); continue; }
    const mothers = mothersOf(f.territory);
    if (!mothers.length) { unplaced.push({ id: f.id, reason: 'no_provinces' }); continue; }
    const rule = rules[f.type] ?? rules.default;
    // 2-3) criterio del tipo; se nessuna provincia del territorio ha punteggio, il ripiego (poi la popolazione)
    const chain = [rule.by, rule.fallback, rules.default.by].filter((x, i, a) => x !== undefined && a.findIndex((y) => JSON.stringify(y) === JSON.stringify(x)) === i);
    let by = chain[chain.length - 1];
    // minScore: sotto questa soglia la risorsa è trascurabile (es. lignite sparsa) e vale il ripiego (es. porto: materia prima importata)
    for (const c of chain) if (mothers.some((m) => scoreOf(m, c) > (c === rule.by ? rule.minScore ?? 0 : 0))) { by = c; break; }
    const basis = by === rule.by && rule.basis ? rule.basis : 'rule';
    const label = Array.isArray(by) ? by.join('+') : typeof by === 'object' ? Object.entries(by).map(([r, w]) => (w === 1 ? r : `${w}×${r}`)).join('+') : by;
    let best = null; let bestKey = null;
    for (const m of mothers) {
      if (!free(m.bank, f.type)) continue;
      const n = sameType.get(`${f.type}|${m.id}`) ?? 0;
      const key = [scoreOf(m, by) / (1 + n), -n];
      if (!best || key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && m.id < best.id)))) { best = m; bestKey = key; }
    }
    if (!best) { unplaced.push({ id: f.id, reason: 'no_slot' }); continue; }
    put(f, best.id, best.bank, basis, label);
  }
  return { sites, unplaced };
}

/** Applica le posizioni del file agli impianti senza provincia (partita nuova e salvataggi di prima). Restituisce lo stato (stesso oggetto se nulla cambia). */
export function applyFacilitySites(state, sitesFile) {
  const sites = sitesFile?.sites;
  if (!state?.nations || !sites) return state;
  let changed = false;
  const nations = {};
  for (const [id, n] of Object.entries(state.nations)) {
    if (!(n.facilities ?? []).some((f) => !f.provinceId && sites[f.id])) { nations[id] = n; continue; }
    changed = true;
    nations[id] = { ...n, facilities: n.facilities.map((f) => (!f.provinceId && sites[f.id] ? { ...f, provinceId: sites[f.id].provinceId, site: sites[f.id].basis } : f)) };
  }
  return changed ? { ...state, nations } : state;
}

/**
 * Conquista (4 «passa al nemico danneggiato»): ogni impianto con provincia passa a chi controlla la provincia, se è una nazione con economia,
 * con danno almeno `damage` (0,5); la riparazione è quella già in gioco (security.js, cfg.repair.perDay). Se il proprietario lo riprende,
 * torna con la stessa regola (resta danneggiato). Il piano storico di riconversione (plannedRecipe) si perde: era di un'altra nazione.
 * controllerOf(state, provinceId) → nazione; isEnemy(state, a, b) → in guerra. Restituisce { state, moved: [{ id, from, to, provinceId }] }.
 */
export function captureFacilities(state, controllerOf, damage, isEnemy = () => true) {
  if (!state?.nations) return { state, moved: [] };
  const moved = [];
  const out = new Map(); // da → id impianti che escono
  const into = new Map(); // a → impianti che entrano
  for (const id of Object.keys(state.nations).sort()) {
    for (const f of state.nations[id].facilities ?? []) {
      if (!f.provinceId) continue;
      const c = controllerOf(state, f.provinceId);
      if (!c || c === id || !state.nations[c] || !isEnemy(state, c, id)) continue; // solo il nemico in guerra (non l'alleato che libera, non il fantoccio)
      const { plannedRecipe: _p, ...rest } = f;
      (out.get(id) ?? out.set(id, new Set()).get(id)).add(f.id);
      (into.get(c) ?? into.set(c, []).get(c)).push({ ...rest, damage: Math.max(f.damage ?? 0, damage), capturedFrom: id });
      moved.push({ id: f.id, from: id, to: c, provinceId: f.provinceId });
    }
  }
  if (!moved.length) return { state, moved };
  const nations = { ...state.nations };
  for (const [id, ids] of out) nations[id] = { ...nations[id], facilities: nations[id].facilities.filter((f) => !ids.has(f.id)) };
  for (const [id, list] of into) {
    const base = nations[id].facilities;
    const prio = base.reduce((t, f) => Math.max(t, f.priority ?? 0), 0);
    nations[id] = { ...nations[id], facilities: [...base, ...list.map((f, i) => ({ ...f, priority: prio + i + 1 }))] };
  }
  return { state: { ...state, nations }, moved };
}

/** Sistema giornaliero della conquista degli impianti (dopo i combattimenti). ctx: { controllerOf, damage, isEnemy }. */
export const createFacilityCaptureSystem = ({ controllerOf, damage, isEnemy }) => (state) => captureFacilities(state, controllerOf, damage, isEnemy).state;
