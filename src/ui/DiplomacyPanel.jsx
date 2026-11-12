// Pannello Diplomazia della partita. Regole in rules/diplomacy.js e game/diplomacyState.js: qui solo scelta e messaggi.
import { useState } from 'react';

const Msg = ({ msg }) => (msg ? <p className={msg.ok ? 'muted' : 'warn'} role="status">{msg.text}</p> : null);
const sign = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

function flags(p) {
  const out = [];
  if (p.war) out.push('IN GUERRA');
  if (p.allied) out.push('alleati');
  else { if (p.agreedAccess) out.push('hai accesso'); if (p.grantedAccess) out.push('lui ha accesso'); }
  out.push(p.canTrade ? 'commercio possibile' : 'commercio bloccato');
  return out.join(' · ');
}

/**
 * partners: [{ id, name }]; rows: notableRows(...); detail(id) → pairView; cfg: parametri; actions: { improve, alliance, breakAlliance, access, revoke, war, peace }(id) → { ok, text }.
 */
const RES_LABEL = { coal: 'carbone', iron_ore: 'ferro', oil: 'petrolio', wheat: 'frumento', bauxite: 'bauxite', copper: 'rame', tin: 'stagno', rubber: 'gomma', sulfur: 'zolfo', chromium: 'cromo', tungsten: 'tungsteno', nickel: 'nichel', manganese: 'manganese' };
const yieldText = (y) => Object.entries(y).map(([r, t]) => `${RES_LABEL[r] ?? r} ${Math.round(t * 10) / 10} t/g`).join(' · ') || 'niente da prendere';

/** Quota di risorse presa a un fantoccio (12/11/2026): solo per chi lo controlla. */
function LevyBox({ info, onSet, onMsg }) {
  return (
    <div className="levy">
      <p><strong>Fantoccio sotto il tuo controllo.</strong> Risorse che prendi ogni giorno: {Math.round(info.share * 100)}% ({yieldText(info.perDay(info.share))}).</p>
      <div className="levy-steps" role="group" aria-label="Quota di risorse presa">
        {info.steps.map((s) => (
          <button key={s} type="button" className={`nation-btn${s === info.share ? ' on' : ''}`} aria-pressed={s === info.share} onClick={() => onMsg(onSet(s))}>{Math.round(s * 100)}%</button>
        ))}
      </div>
      <p className="muted">Più prendi, più il rapporto scende ({info.relationPerDay < 0 ? `${Math.round(info.relationPerDay * 365)} in un anno con la quota attuale` : 'nessun calo con 0%'}). Valori di progetto, da bilanciare.</p>
    </div>
  );
}

export function DiplomacyPanel({ partners, rows, detail, cfg, actions, proposals = [], onAccept = () => null, onReject = () => null, levy = () => null, onLevy = () => null }) {
  const [msg, setMsg] = useState(null);
  const [target, setTarget] = useState('');
  const p = target ? detail(target) : null;
  const run = (fn) => () => setMsg(fn(target));
  return (
    <section aria-label="Diplomazia">
      <h2>Diplomazia</h2>
      <Msg msg={msg} />
      {proposals.length ? (
        <div>
          <h3>Proposte ricevute ({proposals.length})</h3>
          <ul className="build-list">
            {proposals.map((x) => (
              <li key={x.id} className="build-row">
                <div><strong>{x.fromName}</strong> propone un'alleanza{x.enemyName ? ` (nemico comune: ${x.enemyName})` : ''}
                  <div className="muted small">Scade dopo {cfg.proposals.expireDays} giorni senza risposta · rifiutare costa {cfg.proposals.rejectPenalty} di rapporto</div>
                  <button type="button" className="nation-btn" onClick={() => setMsg(onAccept(x.id))}>Accetta</button>{' '}
                  <button type="button" className="nation-btn" onClick={() => setMsg(onReject(x.id))}>Rifiuta</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="small">Nazione{' '}
        <select value={target} onChange={(e) => { setTarget(e.target.value); setMsg(null); }}><option value="">— scegli —</option>{partners.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
      </label>
      {p ? (
        <div className="small">
          <p><strong>{p.name}</strong>: rapporto {sign(p.relation)} ({p.label}) · {flags(p)}</p>
          {levy(target) ? <LevyBox info={levy(target)} onSet={(s) => onLevy(target, s)} onMsg={setMsg} /> : null}
          <div className="trade-form">
            <button type="button" className="nation-btn" disabled={p.war} onClick={run(actions.improve)}>Migliora i rapporti ({cfg.improve.ecv} ECV, +{cfg.improve.gain})</button>{' '}
            {p.allied
              ? <button type="button" className="nation-btn" onClick={run(actions.breakAlliance)}>Rompi l'alleanza ({cfg.alliance.breakPenalty})</button>
              : <button type="button" className="nation-btn" disabled={p.war} onClick={run(actions.alliance)}>Proponi alleanza ({cfg.alliance.ecv} ECV)</button>}{' '}
            {!p.allied ? <button type="button" className="nation-btn" disabled={p.war || p.agreedAccess} onClick={run(actions.access)}>Chiedi accesso ai territori ({cfg.access.ecv} ECV)</button> : null}{' '}
            {p.grantedAccess ? <button type="button" className="nation-btn" onClick={run(actions.revoke)}>Ritira il suo accesso</button> : null}{' '}
            {p.war
              ? <button type="button" className="nation-btn" onClick={run(actions.peace)}>Proponi la pace</button>
              : <button type="button" className="nation-btn" onClick={run(actions.war)}>Dichiara guerra ({cfg.war.victimPenalty} con lei, {cfg.war.victimAlliesPenalty} con i suoi alleati)</button>}
          </div>
          <p className="muted">Alleanza: serve rapporto di almeno {cfg.alliance.minRelation} e un nemico comune. Commercio: rifiutato sotto {cfg.trade.minRelation} o in guerra. Sotto {cfg.sabotage.maxRelation} le IA possono sabotarti. Valori di progetto, da bilanciare.</p>
        </div>
      ) : <p className="muted small">Scegli una nazione per vedere il rapporto e le azioni.</p>}
      <h3>Relazioni che contano ({rows.length})</h3>
      {rows.length === 0 ? <p className="muted small">Nessuna relazione rilevante.</p> : (
        <ul className="build-list">
          {rows.map((r) => (
            <li key={r.id} className="build-row"><div><strong>{r.name}</strong> · {sign(r.relation)} ({r.label})<div className="muted small">{flags(r)}</div></div></li>
          ))}
        </ul>
      )}
    </section>
  );
}
