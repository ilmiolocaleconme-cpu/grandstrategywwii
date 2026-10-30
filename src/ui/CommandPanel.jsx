// Pannello Comando: catena di comando (teatro › gruppo d'armate › armata › corpo › divisione).
// Tocca un'unità per sceglierla, poi «Aggiungi a…» (scegli il comando) oppure, su un comando, «Aggiungi unità…».
import { useMemo, useState } from 'react';
import { orbatLevel, chainOf } from '../rules/orbat.js';
import { commandTree, visibleRows, loose, validParents, validChildren, levelLabel } from './commandView.js';

const levelOf = (u) => orbatLevel(u);
const commandTreeOf = commandTree;

const MARK = { theater: '★★★★★★', army_group: 'XXXXX', army: 'XXXX', corps: 'XXX', division: 'XX', brigade: 'X', support: '·' };

function Row({ row, selected, onSelect, onToggle }) {
  const { node, depth, open, hasChildren } = row;
  return (
    <li className={`cmd-row lv-${node.level}${selected ? ' sel' : ''}`} style={{ '--depth': depth }}>
      {hasChildren ? <button type="button" className="cmd-tw" aria-expanded={open} aria-label={`${open ? 'Chiudi' : 'Apri'} ${node.name}`} onClick={() => onToggle(node.id)}>{open ? '▾' : '▸'}</button> : <span className="cmd-tw ph" aria-hidden="true" />}
      <button type="button" className="cmd-card" aria-pressed={selected} onClick={() => onSelect(node.id)}>
        <i className="cmd-mark" aria-hidden="true">{MARK[node.level]}</i>
        <span className="cmd-name"><b>{node.name}</b><small>{node.label}{node.level !== 'division' && node.level !== 'support' ? ` · ${node.divisions} ${node.divisions === 1 ? 'divisione' : 'divisioni'}` : ''}</small></span>
      </button>
    </li>
  );
}

function Picker({ title, groups, onPick, onClose, empty }) {
  return (
    <section className="cmd-picker" aria-label={title}>
      <header><strong>{title}</strong><button type="button" className="close" aria-label="Chiudi elenco" onClick={onClose}>×</button></header>
      {groups.length === 0 ? <p className="muted">{empty}</p> : groups.map((g) => (
        <div key={g.label} className="cmd-group">
          <h4>{g.label}</h4>
          <ul>{g.items.map((u) => <li key={u.id}><button type="button" onClick={() => onPick(u.id)}><i aria-hidden="true">{MARK[g.level] ?? ''}</i>{u.name}</button></li>)}</ul>
        </div>
      ))}
    </section>
  );
}

export default function CommandPanel({ orbat, units, nation, date, nationName, selectedId, notice, onSelect, onAttach, onDetach, onClose }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('free'); // 'free' = da assegnare, 'tree' = ordine di battaglia
  const [picker, setPicker] = useState(null); // 'parent' | 'child' | null
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const roots = useMemo(() => commandTreeOf(orbat, units, nation, date), [orbat, units, nation, date]);
  const rows = useMemo(() => visibleRows(roots, expanded, query), [roots, expanded, query]);
  const free = useMemo(() => loose(orbat, units, nation, date, query), [orbat, units, nation, date, query]);
  const sel = selectedId ? byId.get(selectedId) : null;
  const isCmd = sel ? !['division', 'support'].includes(levelOf(sel)) : false;
  const parents = useMemo(() => (picker === 'parent' && sel ? validParents(orbat, sel.id, units, nation, date) : []), [picker, sel, orbat, units, nation, date]);
  const children = useMemo(() => (picker === 'child' && sel ? validChildren(orbat, sel.id, units, nation, date) : []), [picker, sel, orbat, units, nation, date]);
  const parentName = sel && orbat.links[sel.id] ? byId.get(orbat.links[sel.id].parent)?.name : null;
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const select = (id) => { setPicker(null); onSelect(id === selectedId ? null : id); };
  const pick = (kind) => (otherId) => {
    const ok = kind === 'parent' ? onAttach(sel.id, otherId) : onAttach(otherId, sel.id);
    if (ok === false) return;
    const open = kind === 'parent' ? otherId : sel.id; // mostra dove è finita l'unità: apre il comando e i suoi superiori
    setPicker(null);
    setTab('tree');
    setExpanded((x) => new Set([...x, open, ...chainOf(orbat, open)]));
  };
  return (
    <aside className="panel army-panel cmd-panel" aria-label="Comando">
      <header className="ap-head">
        <div className="ap-title"><h2>Comando</h2><p>{nationName} · {free.length} da assegnare</p></div>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      {notice ? <p className="ap-notice" role="status">{notice}</p> : null}
      <input type="search" className="cmd-search" placeholder="Cerca unità o comando" aria-label="Cerca" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="th-seg" role="tablist" aria-label="Vista">
        <button type="button" role="tab" aria-selected={tab === 'free'} className={tab === 'free' ? 'on' : ''} onClick={() => setTab('free')}>Da assegnare ({free.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'tree'} className={tab === 'tree' ? 'on' : ''} onClick={() => setTab('tree')}>Ordine di battaglia</button>
      </div>
      <div className="cmd-scroll">
        {tab === 'free' ? (free.length === 0 ? <p className="muted">Nessuna unità libera.</p> : (
          <ul className="cmd-free">
            {free.map((u) => (
              <li key={u.id} className={u.id === selectedId ? 'sel' : ''}>
                <button type="button" aria-pressed={u.id === selectedId} onClick={() => select(u.id)}><i aria-hidden="true">{MARK[levelOf(u)]}</i><b>{u.name}</b><small>{levelLabel(u)}</small></button>
              </li>
            ))}
          </ul>
        )) : (rows.length === 0 ? <p className="muted">Nessun comando disponibile al {date}.</p> : (
          <ul className="cmd-tree">
            {rows.map((r) => <Row key={r.node.id} row={r} selected={r.node.id === selectedId} onSelect={select} onToggle={toggle} />)}
          </ul>
        ))}
      </div>
      {sel ? (
        <footer className="cmd-bar">
          {picker === 'parent' ? <Picker title={`Aggiungi «${sel.name}» a…`} groups={parents} onPick={pick('parent')} onClose={() => setPicker(null)} empty="Nessun comando valido: serve un livello più alto, della stessa nazione." /> : null}
          {picker === 'child' ? <Picker title={`Aggiungi a «${sel.name}»…`} groups={children} onPick={pick('child')} onClose={() => setPicker(null)} empty="Nessuna unità libera di livello inferiore." /> : null}
          <p className="cmd-sel"><b>{sel.name}</b> <small>{levelLabel(sel)}{parentName ? ` · agli ordini di ${parentName}` : ' · senza comando superiore'}</small></p>
          <div className="ap-actions">
            <button type="button" className="go" onClick={() => setPicker('parent')}>Aggiungi a…</button>
            {isCmd ? <button type="button" onClick={() => setPicker('child')}>Aggiungi unità…</button> : null}
            <button type="button" className="danger" disabled={!parentName} onClick={() => onDetach(sel.id)}>Scollega</button>
          </div>
        </footer>
      ) : <p className="ap-hint">Tocca una divisione o un comando, poi scegli dove metterla.</p>}
    </aside>
  );
}
