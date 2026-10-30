// Scheda completa di un'unità: composizione, uomini, dotazione (tutte le voci), stato, comandante, posizione, inquadramento.
// Mostra solo ciò che i dati contengono; le voci senza dato non compaiono (nessun numero inventato).
export const ECH = { division: 'Divisione', brigade: 'Brigata', command: 'Comando' };
export const CAT = { infantry: 'fanteria', armored: 'corazzata', mechanized: 'meccanizzata', motorized: 'motorizzata', cavalry: 'cavalleria', mountain: 'alpina', airborne: 'paracadutisti', command: 'comando' };
const LEVEL = { corps: 'corpo d’armata', army: 'armata', army_group: 'gruppo d’armate', theater: 'teatro', high_command: 'alto comando', district: 'distretto' };

const POLICY = { conservative: 'conservativa', normal: 'normale', aggressive: 'aggressiva' };

export function Info({ info, canSetPolicy, onPolicy }) {
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
        {info.composition ? (
          <>
            <dt>Composizione</dt>
            <dd>
              <ul className="ui-comp">
                {info.composition.rows.map((r) => <li key={r.key}>{r.label}: <b>{String(r.value)}</b>{r.basis ? <small> ({r.basis})</small> : null}</li>)}
              </ul>
              {info.composition.support.length ? <p className="small muted">Supporti organici: {info.composition.support.join(' · ')}</p> : null}
              {info.composition.status ? <p className="small muted">Template {info.composition.templateId}: {info.composition.status.toLowerCase().replace(/_/g, ' ')}</p> : null}
            </dd>
          </>
        ) : null}
        <dt>Dotazione</dt>
        <dd>
          {info.equipment.length ? (
            <ul className="ui-eq">
              {info.equipment.map((e) => <li key={e.item}><span>{e.item}</span><b>{e.effective} / {e.planned}</b><small>{Math.round(e.ratio * 100)}%</small></li>)}
            </ul>
          ) : 'nessuna dotazione per questa unità (modello non ancora definito)'}
        </dd>
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

