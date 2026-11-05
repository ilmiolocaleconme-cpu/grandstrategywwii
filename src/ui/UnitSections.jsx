// Contenuto delle sezioni della scheda unità (fase 2). Solo dati già prodotti dal motore: nessun valore inventato.
import { ECH, CAT } from './UnitInfo.jsx';
import { sheetSections } from '../rules/unitSheet.js';

const NA = <span className="muted">dato non disponibile</span>;
const POLICY = { conservative: 'conservativa', normal: 'normale', aggressive: 'aggressiva' };
const pct = (r) => (r === null || r === undefined ? null : `${Math.round(r * 100)}%`);

function Row({ label, children }) {
  return <div className="us-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function Panoramica({ info }) {
  const k = info.condition;
  const s = info.strength;
  return (
    <dl className="us-list">
      <Row label="Organico">{s?.manpower ? `${s.manpower.effective} / ${s.manpower.planned} (${pct(s.manpower.ratio)})` : NA}</Row>
      <Row label="Morale">{k ? `${Math.round(k.morale)} · ${k.moraleBand}` : NA}</Row>
      <Row label="Prontezza">{k ? `${Math.round(k.readiness)} · ${k.readinessBand}` : NA}</Row>
      <Row label="Esperienza">{k ? `${Math.round(k.experience)} · ${k.experienceLevel.name}` : NA}</Row>
      <Row label="Forza materiale">{k ? (k.material.value === null ? NA : `${k.material.value}${k.material.cause ? ` — limitata da: ${k.material.cause}` : ''}`) : NA}</Row>
      <Row label="Stato operativo">{k ? `${k.operational.name}${k.operational.cause ? ` — causa: ${k.operational.cause}` : ''}` : NA}</Row>
      <p className="small muted">Non ancora modellato: {info.notModeled.map((n) => n.id).join(', ')}.</p>
    </dl>
  );
}

function Organico({ info }) {
  const s = info.strength;
  if (!s?.manpower) return NA;
  return (
    <dl className="us-list">
      <Row label="Effettivi">{s.manpower.effective}</Row>
      <Row label="Previsti dal template">{s.manpower.planned}</Row>
      <Row label="Completamento">{pct(s.manpower.ratio)}</Row>
      <Row label="Stato">{s.cadre ? 'quadro, non pronto al combattimento' : 'pronto a ricevere personale'}{s.reinforce ? '' : ' · rinforzi sospesi'}</Row>
      <p className="small muted">Feriti, dispersi, prigionieri e caduti non sono ancora modellati.</p>
    </dl>
  );
}

function Composizione({ info }) {
  const c = info.composition;
  if (!c) return NA;
  return (
    <div>
      <ul className="ui-comp">{c.rows.map((r) => <li key={r.key}>{r.label}: <b>{String(r.value)}</b>{r.basis ? <small> ({r.basis})</small> : null}</li>)}</ul>
      {c.support.length ? <p className="small muted">Supporti organici: {c.support.join(' · ')}</p> : null}
      {c.status ? <p className="small muted">Template {c.templateId}: {c.status.toLowerCase().replace(/_/g, ' ')}</p> : null}
    </div>
  );
}

function Equipaggiamento({ info }) {
  if (!info.equipment.length) return NA;
  return (
    <ul className="ui-eq">
      {info.equipment.map((e) => <li key={e.item}><span>{e.item}</span><b>{e.effective} / {e.planned}</b><small>{pct(e.ratio)}</small></li>)}
    </ul>
  );
}

function Comando({ info }) {
  const c = info.commander;
  return (
    <dl className="us-list">
      <Row label="Comandante">{c.status === 'assegnato' ? `${c.name} (${c.rank})` : c.status === 'vacante' ? 'vacante' : `non gestito: ${c.reason}`}</Row>
      <Row label="Livello">{ECH[info.echelon] ?? info.echelon}{info.commandLevel ? ` · ${info.commandLevel}` : ''}</Row>
      <Row label="Inquadrata in">{info.chain.length ? info.chain.map((x) => x.name).join(' › ') : 'nessun comando superiore'}</Row>
      <Row label="Forze assegnate">{info.children.length ? info.children.map((x) => x.name).join(', ') : 'nessuna'}</Row>
    </dl>
  );
}

function Operazioni({ info, canSetPolicy, onPolicy, onReinforce }) {
  const m = info.movement;
  const k = info.condition;
  return (
    <dl className="us-list">
      <Row label="Posizione">{m.provinceName ?? 'sconosciuta'}</Row>
      <Row label="Ordine">{m.order ? `verso ${m.order.toName}: prossima tappa ${m.order.nextName}, ${m.order.daysLeft} g. alla tappa, ${m.order.totalDays} g. in tutto` : 'nessuno (ferma)'}</Row>
      {info.strength && onReinforce ? (
        <Row label="Rinforzi">
          <button type="button" aria-pressed={info.strength.reinforce} className={info.strength.reinforce ? 'on' : ''} onClick={() => onReinforce(info.id, !info.strength.reinforce)}>
            {info.strength.reinforce ? 'Automatici: attivi' : 'Interrotti'}
          </button>
        </Row>
      ) : null}
      {k ? (
        <Row label="Politica d’impiego">
          {canSetPolicy ? ['conservative', 'normal', 'aggressive'].map((p) => (
            <button key={p} type="button" aria-pressed={k.policy === p} className={k.policy === p ? 'on' : ''} onClick={() => onPolicy(info.id, p)}>{POLICY[p]}</button>
          )) : POLICY[k.policy]}
          <small className="muted"> (solo memorizzata: nessun effetto finché non esiste il combattimento)</small>
        </Row>
      ) : null}
    </dl>
  );
}

function Condizione({ info }) {
  const k = info.condition;
  if (!k) return NA;
  return (
    <dl className="us-list">
      <Row label="Esperienza">{Math.round(k.experience)} · livello {k.experienceLevel.level} {k.experienceLevel.name}{k.isNew ? ' (unità nuova)' : ''}</Row>
      <Row label="Morale">{Math.round(k.morale)} · {k.moraleBand}</Row>
      <Row label="Prontezza">{Math.round(k.readiness)} · {k.readinessBand}</Row>
      <Row label="Forza materiale">{k.material.value === null ? 'dato assente' : `${k.material.value}${k.material.cause ? ` — limitata da: ${k.material.cause}` : ''}`}</Row>
      <Row label="Stato operativo">{k.operational.name}{k.operational.cause ? ` — causa: ${k.operational.cause}` : ''}</Row>
    </dl>
  );
}

const BODY = { panoramica: Panoramica, organico: Organico, composizione: Composizione, equipaggiamento: Equipaggiamento, comando: Comando, operazioni: Operazioni, condizione: Condizione };

/** Corpo di una sezione: quella non modellata mostra «dato non disponibile» con la sua ragione, mai un valore. */
export default function UnitSection({ id, info, canSetPolicy, onPolicy, onReinforce }) {
  const meta = sheetSections(info).find((s) => s.id === id);
  if (!meta) return null;
  const Body = BODY[id];
  if (!meta.available || !Body) {
    return <p className="muted">{NA}. {id === 'logistica' ? 'Rifornimenti e carburante non sono ancora modellati per le unità.' : id === 'sanita' ? 'Feriti, recuperi e sanità non sono ancora modellati.' : 'La storia dell’unità non è ancora registrata nel gioco.'}</p>;
  }
  return <Body info={info} canSetPolicy={canSetPolicy} onPolicy={onPolicy} onReinforce={onReinforce} />;
}
