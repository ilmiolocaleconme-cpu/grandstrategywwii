// Pannello Teatro: dai un incarico (attacco o difesa), scegli le province toccandole sulla mappa e conferma. Sotto: incarichi attivi, guerra e ultime battaglie.
import { useState } from 'react';

export default function TheaterPanel({ draft, unitCount, cards, alerts, onForce, enemies, candidates, log, nameOf, notice, onKind, onRemove, onConfirm, onCancelDraft, onCancelAssignment, onDeclareWar, onClose }) {
  const [target, setTarget] = useState('');
  return (
    <aside className="panel army-panel th-panel" aria-label="Teatro">
      <header className="ap-head">
        <div className="ap-title"><strong>Teatro</strong><span className="muted">{draft ? 'Nuovo incarico' : `${cards.length} incarichi attivi · ${enemies.length ? `in guerra con ${enemies.join(', ')}` : 'nessuna guerra'}`}</span></div>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      {notice ? <p className="ap-notice" role="status">{notice}</p> : null}
      {draft ? (
        <section className="th-draft">
          <div className="th-seg" role="group" aria-label="Tipo di incarico">
            <button type="button" className={draft.kind === 'attack' ? 'on' : ''} aria-pressed={draft.kind === 'attack'} onClick={() => onKind('attack')}>Attacco</button>
            <button type="button" className={draft.kind === 'defend' ? 'on' : ''} aria-pressed={draft.kind === 'defend'} onClick={() => onKind('defend')}>Difesa</button>
          </div>
          <p className={`ap-hint${draft.provinces.length ? ' go' : ''}`}>
            {draft.kind === 'attack' ? 'Tocca sulla mappa le province nemiche da prendere.' : 'Tocca sulla mappa le tue province da tenere.'} {unitCount} unità assegnate.
          </p>
          <ul className="th-chips">
            {draft.provinces.map((p) => (
              <li key={p}><button type="button" onClick={() => onRemove(p)} aria-label={`Togli ${nameOf(p)}`}>{nameOf(p)} ×</button></li>
            ))}
          </ul>
          <footer className="ap-actions">
            <button type="button" onClick={onCancelDraft}>Annulla</button>
            <button type="button" className="go" onClick={onConfirm} disabled={draft.provinces.length === 0 || unitCount === 0}>Conferma incarico</button>
          </footer>
        </section>
      ) : (
        <div className="th-body">
          <h3>Incarichi</h3>
          {cards.length === 0 ? <p className="muted">Nessun incarico. Apri un segnalino, spunta le unità e premi «Incarico».</p> : (
            <ul className="th-list">
              {cards.map((c) => (
                <li key={c.id} className={`th-card ${c.kind}`}>
                  <div className="th-row"><strong>{c.name}</strong><span className={`ap-state ${c.kind === 'attack' ? 'warn' : 'good'}`}>{c.kindLabel}</span></div>
                  <p className="muted">{c.kind === 'attack' ? `${c.taken}/${c.objectives.length} obiettivi presi` : `${c.objectives.length} province da tenere`} · {c.units.length} unità</p>
                  {(alerts ?? []).filter((al) => al.assignmentId === c.id).map((al) => (
                    <p key={al.province} className={`th-alert ${al.level}`} role="alert">
                      {al.level === 'short'
                        ? `⚠ ${al.name}: servono più truppe. Ne servono ${al.need.toLocaleString('it-IT')}, ne hai ${al.have.toLocaleString('it-IT')}${al.arriving ? ` (+${al.arriving.toLocaleString('it-IT')} in arrivo)` : ''}: mancano circa ${al.divisions} ${al.divisions === 1 ? 'divisione' : 'divisioni'}.${c.kind === 'attack' ? ' L’attacco non parte finché non bastano.' : ''}`
                        : `${al.name}: truppe in marcia. Presenti ${al.have.toLocaleString('it-IT')}, in arrivo ${al.arriving.toLocaleString('it-IT')}, richiesti ${al.need.toLocaleString('it-IT')}.`}
                    </p>
                  ))}
                  {c.kind === 'attack' && (alerts ?? []).some((al) => al.assignmentId === c.id) && !c.force ? <button type="button" className="th-force" onClick={() => onForce(c.id, true)}>Attacca comunque</button> : null}
                  {c.kind === 'attack' && c.force ? <button type="button" className="th-force on" onClick={() => onForce(c.id, false)}>Attacco forzato: annulla</button> : null}
                  <ul className="th-obj">
                    {c.objectives.map((o) => <li key={o.id} className={o.done ? 'done' : ''}>{o.done ? '✓' : '•'} {o.name} <span className="muted">({o.controller})</span></li>)}
                  </ul>
                  <ul className="th-units">
                    {c.units.map((u) => <li key={u.id}>{u.name} <span className="muted">{u.at ?? '?'} · {u.effective ?? '?'} uomini</span></li>)}
                  </ul>
                  <button type="button" className="danger" onClick={() => onCancelAssignment(c.id)}>Annulla incarico</button>
                </li>
              ))}
            </ul>
          )}
          <h3>Guerra</h3>
          <p className="muted">Provvisorio: senza diplomazia la guerra si dichiara a mano; l’IA non dichiara guerra né attacca.</p>
          <div className="th-war">
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Nazione">
              <option value="">Scegli la nazione…</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="danger" disabled={!target} onClick={() => { onDeclareWar(target); setTarget(''); }}>Dichiara guerra</button>
          </div>
          <h3>Ultime battaglie</h3>
          {log.length === 0 ? <p className="muted">Nessuna battaglia.</p> : (
            <ul className="th-log">
              {log.map((e, i) => <li key={`${e.day}-${i}`}><strong>{e.date}</strong> {nameOf(e.province)}: {e.outcome}{e.defenders.length ? ` · perdite ${e.attackerLoss} att. / ${e.defenderLoss} dif.` : ''}</li>)}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
