// Pannelli Ricerca e Sicurezza della partita. Le regole sono in game/research.js e game/security.js: qui solo selezione e messaggi.
import { useMemo, useState } from 'react';
import { layoutTree, related } from './techTreeLayout.js';
import { researchStatusLabel } from './securityView.js';

const fmt = (v) => Math.round(v * 10) / 10;
const pct = (v) => `${Math.round(v * 100)}%`;
const Msg = ({ msg }) => (msg ? <p className={msg.ok ? 'muted' : 'warn'} role="status">{msg.text}</p> : null);

/**
 * Albero tecnologico (14/11/2026, richiesta dell'utente: colonne con i collegamenti fra le tecnologie, una fascia per ramo con l'avanzamento).
 * rows: research.listFor(...); branches: [{ id, name_it }]; active: ricerca in corso { techId, daysLeft, totalDays } o null.
 * onStart(techId) → { ok, text }. unlocksFor(techId) (facoltativo) → nomi dei modelli sbloccati; rifles → fucili producibili oggi;
 * rifleInfo → { quality, bonus }; techBonusOf(techId) → bonus in battaglia della fanteria.
 */
export function ResearchPanel({ rows, onStart, branches = [], active = null, unlocksFor = null, rifles = null, rifleInfo = null, techBonusOf = null }) {
  const [msg, setMsg] = useState(null);
  const [sel, setSel] = useState(null);
  const techs = useMemo(() => (rows ?? []).map((r) => r.tech), [rows]);
  const done = useMemo(() => new Set((rows ?? []).filter((r) => r.status === 'done').map((r) => r.tech.id)), [rows]);
  const tree = useMemo(() => layoutTree(branches, techs, done), [branches, techs, done]);
  if (!rows || rows.length === 0) return null;
  const byId = new Map(rows.map((r) => [r.tech.id, r]));
  const rel = sel ? related(techs, sel) : null;
  const picked = sel ? byId.get(sel) : null;
  const progress = (id) => (active?.techId === id && active.totalDays > 0 ? 1 - active.daysLeft / active.totalDays : null);
  const line = ({ tech, cost, status }) => {
    if (status === 'done') return 'Acquisita';
    if (status === 'active') return `In corso · ${active?.daysLeft ?? '?'} gg`;
    if (status === 'locked') return `Bloccata · ${fmt(cost.ecv)} ECV`;
    return `Ricerca · ${fmt(cost.ecv)} ECV · ${cost.days} gg`;
  };
  const tags = (id) => {
    const out = [];
    const b = techBonusOf ? techBonusOf(id) : 0;
    if (b > 0) out.push(`+${pct(b)}`);
    const m = unlocksFor ? unlocksFor(id).length : 0;
    if (m > 0) out.push(`${m} ${m === 1 ? 'modello' : 'modelli'}`);
    return out;
  };
  return (
    <section aria-label="Ricerca">
      <h2>Ricerca</h2>
      <Msg msg={msg} />
      {rifleInfo ? <p className="muted small">Qualità media dei fucili: {fmt(rifleInfo.quality)} · bonus della fanteria in battaglia (qualità + tecnologie): +{pct(rifleInfo.bonus)}</p> : null}
      {rifles ? <p className="muted small">Fucili producibili oggi: {rifles.length ? rifles.join(', ') : 'nessun modello nel catalogo'}</p> : null}
      <div className="tech-tree" role="group" aria-label="Albero tecnologico">
        <div className="tech-canvas" style={{ width: tree.width, height: tree.height }}>
          {tree.lanes.map((l) => (
            <div key={l.id} className="tech-lane" style={{ top: l.y, height: l.height, width: tree.width }}>
              <div className="tech-lane-head">
                <span className="tech-lane-name">{l.name}</span>
                <span className="tech-lane-progress" aria-label={`Avanzamento ${l.done} su ${l.total}`}>
                  <span className="tech-lane-bar"><span style={{ width: `${(l.done / l.total) * 100}%` }} /></span> {l.done}/{l.total}
                </span>
              </div>
            </div>
          ))}
          <svg className="tech-links" width={tree.width} height={tree.height} aria-hidden="true">
            <defs><marker id="tech-arrow" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0,0 L6,4 L0,8 z" /></marker></defs>
            {tree.edges.map((e) => {
              const hot = sel && (e.to === sel || e.from === sel || (rel.up.has(e.from) && (rel.up.has(e.to) || e.to === sel)) || (rel.down.has(e.to) && (rel.down.has(e.from) || e.from === sel)));
              return <path key={`${e.from}>${e.to}`} d={e.path} className={`${hot ? 'hot' : ''} ${done.has(e.from) ? 'done' : ''}`} markerEnd="url(#tech-arrow)" />;
            })}
          </svg>
          {rows.map((r) => {
            const n = tree.nodes.get(r.tech.id);
            if (!n) return null;
            const p = progress(r.tech.id);
            const mark = sel === r.tech.id ? 'sel' : rel && (rel.up.has(r.tech.id) || rel.down.has(r.tech.id)) ? 'rel' : '';
            return (
              <button key={r.tech.id} type="button" className={`tech-node st-${r.status} ${mark}`} style={{ left: n.x, top: n.y }}
                aria-pressed={sel === r.tech.id} onClick={() => setSel(sel === r.tech.id ? null : r.tech.id)}>
                <span className="tech-icon" aria-hidden="true">{BRANCH_ICON[r.tech.branch] ?? '◆'}</span>
                <span className="tech-text">
                  <span className="tech-name">{r.tech.name_it}</span>
                  <span className="tech-line">{line(r)}</span>
                </span>
                {tags(r.tech.id).length ? <span className="tech-tags">{tags(r.tech.id).map((t) => <span key={t}>{t}</span>)}</span> : null}
                {p !== null ? <span className="tech-progress"><span style={{ width: `${Math.round(p * 100)}%` }} /></span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {picked ? (
        <div className="tech-detail">
          <strong>{picked.tech.name_it}</strong> · {researchStatusLabel(picked.status)}
          <div className="muted small">{picked.tech.description}</div>
          {techBonusOf && techBonusOf(picked.tech.id) > 0 ? <div className="muted small">Bonus in battaglia della fanteria: +{pct(techBonusOf(picked.tech.id))}</div> : null}
          {unlocksFor && unlocksFor(picked.tech.id).length ? <div className="muted small">Sblocca: {unlocksFor(picked.tech.id).join(', ')}</div> : null}
          <div className="muted small">{fmt(picked.cost.ecv)} ECV · {picked.cost.days} giorni{picked.missing.length ? ` · prima: ${picked.missing.map((m) => byId.get(m)?.tech.name_it ?? m).join(', ')}` : ''}</div>
          <button type="button" className="nation-btn" disabled={picked.status !== 'available'} onClick={() => setMsg(onStart(picked.tech.id))}>Ricerca</button>
        </div>
      ) : <p className="muted small">Tocca una tecnologia per vedere dettagli, collegamenti e avviare la ricerca.</p>}
    </section>
  );
}

const BRANCH_ICON = { industry: '⚙', security: '◉', logistics: '⚓', infantry: '✛', ammunition: '◆' };

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
