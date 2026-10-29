// Pannelli Ricerca e Sicurezza della partita. Le regole sono in game/research.js e game/security.js: qui solo selezione e messaggi.
import { useState } from 'react';
import { researchStatusLabel } from './securityView.js';

const fmt = (v) => Math.round(v * 10) / 10;
const pct = (v) => `${Math.round(v * 100)}%`;
const Msg = ({ msg }) => (msg ? <p className={msg.ok ? 'muted' : 'warn'} role="status">{msg.text}</p> : null);

/** rows: research.listFor(...). onStart(techId) → { ok, text }. */
export function ResearchPanel({ rows, onStart }) {
  const [msg, setMsg] = useState(null);
  if (!rows || rows.length === 0) return null;
  return (
    <section aria-label="Ricerca">
      <h2>Ricerca</h2>
      <Msg msg={msg} />
      <ul className="build-list">
        {rows.map(({ tech, cost, status, missing }) => (
          <li key={tech.id} className="build-row">
            <div>
              <strong>{tech.name_it}</strong> · {researchStatusLabel(status)}
              <div className="muted small">{tech.description}</div>
              <div className="muted small">{fmt(cost.ecv)} ECV · {cost.days} giorni{missing.length ? ` · prima: ${missing.join(', ')}` : ''}</div>
            </div>
            <button type="button" className="nation-btn" disabled={status !== 'available'} onClick={() => setMsg(onStart(tech.id))}>Ricerca</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * summary: securitySummary(...). Azioni (ognuna ritorna { ok, text }): onTrain(role), onPolice(place), onDeploy(targetId), onSabotage(targetId, facilityId).
 * rowsFor(targetId): sabotageRows(...) del bersaglio scelto.
 */
export function SecurityPanel({ summary, onTrain, onPolice, onDeploy, onSabotage, rowsFor }) {
  const [msg, setMsg] = useState(null);
  const [target, setTarget] = useState('');
  if (!summary) return null;
  const { canAgents, agents, costs } = summary;
  const rows = target ? rowsFor(target) : [];
  const act = (fn) => setMsg(fn());
  return (
    <section aria-label="Sicurezza">
      <h2>Sicurezza e sabotaggio</h2>
      <Msg msg={msg} />
      {!canAgents ? <p className="muted small">Per addestrare spie e sabotatori serve la tecnologia «{summary.agentsTech}» (pannello Ricerca). La polizia militare è disponibile subito.</p> : (
        <>
          <p className="small">In riserva: {agents.spy} {agents.spy === 1 ? 'spia' : 'spie'} · {agents.saboteur} {agents.saboteur === 1 ? 'sabotatore' : 'sabotatori'}</p>
          <button type="button" className="nation-btn" onClick={() => act(() => onTrain('spy'))}>Addestra spia ({fmt(costs.spy.ecv)} ECV, {costs.spy.days} gg)</button>{' '}
          <button type="button" className="nation-btn" onClick={() => act(() => onTrain('saboteur'))}>Addestra sabotatore ({fmt(costs.saboteur.ecv)} ECV, {costs.saboteur.days} gg)</button>
          <h3>Operazioni contro un'altra nazione</h3>
          <label className="small">Nazione bersaglio{' '}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— scegli —</option>
              {summary.targetNations.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>{' '}
          {target ? <button type="button" className="nation-btn" disabled={agents.spy < 1} onClick={() => act(() => onDeploy(target))}>Schiera una spia</button> : null}
          {summary.deployed.length ? <p className="small">Spie schierate: {summary.deployed.map((d) => `${d.name} ${d.count}`).join(' · ')}</p> : <p className="muted small">Nessuna spia schierata. Senza una spia non si vedono gli impianti del bersaglio.</p>}
          {target && rows.length === 0 ? <p className="muted small">Nessuna informazione su questa nazione: schiera prima una spia.</p> : null}
          {rows.length ? (
            <ul className="build-list">
              {rows.map((r) => (
                <li key={r.facilityId} className="build-row">
                  <div>
                    <strong>{r.name}</strong> · {r.placeName}
                    <div className="muted small">Difesa {fmt(r.defense)} · riuscita {pct(r.chance)} · rischio di cattura {pct(r.detect)}{r.damage > 0 ? ` · danno attuale ${pct(r.damage)}` : ''}</div>
                  </div>
                  <button type="button" className="nation-btn" disabled={agents.saboteur < 1} onClick={() => act(() => onSabotage(target, r.facilityId))}>Sabota ({fmt(costs.sabotage.ecv)} ECV)</button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <h3>Difesa: polizia militare, guarnigione, polizia locale</h3>
      <p className="muted small">La difesa di un luogo = polizia locale + guarnigione (dato mancante: 0) + reparti di polizia militare{summary.counterIntel ? ' (con il controspionaggio valgono di più)' : ''}.</p>
      <ul className="build-list">
        {summary.police.slice(0, 12).map((p) => (
          <li key={p.place} className="build-row">
            <div><strong>{p.name}</strong> · {p.facilities} impianti<div className="muted small">Difesa {fmt(p.defense)} · reparti {p.mp}{p.queued ? ` (+${p.queued} in addestramento)` : ''} su {p.max}</div></div>
            <button type="button" className="nation-btn" disabled={p.mp + p.queued >= p.max} onClick={() => act(() => onPolice(p.place))}>+ reparto ({fmt(costs.police.ecv)} ECV)</button>
          </li>
        ))}
      </ul>
      {summary.queue.length ? <><h3>In corso</h3><ul>{summary.queue.map((q) => <li key={q.id}>{q.label} · mancano {q.daysLeft} giorni su {q.totalDays}</li>)}</ul></> : null}
      {summary.incidents.length ? <><h3>Incidenti subiti</h3><ul className="small">{summary.incidents.map((t, i) => <li key={i}>{t}</li>)}</ul></> : null}
      {summary.log.length ? <><h3>Registro</h3><ul className="small">{summary.log.map((t, i) => <li key={i}>{t}</li>)}</ul></> : null}
    </section>
  );
}
