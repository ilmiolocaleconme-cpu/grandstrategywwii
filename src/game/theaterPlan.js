// Pianificazione degli incarichi di teatro: DOVE vanno le truppe e QUANTE ne servono (30/10/2026). Funzioni PURE.
//
// DIFESA: le truppe vanno ai CONFINI. Posti di difesa = province scelte che toccano un territorio non tuo (se nessuna lo tocca, tutte le
//   scelte). Le divisioni si ripartiscono tra i posti dove la copertura (presenti + in arrivo) / fabbisogno è più bassa.
//   Fabbisogno di un posto = max(DEFENSE_MARGIN × minaccia, MIN_GARRISON se confina con una nazione in guerra con te);
//   minaccia = potenza nemica nella provincia e in quelle adiacenti.
// ATTACCO: le truppe vanno prima ai CONFINI (punto di raccolta = ultima provincia tua sul percorso verso l'obiettivo); l'attacco PARTE quando
//   la potenza raccolta ≥ ATTACK_RATIO × quella dei difensori dell'obiettivo (provincia vuota: subito) oppure se il giocatore forza l'attacco.
//   Si lavora su un obiettivo alla volta: quello col fabbisogno minore.
// AVVISO: se presenti + in arrivo non bastano il piano segnala «servono più truppe» (livello `short`); se bastano ma non sono ancora
//   arrivate, `gathering` (in raccolta). I numeri (1,2; 10000; 1,5) sono IPOTESI di Claude da approvare; la potenza è uomini effettivi × fattore
//   di categoria (src/rules/combat.js). Limiti: la minaccia conta solo le divisioni presenti ORA (non rinforzi in marcia del nemico), niente
//   fiumi/terreno/rifornimenti, nessuna previsione dell'IA avversaria.
import { divisionPower } from '../rules/combat.js';
import { atWar } from '../rules/war.js';
import { positionOf, findPath } from '../rules/movement.js';
import { provinceController, canEnterWar, isFighter, effectiveOf } from './warCommon.js';

export const ATTACK_RATIO = 1.5;
export const DEFENSE_MARGIN = 1.2;
export const MIN_GARRISON = 10000;
export const DIVISION_POWER_REF = 10000; // una divisione ≈ 10000 di potenza: serve solo a dire "mancano circa N divisioni" nell'avviso

export function powerOfUnit(state, unit) {
  const m = effectiveOf(state, unit.id);
  return m ? divisionPower({ category: unit.category, effective: m.effective }) : 0;
}

/** Potenza nemica per provincia (Map): le divisioni in grado di combattere delle nazioni in guerra con `nation`. */
export function enemyPowerMap(state, ctx, nation) {
  const map = new Map();
  for (const e of ctx.deploymentDoc.entries) {
    const u = ctx.unitsById.get(e.unit);
    if (!u || u.nation === nation || !atWar(state.war, u.nation, nation) || !isFighter(state, u)) continue;
    const pos = positionOf(state.movement, ctx.initial, u.id);
    if (pos) map.set(pos, (map.get(pos) ?? 0) + powerOfUnit(state, u));
  }
  return map;
}

function kmOf(net, path) {
  let km = 0;
  for (let i = 1; i < path.length; i += 1) km += net.km(path[i - 1], path[i]);
  return km;
}

/** Posti di difesa di un incarico: le province scelte ancora tue e di confine; se nessuna lo è, tutte le tue scelte; se non ne hai più, le scelte. */
export function defensePosts(state, net, a) {
  const mine = a.provinces.filter((p) => provinceController(state, net, p) === a.nation);
  const border = mine.filter((p) => net.neighbors(p).some((n) => provinceController(state, net, n) !== a.nation));
  return border.length ? border : (mine.length ? mine : a.provinces);
}

const cmpId = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

function fightersOf(state, ctx, a) {
  const out = [];
  for (const id of a.units) {
    const u = ctx.unitsById.get(id);
    if (!u || !isFighter(state, u)) continue;
    const pos = positionOf(state.movement, ctx.initial, id);
    if (!pos) continue;
    const order = state.movement?.orders?.[id];
    out.push({ id, u, pos, power: powerOfUnit(state, u), moving: Boolean(order), dest: order ? order.path[order.path.length - 1] : null });
  }
  return out.sort((x, y) => cmpId(x.id, y.id));
}

const alertOf = (a, province, name, need, have, arriving) => {
  const missing = Math.max(0, Math.ceil(need - have - arriving));
  return { assignmentId: a.id, kind: a.kind, province, name, need: Math.round(need), have: Math.round(have), arriving: Math.round(arriving), missing, divisions: Math.ceil(missing / DIVISION_POWER_REF), level: missing > 0 ? 'short' : 'gathering' };
};

function planDefense(state, ctx, net, a) {
  const posts = defensePosts(state, net, a);
  const enemy = enemyPowerMap(state, ctx, a.nation);
  const fighters = fightersOf(state, ctx, a);
  const info = posts.map((p) => {
    const facesWar = (enemy.get(p) ?? 0) > 0 || net.neighbors(p).some((n) => atWar(state.war, provinceController(state, net, n), a.nation));
    const threat = (enemy.get(p) ?? 0) + net.neighbors(p).reduce((t, n) => t + (enemy.get(n) ?? 0), 0);
    const need = Math.max(DEFENSE_MARGIN * threat, facesWar ? MIN_GARRISON : 0);
    return { p, need, have: 0, arriving: 0 };
  });
  const byPost = new Map(info.map((x) => [x.p, x]));
  for (const f of fighters) {
    if (byPost.has(f.pos)) byPost.get(f.pos).have += f.power;
    else if (f.moving && byPost.has(f.dest)) byPost.get(f.dest).arriving += f.power;
  }
  const canEnter = canEnterWar(state, net, a.nation);
  const orders = [];
  for (const f of fighters) {
    if (byPost.has(f.pos) || f.moving) continue;
    const scored = info.map((x) => ({ x, score: (x.have + x.arriving) / Math.max(x.need, 1) })).sort((m, n) => m.score - n.score || cmpId(m.x.p, n.x.p));
    const best = scored[0].score;
    let pick = null;
    for (const c of scored.filter((c) => c.score <= best + 1e-9)) {
      const path = findPath(net, f.pos, c.x.p, canEnter);
      if (!path) continue;
      const km = kmOf(net, path);
      if (!pick || km < pick.km) pick = { x: c.x, km };
    }
    if (!pick) continue;
    pick.x.arriving += f.power;
    orders.push({ unit: f.id, to: pick.x.p });
  }
  const alerts = info.filter((x) => x.need > 0 && x.have < x.need).map((x) => alertOf(a, x.p, net.name(x.p), x.need, x.have, x.arriving));
  return { orders, alerts };
}

function planAttack(state, ctx, net, a) {
  const pending = a.provinces.filter((p) => provinceController(state, net, p) !== a.nation);
  if (pending.length === 0) return { orders: [], alerts: [] };
  const enemy = enemyPowerMap(state, ctx, a.nation);
  const needOf = (q) => ((enemy.get(q) ?? 0) > 0 ? ATTACK_RATIO * enemy.get(q) : 0);
  const focus = [...pending].sort((x, y) => needOf(x) - needOf(y) || cmpId(x, y))[0];
  const need = needOf(focus);
  const canEnter = canEnterWar(state, net, a.nation);
  const fighters = fightersOf(state, ctx, a);
  // punto di raccolta di ogni unità: ultima provincia tua sul percorso verso l'obiettivo (la sua posizione se è già fuori o nell'obiettivo)
  const rows = [];
  for (const f of fighters) {
    if (f.pos === focus) { rows.push({ ...f, staging: focus, at: true }); continue; }
    const path = findPath(net, f.pos, focus, canEnter);
    if (!path) continue;
    let i = 0;
    while (i + 1 < path.length && provinceController(state, net, path[i + 1]) === a.nation && path[i + 1] !== focus) i += 1;
    const staging = provinceController(state, net, path[i]) === a.nation ? path[i] : f.pos;
    rows.push({ ...f, staging, at: f.pos === staging });
  }
  let have = 0; let arriving = 0;
  for (const r of rows) {
    if (r.at) have += r.power;
    else if (r.moving && (r.dest === r.staging || r.dest === focus)) arriving += r.power;
  }
  const launch = a.force === true || need === 0 || have >= need;
  const orders = [];
  for (const r of rows) {
    if (r.moving || r.pos === focus) continue;
    if (launch) { if (r.at) orders.push({ unit: r.id, to: focus }); else orders.push({ unit: r.id, to: r.staging }); } else if (!r.at) orders.push({ unit: r.id, to: r.staging });
  }
  const alerts = launch ? [] : [alertOf(a, focus, net.name(focus), need, have, arriving)];
  return { orders, alerts };
}

/** Piano di un incarico attivo: { orders: [{ unit, to }], alerts: [...] }. */
export function planAssignment(state, ctx, net, a) {
  return a.kind === 'defend' ? planDefense(state, ctx, net, a) : planAttack(state, ctx, net, a);
}
