// Menu radiale sul segnalino scelto: al centro «I» (scheda completa), intorno le azioni (Muovi, Trincera, Supporto).
// «Muovi» è anche l'attacco: verso una provincia nemica (in guerra) la marcia diventa un incarico di attacco.
// Agisce sulle unità spuntate nel pannello, oppure su tutte quelle del segnalino se nessuna è spuntata.
import { memo } from 'react';

const POS = { move: [0, -66], dig: [-66, 0], sup: [0, 66] };

function Dot({ id, label, title, on, disabled, onClick, text }) {
  const [x, y] = POS[id];
  return (
    <button type="button" className={`rd-dot rd-${id}${on ? ' on' : ''}`} style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }} aria-label={label} aria-pressed={on === undefined ? undefined : on} title={title} disabled={disabled} onClick={onClick}>
      {text}
    </button>
  );
}

function UnitRadial({ n, canAct, moving, digging, canDig, onInfo, onMove, onEntrench }) {
  return (
    <div className="rd" role="group" aria-label={`Azioni per ${n} ${n === 1 ? 'unità' : 'unità'}`}>
      <button type="button" className="rd-center" aria-label="Scheda dell’unità" title="Scheda dell’unità: composizione, uomini, dotazione" onClick={onInfo}>I</button>
      {canAct ? (
        <>
          <Dot id="move" text="➜" label="Muovi: poi tocca la provincia di destinazione (nemica = attacco)" title="Muovi o attacca: tocca la provincia di destinazione" on={moving} onClick={onMove} />
          <Dot id="dig" text="⛏" label={digging ? 'Smetti di trincerarti' : 'Trincera'} title={digging ? 'Smetti di trincerarti' : 'Trincera: bonus difensivo che cresce ogni giorno fermo'} on={digging} disabled={!canDig} onClick={onEntrench} />
          <Dot id="sup" text="＋" label="Supporto (non ancora disponibile)" title="Supporto: non ancora disponibile (nessuna regola per i supporti)" disabled onClick={() => {}} />
        </>
      ) : null}
    </div>
  );
}
export default memo(UnitRadial);
