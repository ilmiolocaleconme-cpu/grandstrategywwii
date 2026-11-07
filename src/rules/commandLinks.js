// Collegamenti di comando delle divisioni di terra: distanza dal comando (per la luce sulla mappa e per l'elenco «Inquadra in…»)
// e fili divisione → corpo → armata → … → teatro. Funzioni PURE: niente I/O, niente stato. La regola dei 300 km sta in commandDistance.js.
import { orbatLevel, chainOf, descendantsOf } from './orbat.js';
import { isFarFromCommand } from './commandDistance.js';

const isLandDivision = (u) => Boolean(u) && orbatLevel(u) === 'division';
const kmBetween = (km, a, b) => { const d = km(a, b); return Number.isFinite(d) ? d : null; };

/**
 * Divisioni di terra con un comando superiore: distanza (km) dal comando e se sono fuori portata.
 * posOf(id) = provincia della divisione; cmdPosOf(id) = provincia del comando (reale o stimata); km(a, b) = distanza tra province.
 * Salta le divisioni senza posizione o senza distanza nota: il dato assente non diventa «vicino».
 * Ritorna una lista ordinata per id: [{ id, parent, km, far }].
 */
export function commandDistances({ orbat, unitsById, posOf, cmdPosOf, km, nation }) {
  const out = [];
  for (const id of Object.keys(orbat?.links ?? {}).sort()) {
    const unit = unitsById.get(id);
    if (!isLandDivision(unit) || (nation !== undefined && unit.nation !== nation)) continue;
    const parent = orbat.links[id].parent;
    const dp = posOf(id);
    const cp = cmdPosOf(parent);
    if (!dp || !cp) continue;
    const d = kmBetween(km, cp, dp);
    if (d === null) continue;
    out.push({ id, parent, km: d, far: isFarFromCommand(d) });
  }
  return out;
}

/** Distanza dalla divisione a ciascun comando candidato (km), o null se non nota. Per mostrarla nell'elenco «Inquadra in…». */
export function distanceTo({ unitPos, candidates, cmdPosOf, km }) {
  const out = new Map();
  for (const c of candidates) {
    const cp = cmdPosOf(c.id);
    out.set(c.id, unitPos && cp ? kmBetween(km, cp, unitPos) : null);
  }
  return out;
}

/**
 * Fili di comando sulla mappa: per ogni divisione di terra, un segmento verso il suo comando e da lì verso ciascun superiore
 * fino alla cima (corpo → armata → gruppo d'armate → teatro). Si disegnano tra PROVINCE: segmenti con lo stesso inizio, fine e
 * livello contano una volta sola. Salta i tratti con una posizione ignota e quelli dentro la stessa provincia (lunghezza zero).
 * Le divisioni di supporto, aeree e navali non hanno fili. Ritorna [{ from, to, fromProv, toProv, level, nation }].
 */
export function commandThreads({ orbat, unitsById, posOf, cmdPosOf, nation, focusIds }) {
  const seen = new Set();
  const out = [];
  if (focusIds !== undefined) return focusedThreads({ orbat, unitsById, posOf, cmdPosOf, nation, focusIds });
  for (const id of Object.keys(orbat?.links ?? {}).sort()) {
    const unit = unitsById.get(id);
    if (!isLandDivision(unit) || (nation !== undefined && unit.nation !== nation)) continue;
    const chain = [id, ...chainOf(orbat, id)];
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const from = chain[i];
      const to = chain[i + 1];
      const fromProv = i === 0 ? posOf(from) : cmdPosOf(from);
      const toProv = cmdPosOf(to);
      if (!fromProv || !toProv || fromProv === toProv) continue;
      const level = orbatLevel(unitsById.get(to) ?? {});
      const key = `${fromProv}>${toProv}>${level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from, to, fromProv, toProv, level, nation: unit.nation });
    }
  }
  return out;
}

/**
 * Fili solo per le unità scelte dal giocatore (decisione del 07/11/2026: non sempre, solo al tocco su divisione, corpo o armata).
 * Per ogni unità scelta: lei, i suoi superiori fino al teatro e, se è un comando, tutto ciò che ha sotto. Si disegna il filo di ogni
 * nodo verso il proprio padre quando entrambi sono in questo insieme: i fratelli e i cugini non scelti restano fuori.
 * `focusIds` vuoto = nessun filo. Solo la nazione richiesta; niente supporti. Stesse regole di dedup e di lunghezza zero.
 */
function focusedThreads({ orbat, unitsById, posOf, cmdPosOf, nation, focusIds }) {
  const links = orbat?.links ?? {};
  const relevant = new Set();
  for (const f of focusIds) {
    const u = unitsById.get(f);
    if (!u || (nation !== undefined && u.nation !== nation)) continue; // le unità di altre nazioni non danno fili (niente informazioni sul nemico)
    relevant.add(f);
    for (const a of chainOf(orbat, f)) relevant.add(a);
    for (const d of descendantsOf(orbat, f)) relevant.add(d);
  }
  const seen = new Set();
  const out = [];
  for (const id of [...relevant].sort()) {
    const parent = links[id]?.parent;
    const unit = unitsById.get(id);
    const level = orbatLevel(unit ?? {});
    if (!parent || !relevant.has(parent) || !level || level === 'support') continue;
    if (nation !== undefined && unit.nation !== nation) continue;
    const fromProv = level === 'division' ? posOf(id) : cmdPosOf(id);
    const toProv = cmdPosOf(parent);
    if (!fromProv || !toProv || fromProv === toProv) continue;
    const toLevel = orbatLevel(unitsById.get(parent) ?? {});
    const key = `${fromProv}>${toProv}>${toLevel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: id, to: parent, fromProv, toProv, level: toLevel, nation: unit.nation });
  }
  return out;
}
