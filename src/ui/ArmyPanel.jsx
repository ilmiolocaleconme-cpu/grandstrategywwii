// Pannello Esercito: unità del segnalino toccato, scheda info dell'unità scelta e ordine di marcia (si dà toccando una provincia).
import { useState } from 'react';
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
            <dd>{Math.round(k.morale)} (fermo finché non esistono combattimento e rifornimenti)</dd>
            <dt>Prontezza</dt>
            <dd>{k.readiness.value === null ? 'dato assente' : `${k.readiness.value}${k.readiness.cause ? ` — limitata da: ${k.readiness.cause}` : ''}`} (solo uomini e dotazione; munizioni, carburante, rifornimenti, riposo non modellati)</dd>
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

export default function ArmyPanel({ group, game, unitsById, officersById, initial, provinceName, conditionConfig, onPolicy, canMove, selected, onToggle, onClose, onCancel, notice }) {
  const [openId, setOpenId] = useState(null);
  const open = group.units.find((u) => u.id === openId) ?? null;
  const info = open ? unitInfo(game, unitsById.get(open.id), { unitsById, officersById, initial, provinceName, conditionConfig }) : null;
  return (
    <aside className="province-panel army-panel" aria-label="Unità">
      <header>
        <h2>{provinceName(group.province)} · {group.nation}</h2>
        <button type="button" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      {canMove ? <p className="muted">Spunta le unità, poi tocca sulla mappa la provincia di destinazione (solo territorio tuo).</p> : <p className="muted">Unità di un’altra nazione: puoi vederle, non muoverle.</p>}
      {notice && <p role="status">{notice}</p>}
      <ul className="unit-list">
        {group.units.map((u) => (
          <li key={u.id}>
            {canMove && <input type="checkbox" aria-label={`Seleziona ${u.name}`} checked={selected.has(u.id)} onChange={() => onToggle(u.id)} />}
            <button type="button" onClick={() => setOpenId(u.id === openId ? null : u.id)}>{u.name}</button>
          </li>
        ))}
      </ul>
      {canMove && <button type="button" onClick={onCancel}>Annulla ordini delle unità spuntate</button>}
      {info && <Info info={info} canSetPolicy={canMove && info.nation === game.player && info.condition !== null} onPolicy={onPolicy} />}
    </aside>
  );
}
