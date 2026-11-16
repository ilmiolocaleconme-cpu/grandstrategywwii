// Feriti e ospedali nello stato della partita (battaglia v2, 16/11/2026). Il registro è `state.casualties` (src/rules/battleV2.js): i feriti di
// battaglia entrano in `hospital`; ogni giorno gli ospedali della nazione (src/rules/hospitals.js, data/medical/hospital_care.json) ne curano
// quanti ne tengono, consumando medicina: i guariti escono dal registro (tornano al pool reclutabile), i morti passano ai caduti.
// I feriti senza posto: muoiono al ritmo di hospital_care.json e guariscono da soli al ritmo `selfRecoveryPerDay` (IPOTESI di Claude: feriti leggeri
// curati ai posti di medicazione; senza, una nazione senza ospedali perderebbe tutti i feriti).
import { hospitalDay } from '../rules/hospitals.js';
import { casualtiesOf } from '../rules/battleV2.js';

export const SELF_RECOVERY_PER_DAY = 0.01;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Sistema giornaliero. ctx: { params (hospital_care.json), selfRecoveryPerDay? }. Senza feriti non fa nulla (stato identico). */
export function createCasualtySystem({ params, selfRecoveryPerDay = SELF_RECOVERY_PER_DAY }) {
  return (state) => {
    const by = state.casualties?.byNation;
    if (!by) return state;
    let s = state;
    for (const nation of Object.keys(by).sort()) {
      const c = casualtiesOf(s.casualties, nation);
      if (!(c.hospital > 0)) continue;
      const n = s.nations?.[nation];
      const counts = {};
      for (const h of n?.hospitals ?? []) if (params.kinds[h.kind]) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
      const medicine = Math.max(0, n?.stocks?.medicine ?? 0);
      const d = hospitalDay({ wounded: c.hospital, medicine, counts }, params);
      const self = Math.min(d.wounded, r3(d.waiting * selfRecoveryPerDay));
      const left = r3(d.wounded - self);
      const row = { ...c, hospital: left < 0.5 ? 0 : left, recovered: r3(c.recovered + d.recovered + self + (left < 0.5 ? left : 0)), killed: r3(c.killed + d.died) };
      s = { ...s, casualties: { ...s.casualties, byNation: { ...s.casualties.byNation, [nation]: row } } };
      if (n && d.medicineUsed > 0) s = { ...s, nations: { ...s.nations, [nation]: { ...n, stocks: { ...n.stocks, medicine: r3(medicine - d.medicineUsed) } } } };
    }
    return s;
  };
}
