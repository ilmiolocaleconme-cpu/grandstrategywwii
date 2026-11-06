// Scheda unità (fase 2): intestazione fissa con simbolo NATO, navigazione a schede tra le sezioni, contenuto della sezione attiva.
// Stato locale solo di interfaccia (sezione attiva, unità scelta): nessuno stato di gioco. Il reset avviene al cambio di unità.
import { useEffect, useState } from 'react';
import NatoSymbol from './NatoSymbol.jsx';
import UnitSection from './UnitSections.jsx';
import { natoSpec, sheetSections } from '../rules/unitSheet.js';
import { CAT } from './UnitInfo.jsx';

export default function UnitSheet({ infos, canSetPolicy, onPolicy, onReinforce, onClose }) {
  const [i, setI] = useState(0);
  const [section, setSection] = useState('panoramica');
  const info = infos[Math.min(i, infos.length - 1)];
  useEffect(() => { setSection('panoramica'); }, [info?.id]);
  if (!info) return null;
  const sections = sheetSections(info);
  const spec = natoSpec(info, info.affiliation);
  const commanderLine = info.commander.status === 'assegnato' ? `${info.commander.name} (${info.commander.rank})` : info.commander.status === 'vacante' ? 'comandante vacante' : 'comandante non gestito';
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
        <UnitSection id={section} info={info} canSetPolicy={canSetPolicy && info.nation !== undefined} onPolicy={onPolicy} onReinforce={info.nation === undefined ? undefined : onReinforce} />
      </div>
    </aside>
  );
}
