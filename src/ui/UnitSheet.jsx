// Scheda completa di una o più unità (quelle del segnalino): si sceglie l'unità con le etichette in alto.
import { useState } from 'react';
import { Info } from './UnitInfo.jsx';

export default function UnitSheet({ infos, canSetPolicy, onPolicy, onClose }) {
  const [i, setI] = useState(0);
  const info = infos[Math.min(i, infos.length - 1)];
  if (!info) return null;
  return (
    <aside className="panel army-panel unit-sheet" aria-label="Scheda unità">
      <header className="ap-head">
        <div className="ap-title"><h2>Scheda unità</h2><p>{infos.length} {infos.length === 1 ? 'unità' : 'unità'}</p></div>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      {infos.length > 1 ? (
        <div className="th-seg us-tabs" role="tablist" aria-label="Unità">
          {infos.map((x, k) => <button key={x.id} type="button" role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => setI(k)}>{x.name}</button>)}
        </div>
      ) : null}
      <div className="us-body"><Info info={info} canSetPolicy={canSetPolicy && info.nation !== undefined} onPolicy={onPolicy} /></div>
    </aside>
  );
}
