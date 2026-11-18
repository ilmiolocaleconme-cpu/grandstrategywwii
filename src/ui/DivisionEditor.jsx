// Schermata «Creazione divisioni» a tutto schermo (editor a moduli, 18/11/2026; ridisegnata su richiesta dell'utente col suo esempio).
// Sinistra: modelli (tuoi e di partenza) · centro: composizione a battaglioni con − / + oppure scelta delle divisioni da riorganizzare ·
// destra: riepilogo (forza, cavalli, mezzi, potenza di fuoco) o fabbisogno · in basso: suggerimento, Ripristina, Conferma.
// La partita è in pausa mentre la schermata è aperta (App.jsx). Regole e dati vengono da fuori: qui solo interfaccia.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { moduleGroups, bump, designSummary, CATEGORY_LABEL } from './designView.js';
import { Icon, Banner } from './unitIcons.jsx';

const fmt = (n) => Number(n).toLocaleString('it-IT');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TITLE = { infantry: 'Divisione di fanteria', motorized: 'Divisione motorizzata', mechanized: 'Divisione meccanizzata', armored: 'Divisione corazzata' };
const HINT = {
  edit: 'Aggiungi o togli battaglioni: i limiti seguono gli organici storici. Serve un reparto di servizi divisionali.',
  reorg: 'Le divisioni passano subito al modello: tengono ciò che hanno, il resto arriva coi rinforzi, l\'avanzo torna in magazzino.',
};
const statIcon = (label) => (/Carri/.test(label) ? 'tank' : /Cacciacarri/.test(label) ? 'anti_tank' : /artiglieria/.test(label) ? 'artillery' : /Semicingolati/.test(label) ? 'mechanized_infantry' : 'truck');

function ModelCard({ active, category, title, sub, badge, onClick }) {
  return (
    <button type="button" className={`de-card${active ? ' on' : ''}`} onClick={onClick}>
      <span className="de-card-art"><Icon name={category} size={34} /></span>
      <span className="de-card-text"><b>{title}</b><span>{sub}</span></span>
      {badge ? <span className="de-badge">{badge}</span> : null}
    </button>
  );
}

export default function DivisionEditor({ modules, rules, nation, nationName, date, researched, techName, designs, presets, divisions, firepowerOf, onCreate, onDelete, onReorg, needsOf, notice, onClose }) {
  const first = designs[0] ? { kind: 'design', id: designs[0].id } : presets[0] ? { kind: 'preset', id: presets[0].id } : { kind: 'new', id: null };
  const listOf = (s) => (s.kind === 'design' ? designs.find((d) => d.id === s.id)?.modules : s.kind === 'preset' ? presets.find((p) => p.id === s.id)?.modules : null) ?? [];
  const [src, setSrc] = useState(first);
  const [mode, setMode] = useState('edit');
  const [list, setList] = useState(() => listOf(first).map(([id, n]) => [id, n]));
  const [name, setName] = useState('');
  const [checked, setChecked] = useState(() => new Set());
  const [targetId, setTargetId] = useState(designs[0]?.id ?? '');

  const ctx = { modules, rules, nation, date, researched, firepowerOf };
  const groups = useMemo(() => moduleGroups(modules, list, { nation, date, researched, techName }), [modules, list, nation, date, researched, techName]);
  const sum = useMemo(() => designSummary(list, ctx), [list, modules, rules, nation, date, researched, firepowerOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = listOf(src);
  const design = src.kind === 'design' ? designs.find((d) => d.id === src.id) : null;
  const preset = src.kind === 'preset' ? presets.find((p) => p.id === src.id) : null;
  const changed = !same(list, base);
  const title = design && !changed ? design.name : preset && !changed ? preset.name : TITLE[sum.category];
  const target = designs.find((d) => d.id === targetId) ?? designs[0] ?? null;
  const ids = [...checked].filter((id) => divisions.some((d) => d.id === id && d.designId !== target?.id));
  const needs = useMemo(() => (mode === 'reorg' && target && ids.length ? needsOf(ids, target.id) : null), [mode, target, ids.join(','), needsOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const canSave = list.length > 0 && sum.problems.length === 0 && (changed || src.kind !== 'design');

  const pick = (s) => { setSrc(s); setMode('edit'); setList(listOf(s).map(([id, n]) => [id, n])); setName(''); };
  const save = () => {
    const fallback = design ? `${design.name} (variante)` : preset ? preset.name : TITLE[sum.category];
    const id = onCreate(name.trim() || fallback, list);
    if (id) { setSrc({ kind: 'design', id }); setName(''); setTargetId(id); }
  };
  const toggle = (id) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const openReorg = (id) => { setTargetId(id); setMode('reorg'); };
  // a tutto schermo: la schermata va sopra al resto del documento e il gioco sotto si nasconde (niente pagina più larga dello schermo)
  useEffect(() => { document.body.classList.add('de-open'); return () => document.body.classList.remove('de-open'); }, []);

  return createPortal(
    <div className="de-screen" role="dialog" aria-modal="true" aria-label="Creazione divisioni">
      <header className="de-top">
        <button type="button" className="de-back" aria-label="Torna alla mappa" onClick={onClose}><Icon name="back" size={26} /></button>
        <div className="de-top-title"><h2>{mode === 'reorg' ? 'Riorganizza divisioni' : 'Creazione divisioni'}</h2><p>{mode === 'reorg' ? 'Porta le divisioni sul nuovo modello' : 'Configura il modello di divisione'}</p></div>
        <div className="de-top-info"><span>{nationName}</span><span className="de-paused"><Icon name="pause" size={14} /> in pausa · {date.split('-').reverse().join('/')}</span></div>
      </header>
      {notice ? <p className="de-notice" role="status">{notice}</p> : null}

      <div className="de-grid">
        <nav className="de-col de-left" aria-label="Modelli">
          <h3>I tuoi modelli</h3>
          {designs.length === 0 ? <p className="de-muted">Nessuno ancora: parti da un modello qui sotto.</p> : designs.map((d) => (
            <ModelCard key={d.id} active={src.kind === 'design' && src.id === d.id} category={d.category} title={d.name} sub={`${fmt(d.men)} uomini · ${d.battalions} btg.`} badge={d.used ? `${d.used} div.` : null} onClick={() => pick({ kind: 'design', id: d.id })} />
          ))}
          <h3>Modelli di partenza</h3>
          {presets.length === 0 ? <p className="de-muted">Per questa nazione i battaglioni non sono ancora definiti: per ora l'editor c'è solo per la Germania.</p> : presets.map((p) => (
            <ModelCard key={p.id} active={src.kind === 'preset' && src.id === p.id} category={p.category} title={p.name} sub={`${fmt(p.men)} uomini${p.horses ? ` · ${fmt(p.horses)} cavalli` : ''}`} onClick={() => pick({ kind: 'preset', id: p.id })} />
          ))}
          {modules.length ? <button type="button" className="de-new" onClick={() => pick({ kind: 'new', id: null })}><Icon name="plus" size={20} /> Nuovo modello vuoto</button> : null}
        </nav>

        <main className="de-col de-center">
          {mode === 'edit' ? (
            <>
              <section className="de-hero">
                <div className="de-hero-head">
                  <span className="de-emblem"><Icon name={sum.category} size={30} /></span>
                  <div className="de-hero-text">
                    <input className="de-title-input" value={name} maxLength={rules.nameMax} onChange={(e) => setName(e.target.value)} placeholder={title} aria-label="Nome del modello" />
                    <p>{`Divisione ${CATEGORY_LABEL[sum.category]}`}{design ? ` · modello salvato${design.used ? `, usato da ${design.used} divisioni` : ''}` : preset ? ' · modello di partenza' : ' · nuovo'}{changed && src.kind !== 'new' ? ' · modificato' : ''}</p>
                  </div>
                  {design ? <button type="button" className="de-chip" onClick={() => openReorg(design.id)}><Icon name="swap" size={18} /> Riorganizza</button> : null}
                </div>
                <Banner category={sum.category} />
              </section>
              <section className="de-box">
                <h3>Composizione <span className="de-muted">· {sum.battalions} battaglioni</span></h3>
                {groups.map((g) => (
                  <div key={g.type} className="de-group">
                    <h4><Icon name={g.type} size={18} /> {g.label}</h4>
                    {g.rows.map((r) => {
                      const share = sum.men > 0 ? (r.men * r.count) / sum.men : 0;
                      return (
                        <div key={r.id} className={`de-row${r.available ? '' : ' off'}${r.count ? ' has' : ''}`}>
                          <span className="de-row-icon"><Icon name={r.available ? r.type : 'lock'} size={24} /></span>
                          <span className="de-row-name"><b>{r.name}</b><span>{r.available ? `${fmt(r.men)} uomini${r.divisional ? ' · uno per divisione' : ''}` : r.reason}</span></span>
                          <span className="de-step">
                            <button type="button" aria-label={`Togli ${r.name}`} disabled={r.count === 0} onClick={() => setList((l) => bump(l, r.id, -1))}>−</button>
                            <span className="de-n">{r.count}</span>
                            <button type="button" aria-label={`Aggiungi ${r.name}`} disabled={!r.available} onClick={() => setList((l) => bump(l, r.id, 1))}>+</button>
                          </span>
                          <span className="de-share"><span className="de-pct">{Math.round(share * 100)}%</span><span className={`de-bar t-${r.type}`}><i style={{ width: `${Math.min(100, share * 100)}%` }} /></span></span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            </>
          ) : (
            <section className="de-box">
              <label className="de-field">Modello
                <select value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>{designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              </label>
              <div className="de-tools">
                <span className="de-muted">{ids.length} scelte su {divisions.length}</span>
                <button type="button" onClick={() => setChecked(new Set(divisions.filter((d) => d.designId !== target?.id).map((d) => d.id)))}>Tutte</button>
                <button type="button" onClick={() => setChecked(new Set())}>Nessuna</button>
              </div>
              <ul className="de-divs">
                {divisions.map((d) => {
                  const on = d.designId === target?.id;
                  return (
                    <li key={d.id}>
                      <label className={on ? 'off' : checked.has(d.id) ? 'sel' : ''}>
                        <input type="checkbox" disabled={on} checked={!on && checked.has(d.id)} onChange={() => toggle(d.id)} />
                        <Icon name={d.category} size={22} />
                        <span><b>{d.name}</b><span className="de-muted"> · {CATEGORY_LABEL[d.category] ?? d.category} · {on ? 'già su questo modello' : d.template}</span></span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </main>

        <aside className="de-col de-right">
          {mode === 'edit' ? (
            <>
              <section className="de-box">
                <h3>Riepilogo divisione</h3>
                <dl className="de-stats">
                  <div><dt><Icon name="men" size={20} /> Forza organica</dt><dd>{fmt(sum.men)}<small> / {fmt(rules.maxMen)}</small></dd></div>
                  <div><dt><Icon name="horse" size={20} /> Cavalli</dt><dd>{fmt(sum.horses)}</dd></div>
                  {sum.highlights.map((h) => <div key={h.label}><dt><Icon name={statIcon(h.label)} size={20} /> {h.label}</dt><dd>{fmt(h.qty)}</dd></div>)}
                </dl>
              </section>
              {sum.firepower ? (
                <section className="de-box">
                  <h3>Potenza in battaglia</h3>
                  <dl className="de-stats">
                    <div><dt><Icon name="fire" size={20} /> Contro fanteria</dt><dd>{fmt(sum.firepower.soft)}</dd></div>
                    <div><dt><Icon name="fire" size={20} /> Contro corazzati</dt><dd>{fmt(sum.firepower.hard)}</dd></div>
                    {sum.highlights.some((h) => /Carri|Cacciacarri/.test(h.label)) ? <div><dt><Icon name="shield" size={20} /> Corazza media</dt><dd>{sum.firepower.armor.toFixed(2)}</dd></div> : null}
                  </dl>
                  <p className="de-muted small">A dotazione piena, senza esperienza né terreno.</p>
                </section>
              ) : null}
              {list.length && sum.problems.length ? (
                <section className="de-box de-warn"><h3>Da sistemare</h3><ul>{sum.problems.map((p) => <li key={p}>{p}</li>)}</ul></section>
              ) : null}
              {design ? (
                <section className="de-box">
                  <h3>Modello salvato</h3>
                  <p className="de-muted small">Creato il {design.createdOn.split('-').reverse().join('/')} · usato da {design.used} divisioni.</p>
                  <div className="de-tools">
                    <button type="button" onClick={() => openReorg(design.id)}>Riorganizza divisioni</button>
                    <button type="button" className="danger" disabled={design.used > 0} onClick={() => { onDelete(design.id); pick(presets[0] ? { kind: 'preset', id: presets[0].id } : { kind: 'new', id: null }); }}>Elimina</button>
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <section className="de-box">
              <h3>Da colmare con i rinforzi</h3>
              {needs?.count ? (
                <>
                  <dl className="de-stats"><div><dt><Icon name="men" size={20} /> Uomini dal bacino</dt><dd>{fmt(needs.men)}</dd></div></dl>
                  <ul className="de-needs">{needs.rows.slice(0, 14).map((r) => (
                    <li key={r.item} className={r.stock < r.need ? 'short' : ''}><span>{r.name}</span><span>{fmt(r.stock)} / {fmt(r.need)}</span><span className="de-bar"><i style={{ width: `${Math.min(100, (r.stock / r.need) * 100)}%` }} /></span></li>
                  ))}</ul>
                  <p className="de-muted small">In magazzino / necessari. In arancione ciò che va prodotto.</p>
                </>
              ) : <p className="de-muted">Scegli le divisioni da riorganizzare.</p>}
            </section>
          )}
        </aside>
      </div>

      <footer className="de-foot">
        <p className="de-hint"><Icon name="support" size={18} /> {HINT[mode]}</p>
        {mode === 'edit' ? (
          <>
            <button type="button" className="de-btn blue" disabled={!changed && !name} onClick={() => { setList(base.map(([id, n]) => [id, n])); setName(''); }}><Icon name="reset" size={20} /> Ripristina</button>
            <button type="button" className="de-btn green" disabled={!canSave} onClick={save}><Icon name="check" size={20} /> {src.kind === 'design' ? 'Salva come nuovo' : 'Conferma creazione'}</button>
          </>
        ) : (
          <>
            <button type="button" className="de-btn blue" onClick={() => setMode('edit')}><Icon name="back" size={20} /> Modello</button>
            <button type="button" className="de-btn green" disabled={!target || ids.length === 0} onClick={() => { if (onReorg(ids, target.id)) setChecked(new Set()); }}><Icon name="check" size={20} /> Riorganizza {ids.length || ''}</button>
          </>
        )}
      </footer>
    </div>,
    document.body,
  );
}
