// Combattimento terrestre tra divisioni nella stessa provincia. Funzioni PURE e DETERMINISTICHE (nessun caso: stesso stato, stesso esito).
//
// MODELLO (semplice, dichiarato; TUTTI i numeri sono IPOTESI DI BILANCIAMENTO di Claude, non dati storici, da approvare):
//  - potenza di una divisione = uomini effettivi × FATTORE della categoria (la corazzata pesa più della fanteria a parità di uomini);
//  - ogni giorno ciascuna parte perde LOSS_BASE × min(LOSS_CAP, potenza avversaria / potenza propria) dei propri uomini effettivi:
//    chi è più debole perde di più; un sovrastante rapporto di forze non azzera nulla in un giorno;
//  - la difesa gode di `defenseMultiplier` (terreno, fiumi: lo calcola il chiamante; default 1 = nessun effetto);
//  - ritirata: una parte con meno di RETREAT_BELOW degli uomini PREVISTI (o con potenza < 1/RETREAT_RATIO dell'avversario) lascia la provincia.
// NON MODELLATO: morti/feriti/dispersi separati (si perdono "uomini effettivi"), equipaggiamento perso, munizioni, supporto aereo/artiglieria,
// ordine di battaglia superiore, comandanti, morale, esperienza, rifornimenti.
export const CATEGORY_POWER = Object.freeze({ infantry: 1, mountain: 1, airborne: 0.9, cavalry: 0.8, motorized: 1.2, mechanized: 1.4, armored: 1.8 });
export const LOSS_BASE = 0.02;
export const LOSS_CAP = 3;
export const RETREAT_BELOW = 0.25;
export const RETREAT_RATIO = 3;

export const categoryPower = (category) => CATEGORY_POWER[category] ?? 0;

/** Potenza di una divisione: { category, effective }. Le categorie che non combattono (comandi) valgono 0. */
export function divisionPower({ category, effective }) {
  return Math.max(0, effective) * categoryPower(category);
}

/**
 * Un giorno di battaglia. Ogni parte: [{ id, category, effective, planned }]. Ritorna
 * { attackerLoss: { id: n }, defenderLoss: { id: n }, attackerPower, defenderPower, attackerRetreats, defenderRetreats }.
 * Le perdite sono interi >= 0 e mai oltre gli uomini effettivi.
 */
export function resolveBattleDay({ attackers, defenders, defenseMultiplier = 1 }) {
  const aPow = attackers.reduce((s, u) => s + divisionPower(u), 0);
  const dPow = defenders.reduce((s, u) => s + divisionPower(u), 0) * defenseMultiplier;
  const rateA = aPow > 0 ? LOSS_BASE * Math.min(LOSS_CAP, dPow / aPow) : 0;
  const rateD = dPow > 0 ? LOSS_BASE * Math.min(LOSS_CAP, aPow / dPow) : 0;
  const loss = (units, rate) => {
    const out = {};
    for (const u of units) {
      if (u.effective <= 0) { out[u.id] = 0; continue; }
      out[u.id] = Math.min(u.effective, Math.max(1, Math.round(u.effective * rate)));
    }
    return out;
  };
  const attackerLoss = aPow > 0 ? loss(attackers, rateA) : Object.fromEntries(attackers.map((u) => [u.id, 0]));
  const defenderLoss = dPow > 0 ? loss(defenders, rateD) : Object.fromEntries(defenders.map((u) => [u.id, 0]));
  const left = (units, lossMap) => ({ effective: units.reduce((s, u) => s + u.effective - lossMap[u.id], 0), planned: units.reduce((s, u) => s + u.planned, 0) });
  const a = left(attackers, attackerLoss); const d = left(defenders, defenderLoss);
  const weak = (s, ownPow, otherPow) => s.planned > 0 && (s.effective / s.planned < RETREAT_BELOW || (ownPow > 0 && otherPow / ownPow > RETREAT_RATIO) || (ownPow === 0 && otherPow > 0));
  return {
    attackerLoss, defenderLoss, attackerPower: aPow, defenderPower: dPow,
    attackerRetreats: weak(a, aPow, dPow), defenderRetreats: weak(d, dPow, aPow),
  };
}
