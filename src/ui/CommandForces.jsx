// Forze agli ordini di un comando, per il segnalino (pannello Esercito) e per la scheda: conteggio, righe dalla più vicina (tetto SUBS_SHOWN),
// stato vuoto che si spiega e «Aggiungi unità…» con l'elenco delle unità libere dalla più vicina al comando. Nessuno stato di gioco: solo interfaccia.
import { useState } from 'react';
import { nearestFirst, byDistance, distanceLabel } from '../rules/commandLinks.js';

export const SUBS_SHOWN = 5;
const MARK = { theater: '★★★★★★', army_group: 'XXXXX', army: 'XXXX', corps: 'XXX', division: 'XX', brigade: 'X', support: '·' };

/** Unità libere di livello inferiore, in una lista sola dalla più vicina al comando, con livello e distanza sotto il nome. */
export function ChildPicker({ title, options, onPick, onClose }) {
  const list = nearestFirst(options());
  return (
    <section className="cf-picker" aria-label={title}>
      <header><strong>{title}</strong><button type="button" className="close" aria-label="Chiudi elenco" onClick={onClose}>×</button></header>
      {list.length === 0 ? <p className="muted small">Nessuna unità libera di livello inferiore.</p> : (
        <ul>
          {list.map((u) => {
            const d = distanceLabel(u.km);
            return (
              <li key={u.id}>
                <button type="button" className={u.nearest ? 'near' : ''} onClick={() => onPick(u.id)}>
                  <i aria-hidden="true">{MARK[u.level] ?? ''}</i><b>{u.name}</b>
                  <small className={d.far ? 'far' : ''}>{u.levelLabel} · {d.text}{u.nearest ? ' · la più vicina' : ''}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * `subs`: divisioni agli ordini [{id, name, province, km}]. `own`: il comando è della nostra nazione (distanze, stato vuoto e aggiunta solo per noi:
 * di un comando nemico non si dice nulla in più di prima). `childOptions()` dà i gruppi di validChildren con km; `onAttachChild(hqId, childId)` inquadra.
 */
export default function CommandForces({ unit, subs, own, childOptions, onAttachChild }) {
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = byDistance(subs);
  const shown = all ? list : list.slice(0, SUBS_SHOWN);
  const rest = list.length - shown.length;
  const canAdd = Boolean(own && childOptions && onAttachChild);
  if (list.length === 0 && !own) return null;
  return (
    <div className="cf" role="group" aria-label={`Agli ordini di ${unit.name}`}>
      <p className="cf-head">{list.length === 0 ? 'Nessuna divisione agli ordini' : `${list.length} ${list.length === 1 ? 'divisione agli ordini' : 'divisioni agli ordini'}`}</p>
      {list.length > 0 ? (
        <ul className="ap-subs">
          {shown.map((d) => {
            const dl = own ? distanceLabel(d.km) : null;
            return <li key={d.id}><b>{d.name}</b> <small className={dl?.far ? 'far' : ''}>{d.province ?? '—'}{dl ? ` · ${dl.text}` : ''}</small></li>;
          })}
        </ul>
      ) : null}
      {rest > 0 ? <button type="button" className="cf-btn" onClick={() => setAll(true)}>altre {rest}</button> : null}
      {all && list.length > SUBS_SHOWN ? <button type="button" className="cf-btn" onClick={() => setAll(false)}>meno</button> : null}
      {canAdd ? <button type="button" className="cf-btn go" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>{adding ? 'Chiudi l’elenco' : 'Aggiungi unità…'}</button> : null}
      {canAdd && adding ? <ChildPicker title={`Aggiungi a «${unit.name}»…`} options={() => childOptions(unit.id)} onPick={(cid) => { onAttachChild(unit.id, cid); setAdding(false); }} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
