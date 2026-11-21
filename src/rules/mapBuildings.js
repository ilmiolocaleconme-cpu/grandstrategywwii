// Edifici sulla mappa (21/11/2026, richiesta dell'utente: ogni fabbrica, caserma, ospedale, miniera e centrale visibile,
// e ogni costruzione in corso). Funzioni PURE: dallo stato di partita all'elenco per provincia, senza disegno.
//
// Si mostra SOLO ciò che ha una provincia nei dati o nello stato (regola del repo: mai inventare dati):
// - impianti (facility.provinceId: costruiti in partita e, dal 21/11/2026, quelli iniziali), miniere, ospedali, caserme (stato o file iniziale), centrali idroelettriche
//   (hydro_plants.json, con provinceId e validFrom);
// - costruzioni in corso (nation.construction: provinceId, daysLeft, totalDays), con la quota fatta.
// NON si mostrano: gli impianti senza posto (initial_facility_sites.json, `unplaced`: microstati senza province),
// i porti e i cantieri navali (hanno già i loro segnalini, opzioni «Porti» e «Cantieri navali»), i collegamenti (livello strade).
// Le costruzioni in corso si vedono solo per la nazione del giocatore: quelle altrui sono informazione d'intelligence.
// Visibilità (decisione dell'utente 21/11/2026): gli edifici si vedono solo per il giocatore e i suoi alleati (ctx.visible);
// quelli delle altre nazioni restano nascosti (in futuro: con le spie). Dal 21/11/2026 anche gli impianti iniziali hanno una provincia
// (data/industry/initial_facility_sites.json, regola dichiarata: src/rules/facilityPlacement.js).

/** Categorie di edificio, nell'ordine di importanza sulla mappa. name: testo della legenda. */
export const BUILDING_KINDS = Object.freeze([
  { id: 'barracks', name: 'Caserma' },
  { id: 'hospital', name: 'Ospedale' },
  { id: 'power', name: 'Centrale elettrica' },
  { id: 'hydro', name: 'Centrale idroelettrica' },
  { id: 'arms', name: 'Armi, munizioni, artiglieria' },
  { id: 'vehicles', name: 'Carri, veicoli, motori' },
  { id: 'aircraft', name: 'Fabbrica aeronautica' },
  { id: 'steel', name: 'Acciaieria' },
  { id: 'aluminium', name: 'Alluminio' },
  { id: 'refinery', name: 'Raffineria e sintetico' },
  { id: 'chemical', name: 'Chimica, gomma, farmaci' },
  { id: 'industry', name: 'Macchinari e materiali' },
  { id: 'food', name: 'Alimentare e agricoltura' },
  { id: 'mine', name: 'Miniera' },
  { id: 'port', name: 'Porto' },
  { id: 'other', name: 'Altro impianto' },
]);
const RANK = new Map(BUILDING_KINDS.map((k, i) => [k.id, i]));

/** Tipo di fabbrica (factories.csv) → categoria sulla mappa. FCT-SHIPYARD: null (segnalino proprio dei cantieri). */
export const FACTORY_KIND = Object.freeze({
  'FCT-POWER': 'power',
  'FCT-WEAPONS': 'arms', 'FCT-MUNITIONS': 'arms', 'FCT-ARTILLERY': 'arms',
  'FCT-TANKS': 'vehicles', 'FCT-VEHICLES': 'vehicles', 'FCT-ENGINE': 'vehicles',
  'FCT-AIRCRAFT': 'aircraft',
  'FCT-STEEL': 'steel',
  'FCT-ALUMINIUM': 'aluminium',
  'FCT-REFINERY': 'refinery', 'FCT-SYNFUEL': 'refinery',
  'FCT-CHEMICAL': 'chemical', 'FCT-RUBBER': 'chemical', 'FCT-FERTILIZER': 'chemical', 'FCT-PHARMA': 'chemical',
  'FCT-INDUSTRIAL': 'industry', 'FCT-MACHINERY': 'industry', 'FCT-COMPONENTS': 'industry',
  'FCT-FOOD': 'food', 'FCT-AGRICULTURE': 'food', 'FCT-FEED': 'food', 'FCT-STUD': 'food',
  'FCT-SHIPYARD': null,
});
const factoryKind = (type) => (type in FACTORY_KIND ? FACTORY_KIND[type] : 'other');

/** Categoria di una costruzione in corso (null = non è un edificio sulla mappa: collegamenti, cantieri navali). */
export function jobKind(c) {
  if (c.kind === 'factory' || c.kind === 'upgrade') return factoryKind(c.factoryId);
  if (c.kind === 'mine') return 'mine';
  if (c.kind === 'hospital') return 'hospital';
  if (c.kind === 'barracks') return 'barracks';
  if (c.kind === 'port') return 'port';
  return null; // 'infra': strade e ferrovie si vedono nel livello dei collegamenti
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Edifici per provincia: { [provinceId]: [ { kind, n, job?: { frac, daysLeft, totalDays, level? } } ] }, prima i lavori in corso,
 * poi gli edifici per importanza (BUILDING_KINDS). n = quanti edifici di quella categoria (per caserme e miniere: somma dei livelli).
 * Le chiavi sono province o sponde come nei dati: la scelta del segnaposto sulla mappa è del disegno (resolveBuildingAnchors).
 * ctx: { player?, visible? (Set delle nazioni di cui si vedono gli edifici; assente = tutte), controllerOf?(state, provinceId) (per le centrali
 *        idroelettriche, che non appartengono a una nazione nello stato), hydro? (hydro_plants.json), barracksDoc?, barracksOf?(state, doc, nation) }.
 */
export function buildingsByProvince(state, ctx = {}) {
  const out = {};
  if (!state?.nations) return out;
  const built = new Map(); // provinceId → Map(kind → n)
  const add = (pid, kind, n = 1) => {
    if (typeof pid !== 'string' || !kind || !(n > 0)) return;
    if (!built.has(pid)) built.set(pid, new Map());
    const m = built.get(pid); m.set(kind, (m.get(kind) ?? 0) + n);
  };
  const jobs = new Map(); // provinceId → lavori in corso
  for (const id of Object.keys(state.nations).sort()) {
    const n = state.nations[id];
    const seen = !ctx.visible || ctx.visible.has(id);
    if (seen) for (const f of n.facilities ?? []) if (f.provinceId) add(f.provinceId, factoryKind(f.type));
    if (seen) for (const m of n.mines ?? []) add(m.provinceId, 'mine', m.level ?? 1);
    if (seen) for (const h of n.hospitals ?? []) add(h.provinceId, 'hospital');
    if (seen && ctx.barracksOf && ctx.barracksDoc && (ctx.barracksDoc.nations ?? []).includes(id)) {
      for (const b of ctx.barracksOf(state, ctx.barracksDoc, id)) add(b.provinceId, 'barracks', b.level ?? 1);
    }
    if (ctx.player && id !== ctx.player) continue;
    for (const c of n.construction ?? []) {
      const kind = jobKind(c);
      if (!kind || typeof c.provinceId !== 'string') continue;
      const tot = Math.max(1, c.totalDays ?? c.daysLeft ?? 1);
      const job = { frac: r3(Math.min(1, Math.max(0, 1 - (c.daysLeft ?? tot) / tot))), daysLeft: c.daysLeft ?? null, totalDays: c.totalDays ?? null };
      if (c.kind === 'upgrade' || c.kind === 'barracks' || c.kind === 'port' || c.kind === 'mine') job.level = c.level ?? null;
      if (!jobs.has(c.provinceId)) jobs.set(c.provinceId, []);
      jobs.get(c.provinceId).push({ kind, n: 1, job });
    }
  }
  const date = state.date ?? null;
  for (const p of ctx.hydro?.plants ?? []) {
    if (!p.provinceId || (date && p.validFrom && p.validFrom > date)) continue;
    if (ctx.visible && ctx.controllerOf && !ctx.visible.has(ctx.controllerOf(state, p.provinceId))) continue;
    add(p.provinceId, 'hydro');
  }
  for (const pid of new Set([...jobs.keys(), ...built.keys()])) {
    const list = [...(jobs.get(pid) ?? [])].sort((a, b) => (b.job.frac - a.job.frac) || (RANK.get(a.kind) - RANK.get(b.kind)));
    const m = built.get(pid);
    if (m) list.push(...[...m].sort((a, b) => RANK.get(a[0]) - RANK.get(b[0])).map(([kind, n]) => ({ kind, n })));
    out[pid] = list;
  }
  return out;
}

/**
 * Segnaposto sulla mappa: le chiavi che non sono elementi della mappa (provincia madre divisa da un fiume) vanno sulla sponda
 * più grande; più chiavi sullo stesso elemento si uniscono (lavori prima, poi edifici in ordine). items: elementi del modello.
 */
export function resolveBuildingAnchors(items, byProvince) {
  const direct = new Set(); const children = new Map();
  for (const it of items) {
    direct.add(it.props.id);
    const parent = it.props.parentProvince;
    if (parent) { if (!children.has(parent)) children.set(parent, []); children.get(parent).push(it); }
  }
  const out = {};
  for (const [pid, list] of Object.entries(byProvince ?? {})) {
    let key = pid;
    if (!direct.has(pid)) {
      const kids = children.get(pid);
      if (!kids?.length) continue;
      key = kids.reduce((a, b) => ((b.areaKm2 ?? 0) > (a.areaKm2 ?? 0) || ((b.areaKm2 ?? 0) === (a.areaKm2 ?? 0) && b.props.id < a.props.id) ? b : a)).props.id;
    }
    out[key] = out[key] ? [...out[key], ...list] : [...list];
  }
  for (const k of Object.keys(out)) {
    const l = out[k];
    out[k] = [...l.filter((e) => e.job), ...l.filter((e) => !e.job).sort((a, b) => RANK.get(a.kind) - RANK.get(b.kind))];
  }
  return out;
}
