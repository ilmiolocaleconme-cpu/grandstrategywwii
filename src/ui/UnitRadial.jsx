// Menu sul segnalino scelto (decisione dell'utente 10/11/2026, variante A): il segnalino resta scoperto al centro;
// a destra un riquadro con «i» (scheda completa) sopra e la catena (Inquadra in un comando) sotto;
// intorno le azioni: Muovi in alto, Trincera a sinistra, Supporto in basso (bandierina, non ancora disponibile).
// «Muovi» è anche l'attacco: verso una provincia nemica (in guerra) la marcia diventa un incarico di attacco.
// Agisce sulle unità spuntate nel pannello, oppure su tutte quelle del segnalino se nessuna è spuntata.
import { memo } from 'react';
import { InfoIcon, LinkIcon, SupportIcon } from './ActionIcons.jsx';

const POS = { move: [0, -66], dig: [-66, 0], sup: [0, 66] };

function Dot({ id, label, title, on, disabled, onClick, children }) {
  const [x, y] = POS[id];
  return (
    <button type="button" className={`rd-dot rd-${id}${on ? ' on' : ''}`} style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }} aria-label={label} aria-pressed={on === undefined ? undefined : on} title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function UnitRadial({ n, canAct, moving, digging, canDig, chain, onInfo, onAttach, onMove, onEntrench }) {
  return (
    <div className="rd" role="group" aria-label={`Azioni per ${n} unità`}>
      <span className="rd-ring" aria-hidden="true" />
      <div className="rd-side">
        <button type="button" className="rd-info" aria-label="Scheda dell’unità" title="Scheda dell’unità: composizione, uomini, dotazione" onClick={onInfo}><InfoIcon /></button>
        <button type="button" className="rd-chain" aria-label={chain?.enabled ? 'Inquadra in un comando' : `Inquadra: ${chain?.reason ?? 'non disponibile'}`} title={chain?.enabled ? 'Inquadra in un comando (HQ), dal più vicino' : chain?.reason ?? 'Non disponibile'} disabled={!chain?.enabled} onClick={onAttach}><LinkIcon /></button>
      </div>
      {canAct ? (
        <>
          <Dot id="move" label="Muovi: poi tocca la provincia di destinazione (nemica = attacco)" title="Muovi o attacca: tocca la provincia di destinazione" on={moving} onClick={onMove}>➜</Dot>
          <Dot id="dig" label={digging ? 'Smetti di trincerarti' : 'Trincera'} title={digging ? 'Smetti di trincerarti' : 'Trincera: bonus difensivo che cresce ogni giorno fermo'} on={digging} disabled={!canDig} onClick={onEntrench}>⛏</Dot>
          <Dot id="sup" label="Supporto (non ancora disponibile)" title="Supporto: non ancora disponibile (nessuna regola per i supporti)" disabled onClick={() => {}}><SupportIcon /></Dot>
        </>
      ) : null}
    </div>
  );
}
export default memo(UnitRadial);
