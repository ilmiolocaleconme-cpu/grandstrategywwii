// Pannello Esercito: unità del segnalino toccato, scheda info dell'unità scelta e ordine di marcia (si dà toccando una provincia).
import { useMemo, useState } from 'react';
import Flag from './Flag.jsx';
import { unitInfo } from '../rules/unitInfo.js';

const ECH = { division: 'Divisione', brigade: 'Brigata', command: 'Comando' };
const CAT = { infantry: 'fanteria', armored: 'corazzata', mechanized: 'meccanizzata', motorized: 'motorizzata', cavalry: 'cavalleria', mountain: 'alpina', airborne: 'paracadutisti', command: 'comando' };
const LEVEL = { corps: 'corpo d’armata', army: 'armata', army_group: 'gruppo d’armate', theater: 'teatro', high_command: 'alto comando', district: 'distretto' };

const POLICY = { conservative: 'conservativa', normal: 'normale', aggressive: 'aggressiva' };

function Info({ info, canSetPolicy, onPolicy }) {
  const c = info.commander;
  const s = info.strength;
  const k = info.condition;
  return (
    <div className="unit-info">
      <h3>{info.name}</h3>
      <p className="muted">{ECH[info.echelon] ?? info.echelon} · {CAT[info.category] ?? info.category}{info.commandLevel ? ` · ${LEVEL[info.commandLevel] ?? info.commandLevel}` : ''} · {info.nation}</p>
      <dl>
        <dt>Comandante</dt>
        <dd>{c.status === 'assegnato' ? `${c.name} (${c.rank}) — ${c.source === 'player' ? 'scelto da te' : 'assegnato in automatico'}, dal ${c.since}` : c.status === 'vacante' ? 'vacante' : `non gestito (${c.reason})`}</dd>
        <dt>Posizione</dt>
        <dd>{info.movement.provinceName ?? 'sconosciuta'}{info.movement.order ? ` → ${info.movement.order.toName}: prossima tappa ${info.movement.order.nextName}, ${info.movement.order.daysLeft} g. alla tappa, ${info.movement.order.totalDays} g. in tutto` : ' (ferma)'}</dd>
        <dt>Inquadrata in</dt>
        <dd>{info.chain.length ? info.chain.map((x) => x.name).join(' › ') : 'nessun comando superiore'}</dd>
        <dt>Forze assegnate</dt>
        <dd>{info.children.length ? info.children.map((x) => x.name).join(', ') : 'nessuna'}</dd>
        <dt>Consistenza</dt>
        <dd>{s ? (s.cadre ? 'quadro (non pronto al combattimento) · ' : '') + (s.manpower ? `uomini ${s.manpower.effective} / ${s.manpower.planned} (${Math.round(s.manpower.ratio * 100)}%)` : 'uomini: dato assente') + (s.reinforce ? '' : ' · rinforzi sospesi') : 'nessuna dotazione per questa unità (modello non ancora definito)'}</dd>
        <dt>Dotazione</dt>
        <dd>{info.equipment.length ? info.equipment.slice(0, 3).map((e) => `${e.item} ${e.effective}/${e.planned} (${Math.round(e.ratio * 100)}%)`).join(' · ') + (info.equipment.length > 3 ? ` · altre ${info.equipment.length - 3} voci` : '') : 'nessun dato'}</dd>
        {k ? (
          <>
            <dt>Stato operativo</dt>
            <dd><strong>{k.operational.name}</strong>{k.operational.cause ? ` — causa: ${k.operational.cause}` : ''}</dd>
            <dt>Esperienza</dt>
            <dd>{Math.round(k.experience)} · livello {k.experienceLevel.level} {k.experienceLevel.name}{k.isNew ? ' (unità nuova, si addestra fino al tetto)' : ''}</dd>
            <dt>Morale</dt>
            <dd>{Math.round(k.morale)} · {k.moraleBand} (volontà di combattere; fermo finché non esistono combattimento e rifornimenti)</dd>
            <dt>Prontezza</dt>
            <dd>{Math.round(k.readiness)} · {k.readinessBand} (organizzazione e preparazione; non varia finché non esistono riposo, battaglie e riorganizzazioni)</dd>
            <dt>Forza materiale</dt>
            <dd>{k.material.value === null ? 'dato assente' : `${k.material.value}${k.material.cause ? ` — limitata da: ${k.material.cause}` : ''}`} (uomini e dotazione; munizioni, carburante, rifornimenti non modellati)</dd>
            <dt>Politica d’impiego</dt>
            <dd>
              {canSetPolicy ? ['conservative', 'normal', 'aggressive'].map((p) => (
                <button key={p} type="button" aria-pressed={k.policy === p} className={k.policy === p ? 'on' : ''} onClick={() => onPolicy(info.id, p)}>{POLICY[p]}</button>
              )) : POLICY[k.policy]}
              {' '}(solo memorizzata: nessun effetto finché non esiste il combattimento)
            </dd>
          </>
        ) : (
          <>
            <dt>Condizione</dt>
            <dd>esperienza, morale e prontezza sono definiti per le divisioni con dotazione; questa unità non ne ha</dd>
          </>
        )}
        <dt>Ancora non modellati</dt>
        <dd>{info.notModeled.map((n) => n.id).join(', ')} (descritti nei documenti guida, senza regole); la fatica non è prevista in nessun documento</dd>
      </dl>
    </div>
  );
}

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

export default function ArmyPanel({ group, game, unitsById, officersById, initial, provinceName, conditionConfig, onPolicy, canMove, selected, onToggle, onSelectAll, onClear, onClose, onCancel, onAssign, entrenchOf, onEntrench, subordinates, notice, flag, nationName }) {
  const [openId, setOpenId] = useState(null);
  const infos = useMemo(
    () => new Map(group.units.map((u) => [u.id, unitInfo(game, unitsById.get(u.id), { unitsById, officersById, initial, provinceName, conditionConfig })])),
    [group, game, unitsById, officersById, initial, provinceName, conditionConfig],
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
      <p className={`ap-hint${canMove && n > 0 ? ' go' : ''}`}>
        {!canMove ? 'Unità di un’altra nazione: puoi vederle, non dare ordini.'
          : n === 0 ? 'Tocca le unità da muovere.'
            : `${n} ${n === 1 ? 'unità scelta' : 'unità scelte'}: tocca sulla mappa la provincia di destinazione (solo territorio tuo).`}
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
          {onEntrench ? <button type="button" onClick={() => onEntrench(true)} disabled={n === 0} title="Le divisioni ferme guadagnano un bonus difensivo ogni giorno senza battaglia">Trincera</button> : null}
          {onEntrench ? <button type="button" onClick={() => onEntrench(false)} disabled={n === 0}>Smetti</button> : null}
          {onAssign ? <button type="button" className="go" onClick={onAssign}>Incarico{n ? ` (${n})` : ''}</button> : null}
        </footer>
      )}
    </aside>
  );
}
