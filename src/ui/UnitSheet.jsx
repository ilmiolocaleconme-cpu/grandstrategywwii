// Scheda unità (fase 2): intestazione fissa con simbolo NATO, navigazione a schede tra le sezioni, contenuto della sezione attiva.
// Stato locale solo di interfaccia (sezione attiva, unità scelta): nessuno stato di gioco. Il reset avviene al cambio di unità.
import { useEffect, useState } from 'react';
import NatoSymbol from './NatoSymbol.jsx';
import UnitSection from './UnitSections.jsx';
import { natoSpec, sheetSections } from '../rules/unitSheet.js';
import { CAT } from './UnitInfo.jsx';
import { nearestFirst, distanceLabel } from '../rules/commandLinks.js';

export default function UnitSheet({ infos, canSetPolicy, onPolicy, onReinforce, onClose, onMoveHq, onFormCommand, onAttachTo, onDetach, parentOptions, childOptions, onAttachChild }) {
  const [i, setI] = useState(0);
  const [section, setSection] = useState('panoramica');
  const [attachOpen, setAttachOpen] = useState(false);
  const info = infos[Math.min(i, infos.length - 1)];
  useEffect(() => { setSection('panoramica'); setAttachOpen(false); }, [info?.id]);
  if (!info) return null;
  const sections = sheetSections(info);
  const spec = natoSpec(info, info.affiliation);
  const commanderLine = info.commander.status === 'assegnato' ? `${info.commander.name} (${info.commander.rank})` : info.commander.status === 'vacante' ? 'comandante vacante' : 'comandante non gestito';
  const canAttach = Boolean(onAttachTo && parentOptions);
  const hasParent = info.chain.length > 0;
  const canReinforce = Boolean(onReinforce && info.strength && !info.strength.cadre);
  const parents = attachOpen && canAttach ? nearestFirst(parentOptions(info.id)) : [];
  return (
    <aside className="panel army-panel unit-sheet" aria-label="Scheda unità">
      <header className="ap-head us-header">
        <NatoSymbol spec={spec} size={56} />
        <div className="ap-title">
          <h2>{info.name}</h2>
          <p className="muted small">{info.nation} · {CAT[info.category] ?? info.category} · {info.affiliation}</p>
          <p className="small">{commanderLine} · {info.movement.provinceName ?? (info.movement.estimate ? `${info.movement.estimate.provinceName} (stimata)` : 'posizione non nota')}</p>
        </div>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      {canAttach || canReinforce ? (
        <nav className="us-acts" aria-label="Azioni sull’unità">
          {canAttach ? <button type="button" aria-expanded={attachOpen} onClick={() => setAttachOpen((v) => !v)}><span className="us-act-ico" aria-hidden="true">＋</span><span>Inquadra</span></button> : null}
          {canAttach && onDetach && hasParent ? <button type="button" onClick={() => onDetach(info.id)}><span className="us-act-ico" aria-hidden="true">⛓</span><span>Scollega</span></button> : null}
          {canReinforce ? (
            <button type="button" className={info.strength.reinforce ? 'on' : ''} aria-pressed={info.strength.reinforce} onClick={() => onReinforce(info.id, !info.strength.reinforce)}>
              <span className="us-act-ico" aria-hidden="true">{info.strength.reinforce ? '⏸' : '▶'}</span><span>{info.strength.reinforce ? 'Sospendi rinforzi' : 'Riprendi rinforzi'}</span>
            </button>
          ) : null}
        </nav>
      ) : null}
      {attachOpen ? (
        <section className="us-attach" aria-label="Inquadra in…">
          <header><strong>Inquadra «{info.name}» in…</strong><button type="button" className="close" aria-label="Chiudi elenco" onClick={() => setAttachOpen(false)}>×</button></header>
          {parents.length === 0 ? <p className="muted small">Nessun comando valido: serve un livello più alto, della stessa nazione.</p> : (
            <div className="us-parents">
              {parents.map((p) => { const d = distanceLabel(p.km); return (
                <button key={p.id} type="button" className={`us-parent${p.nearest ? ' near' : ''}`} onClick={() => { if (onAttachTo(info.id, p.id) !== false) setAttachOpen(false); }}>
                  <b>{p.name}</b><small className={d.far ? 'us-far' : 'muted'}>{p.levelLabel} · {d.text}{p.nearest ? ' · il più vicino' : ''}</small>
                </button>
              ); })}
            </div>
          )}
        </section>
      ) : null}
      {infos.length > 1 ? (
        <div className="th-seg us-tabs" role="tablist" aria-label="Unità">
          {infos.map((x, k) => <button key={x.id} type="button" role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => setI(k)}>{x.name}</button>)}
        </div>
      ) : null}
      <nav className="th-seg us-sections" role="tablist" aria-label="Sezioni della scheda">
        {sections.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id} className={`${section === s.id ? 'on' : ''}${s.available ? '' : ' na'}`} onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </nav>
      <div className="us-body" role="tabpanel">
        <UnitSection id={section} info={info} canSetPolicy={canSetPolicy && info.nation !== undefined} onPolicy={onPolicy} onReinforce={info.nation === undefined ? undefined : onReinforce} onMoveHq={onMoveHq} onFormCommand={onFormCommand} onAttachTo={onAttachTo} onDetach={onDetach} parentOptions={parentOptions} childOptions={childOptions} onAttachChild={onAttachChild} />
      </div>
    </aside>
  );
}
