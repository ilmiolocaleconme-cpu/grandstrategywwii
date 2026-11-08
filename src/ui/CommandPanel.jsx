// Stato maggiore (variante B): barra di riepilogo, albero dei comandi a nodi, dettaglio con barre, azioni tonde e barra con le sezioni.
// Tocca un nodo (o una divisione da assegnare) per sceglierlo. «Ordini»: «Seleziona tutte» spunta le divisioni agli ordini, se ne tolgono quelle
// che restano, poi si dà l'ordine (marcia, incarico, trincea) alle sole spuntate. Non si creano armate né teatri da qui.
import { useState } from 'react';
import { orbatLevel } from '../rules/orbat.js';
import { commandTree, loose, validParents, levelLabel } from './commandView.js';
import CommandSummary from './CommandSummary.jsx';
import CommandForces from './CommandForces.jsx';
import { nearestFirst, distanceLabel, byDistance } from '../rules/commandLinks.js';
import { statusDot, nodeCaption, checkAll, checkNone, toggleCheck, keepAvailable } from '../rules/commandStatus.js';

const MARK = { theater: 'XXXXXX', army_group: 'XXXXX', army: 'XXXX', corps: 'XXX', division: 'XX', brigade: 'X', support: '·' };
const DOT_LABEL = { g: 'Tutte le divisioni in portata', y: 'Alcune divisioni fuori portata', r: 'Fuori comando' };
const isCmdNode = (n) => n.level !== 'division' && n.level !== 'support';
const fmt = (n) => n.toLocaleString('it-IT');
const tone = (v) => (v === null ? '' : v >= 75 ? '' : v >= 50 ? 'w' : 'r'); // colore della barra: solo grafica, non una regola di gioco

const ICON = {
  assign: <path d="M12 4v8M7 9l5 5 5-5M5 20h14" />,
  move: <path d="M4 12h14M13 6l6 6-6 6" />,
  detach: <path d="M9 15l-3 3a3 3 0 0 1-4-4l3-3M15 9l3-3a3 3 0 0 1 4 4l-3 3M8 16l8-8" />,
  tree: <><circle cx="12" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M12 8.5V12M6 15.5V12h12v3.5" /></>,
  arm: <><rect x="3" y="9" width="18" height="7" rx="3" /><path d="M7 9V6h8l3 3M10 16v3h6v-3" /></>,
  map: <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  list: <path d="M5 6h14M5 12h14M5 18h9" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  men: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 3-6 6-6s6 2 6 6M15 20c0-2 1-4 3-4s3 1 3 3" /></>,
  ready: <><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></>,
  morale: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2M9 9.5h.01M15 9.5h.01" /></>,
  chart: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-9" />,
};
const Ico = ({ name, className = 'sm-ico' }) => <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{ICON[name]}</svg>;

const TABS = [
  { id: 'org', label: 'Organico', icon: 'tree' },
  { id: 'mat', label: 'Materiali', icon: 'arm', soon: true },
  { id: 'ord', label: 'Ordini', icon: 'map' },
  { id: 'con', label: 'Condizione', icon: 'list', soon: true },
  { id: 'sto', label: 'Storia', icon: 'info', soon: true },
];

function Picker({ title, groups, onPick, onClose, empty, byDistance: sorted = false }) {
  const flat = sorted ? nearestFirst(groups) : null; // «Aggiungi a…»: una lista sola, dal comando più vicino, con la distanza sotto il nome
  return (
    <section className="cmd-picker" aria-label={title}>
      <header><strong>{title}</strong><button type="button" className="close" aria-label="Chiudi elenco" onClick={onClose}>×</button></header>
      {groups.length === 0 ? <p className="muted">{empty}</p> : flat ? (
        <ul className="cmd-near">{flat.map((u) => { const d = distanceLabel(u.km); return (
          <li key={u.id}><button type="button" className={u.nearest ? 'near' : ''} onClick={() => onPick(u.id)}>
            <i aria-hidden="true">{MARK[u.level] ?? ''}</i><b>{u.name}</b>
            <small className={d.far ? 'far' : ''}>{u.levelLabel} · {d.text}{u.nearest ? ' · il più vicino' : ''}</small>
          </button></li>); })}</ul>
      ) : groups.map((g) => (
        <div key={g.label} className="cmd-group">
          <h4>{g.label}</h4>
          <ul>{g.items.map((u) => <li key={u.id}><button type="button" onClick={() => onPick(u.id)}><i aria-hidden="true">{MARK[g.level] ?? ''}</i>{u.name}</button></li>)}</ul>
        </div>
      ))}
    </section>
  );
}

function Stat({ icon, label, pct, value, note }) {
  return (
    <div className="sm-stat">
      <Ico name={icon} />
      <span className="sm-stat-body">
        <span>{label}</span>
        <span className="sm-meter" role="img" aria-label={`${label}: ${value ?? 'dato non disponibile'}`}><i className={tone(pct)} style={{ width: `${pct === null ? 0 : Math.max(2, Math.min(100, pct))}%` }} /></span>
        <small>{note}</small>
      </span>
      <b>{value ?? '—'}</b>
    </div>
  );
}

export default function CommandPanel({
  orbat, units, nation, date, nationName, selectedId, notice, onSelect, onAttach, onDetach, parentOptions, childOptions,
  subsOf, statsOf, divisionsOf, farIds, fightersOf, onMarch, onAssign, onEntrench, onClose, summary = null,
}) {
  const [tab, setTab] = useState('org');
  const [query, setQuery] = useState('');
  const [picker, setPicker] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);
  const [chk, setChk] = useState({ owner: null, ids: new Set() }); // spunte degli ordini, valide solo per il nodo scelto
  const byId = new Map(units.map((u) => [u.id, u]));
  const roots = commandTree(orbat, units, nation, date);
  const free = loose(orbat, units, nation, date, query);
  const sel = selectedId ? byId.get(selectedId) : null;
  const isCmd = sel ? !['division', 'support'].includes(orbatLevel(sel)) : false;
  const parents = picker && sel ? (parentOptions ? parentOptions(sel.id) : validParents(orbat, sel.id, units, nation, date)) : [];
  const parentName = sel && orbat.links[sel.id] ? byId.get(orbat.links[sel.id].parent)?.name : null;
  const subs = sel && isCmd && subsOf ? byDistance(subsOf(sel.id)) : [];
  const rows = sel ? (isCmd ? subs : [{ id: sel.id, name: sel.name, province: null, km: null }]) : [];
  const rowIds = rows.map((r) => r.id);
  const checked = chk.owner === selectedId ? keepAvailable(chk.ids, rowIds) : checkNone();
  const setChecked = (ids) => setChk({ owner: selectedId, ids });
  const chosen = [...checked];
  const nFight = fightersOf && sel ? fightersOf(chosen).length : 0;
  const select = (id) => { setPicker(false); onSelect(id === selectedId ? null : id); };
  const pick = (otherId) => { if (onAttach(sel.id, otherId) === false) return; setPicker(false); setTab('org'); };
  const stats = (id) => (statsOf ? statsOf(id) : null);
  const dotOf = (id) => (divisionsOf ? statusDot(divisionsOf(id), farIds) : null);
  const q = query.trim().toLowerCase();

  const node = (n) => {
    const st = stats(n.id); const dot = dotOf(n.id); const on = n.id === selectedId;
    const mark = n.label === 'Brigata' ? MARK.brigade : MARK[n.level] ?? '';
    return (
      <div className="sm-nodewrap" key={n.id}>
        <button type="button" className={`sm-node lv-${n.level}${on ? ' sel' : ''}`} aria-pressed={on} onClick={() => select(n.id)}>
          <span className={`sm-badge${mark.length > 4 ? ' long' : ''}`} aria-hidden="true">{mark}</span>
          <span className="sm-nm">{n.name}</span>
          <span className="sm-st">{st ? nodeCaption(st, dot) : n.label}</span>
        </button>
        {dot ? <span className={`sm-dot ${dot}`} role="img" aria-label={DOT_LABEL[dot]} /> : null}
      </div>
    );
  };
  const branch = (n) => {
    const kids = n.children.filter(isCmdNode);
    return (
      <div className="sm-branch" key={n.id}>
        {node(n)}
        {kids.length ? <><div className="sm-link" aria-hidden="true" /><div className="sm-row">{kids.map(branch)}</div></> : null}
      </div>
    );
  };
  const flatten = (ns) => ns.flatMap((n) => [n, ...flatten(n.children.filter(isCmdNode))]);
  const found = q ? flatten(roots).filter((n) => n.name.toLowerCase().includes(q)) : [];

  const st = sel ? stats(sel.id) : null;
  const detail = sel ? (
    <section className="sm-frame sm-detail" aria-label={`Dettaglio ${sel.name}`}>
      <h2>{sel.name} · dettaglio</h2>
      <p className="sm-sub">{levelLabel(sel)}{parentName ? ` · agli ordini di ${parentName}` : ' · senza comando superiore'}</p>
      {st && st.divisions > 0 ? (
        <>
          <Stat icon="men" label="Personale" pct={st.men && st.men.ratio !== null ? Math.round(st.men.ratio * 100) : null} value={st.men && st.men.ratio !== null ? `${Math.round(st.men.ratio * 100)}%` : null} note={st.men ? `${fmt(st.men.effective)} uomini su ${fmt(st.men.planned)}` : 'dato non disponibile'} />
          <Stat icon="ready" label="Prontezza" pct={st.readiness} value={st.readiness === null ? null : `${st.readiness}%`} note={st.readiness === null ? 'dato non disponibile' : `${st.readiness} su 100`} />
          <Stat icon="morale" label="Morale" pct={st.morale} value={st.morale} note={st.morale === null ? 'dato non disponibile' : `${st.morale} su 100`} />
          <Stat icon="chart" label="Forza materiale" pct={null} value={null} note="dato non disponibile" />
        </>
      ) : <p className="muted">{isCmd ? 'Nessuna divisione agli ordini: i dati compaiono quando ne aggiungi.' : 'Nessun dato sulla divisione.'}</p>}
    </section>
  ) : null;

  return (
    <aside className="panel army-panel cmd-panel sm" aria-label="Stato maggiore">
      <header className="sm-frame sm-top">
        <span className="sm-title">STATO MAGGIORE</span>
        <CommandSummary summary={summary} />
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      {notice ? <p className="ap-notice" role="status">{notice}</p> : null}
      <div className="sm-scroll">
        {tab === 'org' ? (
          <div className="sm-cols">
            <div className="sm-col">
            <input type="search" className="cmd-search" placeholder="Cerca unità o comando" aria-label="Cerca" value={query} onChange={(e) => setQuery(e.target.value)} />
            <section className="sm-frame sm-tree" aria-label="Albero di comando">
              {q ? (found.length ? <div className="sm-row">{found.map(node)}</div> : <p className="muted">Nessun comando trovato.</p>)
                : roots.length ? <div className="sm-row">{roots.map(branch)}</div> : <p className="muted">Nessun comando disponibile al {date}.</p>}
            </section>
            <section className="sm-free" aria-label="Da assegnare">
              <button type="button" className="sm-free-head" aria-expanded={freeOpen} onClick={() => setFreeOpen((v) => !v)}>Da assegnare ({free.length}) <span aria-hidden="true">{freeOpen ? '▾' : '▸'}</span></button>
              {freeOpen ? (free.length === 0 ? <p className="muted">Nessuna unità libera.</p> : (
                <ul className="cmd-free">
                  {free.map((u) => (
                    <li key={u.id} className={u.id === selectedId ? 'sel' : ''}>
                      <button type="button" aria-pressed={u.id === selectedId} onClick={() => select(u.id)}><i aria-hidden="true">{MARK[orbatLevel(u)]}</i><b>{u.name}</b><small>{levelLabel(u)}</small></button>
                    </li>
                  ))}
                </ul>
              )) : null}
            </section>
            {sel ? (
        <nav className="sm-frame sm-acts" aria-label={`Azioni su ${sel.name}`}>
          <button type="button" onClick={() => setPicker((v) => !v)} aria-expanded={picker}><Ico name="assign" className="sm-act-ico" /><span>Aggiungi a…</span></button>
          {onMarch ? <button type="button" onClick={() => { setChecked(checkAll(rowIds)); setTab('ord'); }} disabled={rows.length === 0}><Ico name="move" className="sm-act-ico" /><span>Muovi tutte</span></button> : null}
          <button type="button" disabled={!parentName} onClick={() => onDetach(sel.id)}><Ico name="detach" className="sm-act-ico" /><span>Scollega</span></button>
        </nav>
            ) : null}
            </div>
            <div className="sm-col">
            {picker && sel ? <Picker title={`Aggiungi «${sel.name}» a…`} groups={parents} byDistance={Boolean(parentOptions)} onPick={pick} onClose={() => setPicker(false)} empty="Nessun comando valido: serve un livello più alto, della stessa nazione." /> : null}
            {detail}
            {sel && isCmd ? <section className="sm-frame sm-forces"><CommandForces unit={sel} subs={subs} own childOptions={childOptions} onAttachChild={(hq, child) => onAttach(child, hq)} /></section> : null}
            {!sel ? <p className="ap-hint">Tocca un comando o una divisione da assegnare.</p> : null}
            </div>
          </div>
        ) : null}
        {tab === 'ord' ? (sel ? (
          <section className="sm-frame sm-orders" aria-label={`Ordini a ${sel.name}`}>
            <h2>{sel.name} · ordini</h2>
            <p className="sm-sub">{rows.length === 0 ? 'Nessuna divisione agli ordini.' : `${checked.size} di ${rows.length} ${rows.length === 1 ? 'divisione scelta' : 'divisioni scelte'}`}</p>
            <div className="sm-pick">
              <button type="button" className="go" disabled={rows.length === 0 || checked.size === rows.length} onClick={() => setChecked(checkAll(rowIds))}>Seleziona tutte ({rows.length})</button>
              <button type="button" disabled={checked.size === 0} onClick={() => setChecked(checkNone())}>Nessuna</button>
            </div>
            <ul className="sm-units">
              {rows.map((r) => {
                const on = checked.has(r.id); const d = r.km !== undefined && r.km !== null ? distanceLabel(r.km) : null;
                return (
                  <li key={r.id}>
                    <button type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => setChecked(toggleCheck(checked, r.id))}>
                      <span className="sm-box" aria-hidden="true">{on ? '✓' : ''}</span>
                      <b>{r.name}</b>
                      <small className={d?.far ? 'far' : ''}>{r.province ?? '—'}{d ? ` · ${d.text}` : ''}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
            {onMarch ? (
              <div className="sm-orders-act" role="group" aria-label="Ordini alle divisioni scelte">
                <button type="button" className="go" disabled={checked.size === 0} onClick={() => onMarch(chosen)} title="Poi tocca sulla mappa la destinazione">Muovi ({checked.size})</button>
                <button type="button" disabled={nFight === 0} onClick={() => onAssign(chosen)} title="Incarico di attacco o difesa">Incarico ({nFight})</button>
                <button type="button" disabled={nFight === 0} onClick={() => onEntrench(chosen, true)}>Trincera</button>
                <button type="button" disabled={checked.size === 0} onClick={() => onEntrench(chosen, false)}>Smetti</button>
              </div>
            ) : <p className="muted">Gli ordini si danno solo alle unità della tua nazione, a mappa pronta.</p>}
          </section>
        ) : <p className="ap-hint">Scegli prima un comando o una divisione nell’Organico.</p>) : null}
      </div>
      <nav className="sm-nav" role="tablist" aria-label="Sezioni">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} disabled={t.soon} title={t.soon ? 'Non ancora disponibile' : undefined} onClick={() => setTab(t.id)}>
            <Ico name={t.icon} className="sm-nav-ico" /><span>{t.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
