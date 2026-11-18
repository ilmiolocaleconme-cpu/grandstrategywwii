// Pannello «Divisioni»: editor a moduli (18/11/2026). Tre schede: nuovo modello (battaglioni con − / +), modelli salvati, riorganizza le divisioni.
// Regole e dati vengono da fuori (App.jsx): qui solo interfaccia.
import { useMemo, useState } from 'react';
import { moduleGroups, bump, designSummary, CATEGORY_LABEL } from './designView.js';

const fmt = (n) => Number(n).toLocaleString('it-IT');

export default function DivisionEditor({ modules, rules, nation, date, researched, techName, designs, presets, divisions, onCreate, onDelete, onReorg, needsOf, notice, onClose }) {
  const [tab, setTab] = useState(designs.length ? 'designs' : 'new');
  const [name, setName] = useState('');
  const [list, setList] = useState([]);
  const [designId, setDesignId] = useState(designs[0]?.id ?? '');
  const [checked, setChecked] = useState(() => new Set());
  const ctx = { modules, rules, nation, date, researched };
  const groups = useMemo(() => moduleGroups(modules, list, { nation, date, researched, techName }), [modules, list, nation, date, researched, techName]);
  const sum = useMemo(() => designSummary(list, ctx), [list, modules, rules, nation, date, researched]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = designs.find((d) => d.id === designId) ?? designs[0] ?? null;
  const ids = [...checked].filter((id) => divisions.some((d) => d.id === id && d.designId !== target?.id));
  const needs = useMemo(() => (target && ids.length ? needsOf(ids, target.id) : null), [target, ids.join(','), needsOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => { if (onCreate(name, list)) { setName(''); setList([]); setTab('designs'); } };
  const toggle = (id) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <aside className="panel army-panel th-panel de-panel" aria-label="Divisioni">
      <header className="ap-head">
        <div className="ap-title"><strong>Divisioni</strong><span className="muted">Editor a battaglioni · {designs.length} modelli</span></div>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </header>
      {notice ? <p className="ap-notice" role="status">{notice}</p> : null}
      <div className="th-seg de-tabs" role="tablist">
        {[['new', 'Nuovo'], ['designs', 'Modelli'], ['reorg', 'Riorganizza']].map(([k, l]) => (
          <button key={k} type="button" role="tab" className={tab === k ? 'on' : ''} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'new' ? (
        <div className="th-body">
          {modules.length === 0 ? <p className="muted">Per questa nazione i battaglioni non sono ancora definiti: per ora l'editor c'è solo per la Germania.</p> : (
            <>
              <label className="de-name">Nome <input value={name} maxLength={rules.nameMax} onChange={(e) => setName(e.target.value)} placeholder="es. Panzer-Division 1940" /></label>
              {presets.length ? (
                <div className="de-presets"><span className="muted">Parti da:</span>
                  {presets.map((p) => <button key={p.id} type="button" onClick={() => setList(p.modules.map(([id, n]) => [id, n]))}>{p.name}</button>)}
                </div>
              ) : null}
              {groups.map((g) => (
                <section key={g.type}>
                  <h3>{g.label}</h3>
                  <ul className="de-mods">
                    {g.rows.map((r) => (
                      <li key={r.id} className={r.available ? '' : 'off'}>
                        <div className="de-mod-name"><span>{r.name}{r.divisional ? ' · uno per divisione' : ''}</span><span className="muted small">{r.available ? `${fmt(r.men)} uomini` : r.reason}</span></div>
                        <div className="de-step">
                          <button type="button" aria-label={`Togli ${r.name}`} disabled={r.count === 0} onClick={() => setList((l) => bump(l, r.id, -1))}>−</button>
                          <span className="de-n">{r.count}</span>
                          <button type="button" aria-label={`Aggiungi ${r.name}`} disabled={!r.available} onClick={() => setList((l) => bump(l, r.id, 1))}>+</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <section className="de-sum">
                <h3>Riepilogo</h3>
                <p>Divisione <b>{CATEGORY_LABEL[sum.category]}</b> · {sum.battalions} battaglioni · <b>{fmt(sum.men)}</b> uomini (massimo {fmt(rules.maxMen)}){sum.horses ? ` · ${fmt(sum.horses)} cavalli` : ''}</p>
                {sum.highlights.length ? <p className="small">{sum.highlights.map((h) => `${h.label}: ${fmt(h.qty)}`).join(' · ')}</p> : null}
                {sum.problems.length && list.length ? <ul className="de-problems">{sum.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
              </section>
            </>
          )}
          <footer className="ap-actions">
            <button type="button" onClick={() => setList([])} disabled={!list.length}>Svuota</button>
            <button type="button" className="go" onClick={save} disabled={!list.length || sum.problems.length > 0 || !name.trim()}>Salva modello</button>
          </footer>
        </div>
      ) : null}

      {tab === 'designs' ? (
        <div className="th-body">
          {designs.length === 0 ? <p className="muted">Nessun modello. Crealo in «Nuovo modello».</p> : (
            <ul className="th-list">
              {designs.map((d) => (
                <li key={d.id} className="th-card">
                  <div className="th-row"><strong>{d.name}</strong><span className="ap-state">{CATEGORY_LABEL[d.category]}</span></div>
                  <p className="muted small">{fmt(d.men)} uomini · {d.battalions} battaglioni · {d.used} divisioni · dal {d.createdOn.split('-').reverse().join('/')}</p>
                  <p className="small">{d.modules.map(([id, n]) => `${n}× ${modules.find((m) => m.id === id)?.name_it ?? id}`).join(', ')}</p>
                  <div className="th-row">
                    <button type="button" onClick={() => { setDesignId(d.id); setTab('reorg'); }}>Riorganizza divisioni</button>
                    <button type="button" className="danger" disabled={d.used > 0} onClick={() => onDelete(d.id)}>Elimina</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'reorg' ? (
        <div className="th-body">
          {!target ? <p className="muted">Crea prima un modello.</p> : (
            <>
              <label className="de-name">Modello
                <select value={target.id} onChange={(e) => setDesignId(e.target.value)}>{designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              </label>
              <p className="muted small">Subito sul nuovo modello: tiene ciò che ha, il resto arriva coi rinforzi; l'avanzo torna in magazzino.</p>
              <div className="th-row"><span className="muted small">{ids.length} scelte</span>
                <button type="button" onClick={() => setChecked(new Set(divisions.filter((d) => d.designId !== target.id).map((d) => d.id)))}>Tutte</button>
                <button type="button" onClick={() => setChecked(new Set())}>Nessuna</button>
              </div>
              <ul className="de-divs">
                {divisions.map((d) => (
                  <li key={d.id}>
                    <label className={d.designId === target.id ? 'off' : ''}>
                      <input type="checkbox" disabled={d.designId === target.id} checked={checked.has(d.id) && d.designId !== target.id} onChange={() => toggle(d.id)} />
                      <span>{d.name}<span className="muted small"> · {CATEGORY_LABEL[d.category] ?? d.category} · {d.template}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              {needs?.count ? (
                <section className="de-sum">
                  <h3>Da colmare con i rinforzi</h3>
                  <p className="small">{fmt(needs.men)} uomini dal bacino della nazione</p>
                  <ul className="de-needs">{needs.rows.slice(0, 12).map((r) => <li key={r.item} className={r.stock < r.need ? 'short' : ''}>{r.name}: servono {fmt(r.need)}, in magazzino {fmt(r.stock)}</li>)}</ul>
                </section>
              ) : null}
            </>
          )}
          <footer className="ap-actions">
            <button type="button" className="go" disabled={!target || ids.length === 0} onClick={() => { if (onReorg(ids, target.id)) setChecked(new Set()); }}>Riorganizza {ids.length || ''}</button>
          </footer>
        </div>
      ) : null}
    </aside>
  );
}
