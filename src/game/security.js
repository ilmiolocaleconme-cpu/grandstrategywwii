// Spionaggio, sabotaggio e difesa (nazione per nazione). Funzioni PURE (nessun Date.now, nessun Math.random: i tiri sono deterministici, vedi rules/security.js).
// Stato per nazione (facoltativo): nation.security — vedi securityState.js. Costi in ECV e durate scalati dalla difficoltà come le costruzioni.
// Difendono: polizia locale (fissa), guarnigione (province_presence.json, oggi vuoto) e reparti di polizia militare assegnati a un luogo.
import { difficulty } from '../data/economy.js';
import { entityOfProvinceId } from '../data/provinceOwner.js';
import { hasTech } from './research.js';
import { securityOf } from './securityState.js';
import { roll01, defenseScore, sabotageChance, detectionChance, catchChance } from '../rules/security.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const cap = (list, n) => (list.length > n ? list.slice(list.length - n) : list);

export function createSecurity({ security: cfg, economy, political, presence = null }) {
  const entityIds = political.map((e) => e.id);
  const entityOf = (id) => entityOfProvinceId(id, entityIds);
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  const scaled = (state, ecv, days) => { const d = difficulty(economy, state.difficulty); return { ecv: r3(ecv * d.costMul), days: Math.max(1, Math.ceil(days * d.timeMul)) }; };
  const put = (state, id, nation) => ({ ...state, nations: { ...state.nations, [id]: nation } });
  const canAgents = (nation) => hasTech(nation, cfg.capabilities.agents);
  const hasCI = (nation) => hasTech(nation, cfg.capabilities.counterintelligence);
  const policeTotal = (nation) => Object.values(securityOf(nation).mp).reduce((a, b) => a + b, 0);
  /** Luogo di difesa di un impianto: provincia madre se la ha, altrimenti l'entità politica (impianti iniziali). */
  const placeOf = (f) => f.provinceId ?? f.territory;
  const placeControlled = (state, nationId, place) => state.control[place] === nationId || state.control[entityOf(place)] === nationId;

  /** Difesa del luogo `place` della nazione: { local, garrison, militaryPolice, total }. */
  function defenseAt(nation, place) {
    const mp = securityOf(nation).mp[place] ?? 0;
    const garrison = presence?.byProvince?.[place]?.garrison ?? 0;
    return defenseScore(cfg, { mp, garrison, counterIntel: hasCI(nation) });
  }

  /** Costo di addestrare `count` agenti del ruolo ('spy' | 'saboteur'). */
  const agentCost = (state, role, count = 1) => { const a = cfg.agents[role]; const c = scaled(state, a.cost_ecv * count, a.days); return c; };

  function train(state, nationId, role, count = 1) {
    const nation = state.nations?.[nationId];
    if (!nation) return fail('unknown_nation');
    if (!cfg.agents[role] || !Number.isInteger(count) || count < 1) return fail('invalid_order');
    if (!canAgents(nation)) return fail('missing', { missing: [{ what: 'tech', need: cfg.capabilities.agents, have: null }] });
    const cost = agentCost(state, role, count);
    if (!(nation.balance >= cost.ecv)) return fail('missing', { missing: [{ what: 'ecv', need: cost.ecv, have: nation.balance }] });
    const sec = securityOf(nation);
    const entry = { id: `${nationId}:${state.day}:train:${role}:${sec.queue.length}`, kind: 'train', role, count, daysLeft: cost.days, totalDays: cost.days };
    return { ok: true, entry, state: put(state, nationId, { ...nation, balance: r3(nation.balance - cost.ecv), security: { ...sec, queue: [...sec.queue, entry] } }) };
  }

  /** Costo e durata di un reparto di polizia militare. */
  const policeCost = (state) => scaled(state, cfg.militaryPolice.cost_ecv, cfg.militaryPolice.days);

  function trainMilitaryPolice(state, nationId, place) {
    const nation = state.nations?.[nationId];
    if (!nation) return fail('unknown_nation');
    if (typeof place !== 'string' || !place) return fail('invalid_place');
    if (!placeControlled(state, nationId, place)) return fail('not_controlled');
    const sec = securityOf(nation);
    const have = (sec.mp[place] ?? 0) + sec.queue.filter((q) => q.kind === 'mp' && q.place === place).length;
    if (have >= cfg.militaryPolice.maxPerPlace) return fail('max_level', { max: cfg.militaryPolice.maxPerPlace });
    const cost = policeCost(state);
    if (!(nation.balance >= cost.ecv)) return fail('missing', { missing: [{ what: 'ecv', need: cost.ecv, have: nation.balance }] });
    const entry = { id: `${nationId}:${state.day}:mp:${place}:${sec.queue.length}`, kind: 'mp', place, daysLeft: cost.days, totalDays: cost.days };
    return { ok: true, entry, state: put(state, nationId, { ...nation, balance: r3(nation.balance - cost.ecv), security: { ...sec, queue: [...sec.queue, entry] } }) };
  }

  /** Schiera una spia dalla riserva presso la nazione bersaglio: dà informazioni sugli impianti e migliora le probabilità di sabotaggio. Immediato. */
  function deploySpy(state, nationId, targetId) {
    const nation = state.nations?.[nationId];
    if (!nation || !state.nations[targetId]) return fail('unknown_nation');
    if (targetId === nationId) return fail('same_nation');
    const sec = securityOf(nation);
    if (sec.agents.spy < 1) return fail('no_agent', { role: 'spy' });
    const next = { ...sec, agents: { ...sec.agents, spy: sec.agents.spy - 1 }, deployed: { ...sec.deployed, [targetId]: (sec.deployed[targetId] ?? 0) + 1 } };
    return { ok: true, state: put(state, nationId, { ...nation, security: next }) };
  }

  /** Impianti del bersaglio visibili: solo con almeno una spia schierata (informazione); per ognuno difesa, probabilità di riuscita e di scoperta. */
  function targetsFor(state, nationId, targetId) {
    const nation = state.nations?.[nationId]; const target = state.nations?.[targetId];
    if (!nation || !target || nationId === targetId) return [];
    const spies = securityOf(nation).deployed[targetId] ?? 0;
    if (spies < 1) return [];
    return target.facilities.map((f) => {
      const place = placeOf(f); const d = defenseAt(target, place);
      return { facilityId: f.id, type: f.type, level: f.level ?? 1, damage: f.damage ?? 0, place, defense: d.total, chance: sabotageChance(cfg, d.total, spies), detect: detectionChance(cfg, d.total) };
    });
  }

  /** Avvia un sabotaggio contro un impianto del bersaglio. Richiede tecnologia, un sabotatore libero e almeno una spia schierata. */
  function sabotage(state, nationId, { targetNation, facilityId }) {
    const nation = state.nations?.[nationId]; const target = state.nations?.[targetNation];
    if (!nation || !target) return fail('unknown_nation');
    if (targetNation === nationId) return fail('same_nation');
    if (!canAgents(nation)) return fail('missing', { missing: [{ what: 'tech', need: cfg.capabilities.agents, have: null }] });
    const sec = securityOf(nation);
    if ((sec.deployed[targetNation] ?? 0) < 1) return fail('no_intel');
    if (sec.agents.saboteur < 1) return fail('no_agent', { role: 'saboteur' });
    const f = target.facilities.find((x) => x.id === facilityId);
    if (!f) return fail('no_facility');
    if (sec.queue.some((q) => q.kind === 'op' && q.facilityId === facilityId)) return fail('already_building');
    const cost = sabotageCost(state);
    if (!(nation.balance >= cost.ecv)) return fail('missing', { missing: [{ what: 'ecv', need: cost.ecv, have: nation.balance }] });
    const entry = { id: `${nationId}:${state.day}:op:${facilityId}`, kind: 'op', targetNation, facilityId, type: f.type, daysLeft: cost.days, totalDays: cost.days };
    const next = { ...nation, balance: r3(nation.balance - cost.ecv), security: { ...sec, agents: { ...sec.agents, saboteur: sec.agents.saboteur - 1 }, queue: [...sec.queue, entry] } };
    return { ok: true, entry, state: put(state, nationId, next) };
  }

  /** Esito di un'operazione arrivata a termine: modifica `nations` (copia di lavoro). */
  function resolveOp(state, nations, attackerId, op) {
    const att = nations[attackerId]; const attSec = securityOf(att);
    const tgt = nations[op.targetNation];
    const fi = tgt ? tgt.facilities.findIndex((f) => f.id === op.facilityId) : -1;
    const log = (entry) => ({ ...att.security, log: cap([...(att.security?.log ?? []), { day: state.day, ...entry }], cfg.logSize) });
    if (fi < 0) { // impianto sparito: l'operazione cade e il sabotatore rientra
      nations[attackerId] = { ...att, security: { ...log({ kind: 'sabotage', targetNation: op.targetNation, facilityId: op.facilityId, type: op.type, result: 'void' }), agents: { ...attSec.agents, saboteur: attSec.agents.saboteur + 1 } } };
      return;
    }
    const f = tgt.facilities[fi];
    const d = defenseAt(tgt, placeOf(f));
    const spies = attSec.deployed[op.targetNation] ?? 0;
    const success = roll01(state.day, op.id, 'esito') < sabotageChance(cfg, d.total, spies);
    const detected = roll01(state.day, op.id, 'scoperta') < detectionChance(cfg, d.total);
    const damage = success ? r3(Math.min(1, (f.damage ?? 0) + cfg.sabotage.damage)) : (f.damage ?? 0);
    const facilities = tgt.facilities.slice(); facilities[fi] = { ...f, damage };
    const tSec = securityOf(tgt);
    const incident = success || detected ? [{ day: state.day, kind: 'sabotage', facilityId: f.id, type: f.type, success, attacker: detected ? attackerId : null }] : [];
    nations[op.targetNation] = { ...tgt, facilities, security: { ...tSec, incidents: cap([...tSec.incidents, ...incident], cfg.logSize) } };
    const base = log({ kind: 'sabotage', targetNation: op.targetNation, facilityId: f.id, type: f.type, result: success ? 'success' : 'failure', detected, damage });
    nations[attackerId] = { ...att, security: { ...base, agents: { ...attSec.agents, saboteur: attSec.agents.saboteur + (detected ? 0 : 1) } } };
  }

  /** Sistema giornaliero: avanza le code (addestramento, polizia, operazioni), il controspionaggio e la riparazione dei danni. */
  function securityDay(state) {
    if (!state.nations) return state;
    const nations = { ...state.nations };
    // 1. code
    for (const id of Object.keys(nations)) {
      const sec0 = nations[id].security;
      if (!sec0 || !sec0.queue?.length) continue;
      const done = []; const queue = [];
      for (const q of sec0.queue) (q.daysLeft - 1 > 0 ? queue.push({ ...q, daysLeft: q.daysLeft - 1 }) : done.push(q));
      let n = { ...nations[id], security: { ...sec0, queue } };
      nations[id] = n;
      for (const q of done) {
        n = nations[id]; const sec = securityOf(n);
        if (q.kind === 'train') nations[id] = { ...n, security: { ...sec, agents: { ...sec.agents, [q.role]: sec.agents[q.role] + q.count }, log: cap([...sec.log, { day: state.day, kind: 'trained', role: q.role, count: q.count }], cfg.logSize) } };
        else if (q.kind === 'mp') nations[id] = { ...n, security: { ...sec, mp: { ...sec.mp, [q.place]: (sec.mp[q.place] ?? 0) + 1 }, log: cap([...sec.log, { day: state.day, kind: 'police', place: q.place }], cfg.logSize) } };
        else resolveOp(state, nations, id, q);
      }
    }
    // 2. controspionaggio: ogni nazione con la tecnologia scopre, giorno per giorno, le spie straniere schierate contro di lei
    for (const tid of Object.keys(nations)) {
      if (!hasCI(nations[tid])) continue;
      const p = catchChance(cfg, policeTotal(nations[tid]));
      for (const aid of Object.keys(nations)) {
        if (aid === tid) continue;
        const att = nations[aid]; const n = securityOf(att).deployed[tid] ?? 0;
        if (n < 1) continue;
        let caught = 0;
        for (let k = 0; k < n; k += 1) if (roll01(state.day, tid, aid, 'spia', k) < p) caught += 1;
        if (!caught) continue;
        const aSec = securityOf(att); const deployed = { ...aSec.deployed };
        if (n - caught > 0) deployed[tid] = n - caught; else delete deployed[tid];
        nations[aid] = { ...att, security: { ...aSec, deployed, log: cap([...aSec.log, { day: state.day, kind: 'spy_caught', targetNation: tid, count: caught }], cfg.logSize) } };
        const t = nations[tid]; const tSec = securityOf(t);
        nations[tid] = { ...t, security: { ...tSec, incidents: cap([...tSec.incidents, { day: state.day, kind: 'spy_caught', attacker: aid, count: caught }], cfg.logSize) } };
      }
    }
    // 3. riparazione lenta dei danni
    for (const [id, n] of Object.entries(nations)) {
      if (!n.facilities.some((f) => (f.damage ?? 0) > 0)) continue;
      nations[id] = { ...n, facilities: n.facilities.map((f) => ((f.damage ?? 0) > 0 ? { ...f, damage: Math.max(0, r3(f.damage - cfg.repair.perDay)) } : f)) };
    }
    return { ...state, nations };
  }

  const sabotageCost = (state) => scaled(state, cfg.sabotage.cost_ecv, cfg.sabotage.days);
  return { sabotageCost, train, trainMilitaryPolice, deploySpy, sabotage, targetsFor, securityDay, defenseAt, agentCost, policeCost, placeOf, policeTotal, canAgents, hasCI };
}
