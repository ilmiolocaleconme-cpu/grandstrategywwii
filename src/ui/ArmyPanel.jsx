// Pannello Esercito: unità del segnalino toccato, scheda info dell'unità scelta e ordine di marcia (si dà toccando una provincia).
import { useMemo, useState } from 'react';
import Flag from './Flag.jsx';
import { unitInfo } from '../rules/unitInfo.js';

import { Info, ECH, CAT } from './UnitInfo.jsx';

const ECH_MARK = { division: 'XX', brigade: 'X', command: '' };
const LVL_MARK = { corps: 'XXX', army: 'XXXX', army_group: 'XXXXX', theater: 'XXXXXX', high_command: '★', district: '▫' };

/** Segnalino di categoria (stile carta militare): riquadro con il simbolo dell'arma. Decorativo: il nome dell'unità sta accanto. */
function Badge({ unit }) {
  const sym = {
    infantry: <path d="M6 7 L30 21 M30 7 L6 21" />, armored: <ellipse cx="18" cy="14" rx="9" ry="5" />,
    mechanized: <><path d="M6 7 L30 21 M30 7 L6 21" /><ellipse cx="18" cy="14" rx="7" ry="3.5" /></>, motorized: <><path d="M6 7 L30 21 M30 7 L6 21" /><circle cx="18" cy="14" r="2" /></>,
    cavalry: <path d="M8 22 L28 6" />, mountain: <path d="M8 22 L18 6 L28 22 Z" />, airborne: <path d="M8 18 Q18 2 28 18 Z" />,
  }[unit.category];
  const mark = unit.category === 'command' ? (LVL_MARK[unit.commandLevel] ?? '') : ECH_MARK[unit.echelon] ?? '';
  return (
    <span className="ap-badge" aria-hidden="true">
      <svg viewBox="0 0 36 28" width="36" height="28"><rect x="1.5" y="1.5" width="33" height="25" rx="2" className="ap-badge-box" />
        <g className="ap-badge-sym">{unit.category === 'command' ? <text x="18" y="19" textAnchor="middle" className="ap-badge-hq">HQ</text> : sym}</g></svg>
      <i>{mark}</i>
    </span>
  );
}

/** Frase di stato corta per la scheda: ordine di marcia, stato operativo o quadro. */
function stateOf(info) {
  const o = info.movement.order;
  if (o) return { text: `In marcia → ${o.toName} · ${o.daysLeft} g`, tone: 'move' };
  if (info.strength?.cadre) return { text: 'Quadro', tone: 'warn' };
  if (info.condition) return { text: info.condition.operational.name, tone: info.condition.operational.name === 'Pronta' ? 'good' : 'ok' };
  return { text: 'Ferma', tone: 'idle' };
}

export default function ArmyPanel({ templates, moveMode, group, game, unitsById, officersById, initial, provinceName, conditionConfig, onPolicy, canMove, selected, onToggle, onSelectAll, onClear, onClose, onCancel, onAssign, onCommand, entrenchOf, onEntrench, subordinates, notice, flag, nationName }) {
  const [openId, setOpenId] = useState(null);
  const infos = useMemo(
    () => new Map(group.units.map((u) => [u.id, unitInfo(game, unitsById.get(u.id), { unitsById, officersById, initial, provinceName, conditionConfig, templates })])),
    [group, game, unitsById, officersById, initial, provinceName, conditionConfig, templates],
  );
  const n = selected.size;
  const moving = group.units.filter((u) => infos.get(u.id)?.movement.order).length;
  return (
    <aside className="panel army-panel" aria-label="Unità">
      <header className="ap-head">
        <Flag flag={flag} className="ap-flag" />
        <div className="ap-title">
          <h2>{provinceName(group.province)}</h2>
          <p>{nationName ?? group.nation} · {group.units.length} {group.units.length === 1 ? 'unità' : 'unità'}{moving ? ` · ${moving} in marcia` : ''}</p>
        </div>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      <p className={`ap-hint${canMove && moveMode ? ' go' : ''}`}>
        {!canMove ? 'Unità di un’altra nazione: puoi vederle, non dare ordini.'
          : moveMode ? `${n} ${n === 1 ? 'unità scelta' : 'unità scelte'}: tocca sulla mappa la destinazione: territorio tuo = marcia, nemico (in guerra) = attacco.`
            : n === 0 ? 'Usa il menu sul segnalino per tutte le unità, oppure spunta quelle che vuoi.'
              : `${n} ${n === 1 ? 'unità scelta' : 'unità scelte'}: usa il menu sul segnalino.`}
      </p>
      {notice && <p className="ap-notice" role="status">{notice}</p>}
      <ul className="ap-list">
        {group.units.map((u) => {
          const unit = unitsById.get(u.id);
          const info = infos.get(u.id);
          const st = stateOf(info);
          const ratio = info.strength?.manpower?.ratio ?? null;
          const isSel = selected.has(u.id);
          return (
            <li key={u.id} className={`ap-item${isSel ? ' sel' : ''}`}>
              <div className="ap-row">
                <button type="button" className="ap-card" aria-pressed={canMove ? isSel : undefined} disabled={!canMove} onClick={() => onToggle(u.id)} aria-label={`${canMove ? 'Seleziona ' : ''}${u.name}`}>
                  <Badge unit={unit} />
                  <span className="ap-main">
                    <b>{u.name}</b>
                    <small>{ECH[unit.echelon] ?? unit.echelon} · {CAT[unit.category] ?? unit.category}</small>
                    {ratio !== null && <span className="ap-bar" title={`Uomini ${Math.round(ratio * 100)}%`}><i style={{ width: `${Math.max(2, Math.min(100, Math.round(ratio * 100)))}%` }} /></span>}
                  </span>
                  <span className={`ap-state ${st.tone}`}>{st.text}</span>
                  {(() => {
                    const en = entrenchOf?.(u.id);
                    if (!en || !en.digging) return null;
                    const max = en.bonus >= 0.4999;
                    return <span className={`ap-dig${max ? ' max' : ''}`} title="Bonus difensivo: cresce ogni giorno fermo e senza battaglia">⛏ +{Math.round(en.bonus * 100)}%{max ? ' max' : ` · giorno ${en.days}`}</span>;
                  })()}
                </button>
                <button type="button" className="ap-i" aria-label={`Scheda di ${u.name}`} aria-expanded={openId === u.id} onClick={() => setOpenId(u.id === openId ? null : u.id)}>i</button>
              </div>
              {unit.category === 'command' && subordinates ? (() => {
                const subs = subordinates(u.id);
                return subs.length ? (
                  <ul className="ap-subs" aria-label={`Agli ordini di ${u.name}`}>
                    {subs.map((d) => <li key={d.id}><b>{d.name}</b> <small>{d.province ?? '—'}</small></li>)}
                  </ul>
                ) : null;
              })() : null}
              {openId === u.id && <Info info={info} canSetPolicy={canMove && info.nation === game.player && info.condition !== null} onPolicy={onPolicy} />}
            </li>
          );
        })}
      </ul>
      {canMove && (
        <footer className="ap-actions">
          <button type="button" onClick={() => onSelectAll(group.units.map((u) => u.id))} disabled={n === group.units.length}>Tutte</button>
          <button type="button" onClick={onClear} disabled={n === 0}>Nessuna</button>
          <button type="button" className="danger" onClick={onCancel} disabled={n === 0}>Annulla ordini</button>
          {onCommand ? <button type="button" onClick={onCommand} title="Apri la catena di comando con l'unità scelta">Comando</button> : null}
        </footer>
      )}
    </aside>
  );
}
