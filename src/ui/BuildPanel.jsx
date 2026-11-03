import { useState } from 'react';

const fmt = (v) => Math.round(v).toLocaleString('it-IT');
const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('it-IT');
const costText = (c) => `${fmt(c.ecv)} ECV · ${fmt(c.steel)} t acciaio · ${fmt(c.workers)} lavoratori · ${c.days} giorni`;

const hospitalCostText = (c) => `${fmt(c.ecv)} ECV${c.steel > 0 ? ` · ${fmt(c.steel)} t acciaio` : ''} · ${fmt(c.staff)} uomini dal pool · ${c.days} giorni`;

const upCostText = (c) => `${fmt(c.ecv)} ECV · ${fmt(c.steel)} t acciaio · +${fmt(c.workers)} lavoratori · ${c.days} giorni`;

/** Righe di miglioramento (da upgradeOptions): un bottone per riga. onOrder(order) → { ok, text }. */
export function UpgradeList({ upgrades, onOrder, title = 'Miglioramenti' }) {
  const [msg, setMsg] = useState(null);
  if (!upgrades || upgrades.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {msg ? <p className={msg.ok ? 'muted' : 'warn'} role="status">{msg.text}</p> : null}
      <ul className="build-list">
        {upgrades.map((u) => (
          <li key={u.label} className="build-row">
            <div>
              <strong>{u.label}</strong> · {u.detail}
              <div className="muted small">{u.cost ? upCostText(u.cost) : 'costo non disponibile'} · capacità e consumi crescono nello stesso slot</div>
              {!u.ok ? <div className="warn small">{u.message}</div> : null}
            </div>
            <button type="button" className="nation-btn" disabled={!u.ok || !u.order} onClick={() => setMsg(onOrder(u.order))}>Migliora</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Collegamenti di una provincia (provinceLinkRows): livello attuale, massimo, costo del miglioramento. onOrder(order) → { ok, text }. */
export function LinkList({ data, onOrder }) {
  const [msg, setMsg] = useState(null);
  if (!data || data.rows.length === 0) return null;
  return (
    <section aria-label="Strade e ferrovie">
      <h3>Strade e ferrovie</h3>
      <Msg2 msg={msg} />
      <ul className="build-list">
        {data.rows.map((r) => (
          <li key={r.edgeId} className="build-row">
            <div>
              <strong>→ {r.other}</strong> · {r.km} km · {r.levelName}{r.atMax ? ' (massimo)' : ` (massimo possibile: ${r.ceilingName})`}
              <div className="muted small">Velocità ×{r.speed}{r.cost ? ` · ${f1(r.cost.ecv)} ECV · ${f1(r.cost.steel)} t acciaio · ${fmt(r.cost.workers)} lavoratori · ${r.cost.days} giorni` : ''}</div>
              {!r.atMax && !r.ok ? <div className="warn small">{r.message}</div> : null}
            </div>
            {!r.atMax ? <button type="button" className="nation-btn" disabled={!r.ok} onClick={() => setMsg(onOrder(r.order))}>Migliora</button> : null}
          </li>
        ))}
      </ul>
      {data.plain > 0 ? <p className="muted small">Altri {data.plain} collegamenti sono solo sentieri di terra: non hanno un tracciato migliore nei dati.</p> : null}
    </section>
  );
}
const Msg2 = ({ msg }) => (msg ? <p className={msg.ok ? 'muted' : 'warn'} role="status">{msg.text}</p> : null);

/** Porti delle città costiere della provincia (provincePortRows): livello attuale, prossimo livello, costo. onOrder(order) → { ok, text }. */
export function PortList({ rows, onOrder, focusId = null, readOnly = false }) {
  const [msg, setMsg] = useState(null);
  const shown = readOnly ? (rows ?? []).filter((r) => r.level > 0) : rows; // province altrui: solo i porti che esistono, senza ordini
  if (!shown || shown.length === 0) return null;
  return (
    <section aria-label="Porti">
      <h3>Porti</h3>
      <Msg2 msg={msg} />
      <ul className="build-list">
        {shown.map((r) => (
          <li key={r.cittaId} className={r.cittaId === focusId ? 'build-row port-focus' : 'build-row'} aria-current={r.cittaId === focusId ? 'true' : undefined}>
            <div>
              <strong>{r.name}</strong> · {r.levelName}{readOnly ? '' : r.atMax ? ' (massimo)' : ` → ${r.nextName}`}
              {!readOnly && !r.atMax && r.cost ? <div className="muted small">{`${fmt(r.cost.ecv)} ECV · ${fmt(r.cost.steel)} t acciaio · ${fmt(r.cost.workers)} lavoratori · ${r.cost.days} giorni`}</div> : null}
              {!readOnly && !r.atMax && !r.ok ? <div className="warn small">{r.message}</div> : null}
            </div>
            {!readOnly && !r.atMax ? <button type="button" className="nation-btn" disabled={!r.ok} onClick={() => setMsg(onOrder(r.order))}>{r.level === 0 ? 'Costruisci' : 'Migliora'}</button> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Elenco di ciò che si può costruire in una provincia (opzioni da provinceBuildOptions). onOrder(order) → testo di esito. `upgrades`: miglioramenti degli impianti costruiti qui (upgradeOptions). */
export function ProvinceBuild({ options, onOrder, upgrades = null, links = null, ports = null, focusPortId = null }) {
  const [msg, setMsg] = useState(null);
  if (!options) return null;
  if (options.reason === 'not_controlled') return <><section aria-label="Costruzioni"><h3>Costruzioni</h3><p className="muted small">Puoi costruire solo nelle province che controlli.</p></section><PortList rows={ports} readOnly focusId={focusPortId} /></>;
  if (options.mines.length === 0 && options.factories.length === 0 && !(options.hospitals?.length > 0) && !(ports && ports.length > 0)) return null;
  const row = (o) => (
    <li key={JSON.stringify(o.order)} className="build-row">
      <div>
        <strong>{o.label}</strong>{o.detail && o.order.kind === 'mine' ? <> · {o.detail}</> : null}
        <div className="muted small">{o.cost ? costText(o.cost) : 'costo non disponibile'}</div>
        {!o.ok ? <div className="warn small">{o.message}</div> : null}
      </div>
      <button type="button" className="nation-btn" disabled={!o.ok} onClick={() => setMsg(onOrder(o.order))}>Costruisci</button>
    </li>
  );
  return (
    <section aria-label="Costruzioni">
      <h3>Costruzioni</h3>
      {msg ? <p className={msg.ok ? 'muted' : 'warn'} role="status">{msg.text}</p> : null}
      {options.mines.length > 0 ? <><h4>Miniere</h4><ul className="build-list">{options.mines.map(row)}</ul></> : null}
      {options.hospitals?.length > 0 ? <><h4>Ospedali</h4><ul className="build-list">{options.hospitals.map((o) => (
        <li key={JSON.stringify(o.order)} className="build-row">
          <div><strong>{o.label}</strong> · {o.detail}<div className="muted small">{hospitalCostText(o.cost)}</div>{!o.ok ? <div className="warn small">{o.message}</div> : null}</div>
          <button type="button" className="nation-btn" disabled={!o.ok} onClick={() => setMsg(onOrder(o.order))}>Costruisci</button>
        </li>))}</ul></> : null}
      <UpgradeList upgrades={upgrades} onOrder={onOrder} title="Miglioramenti qui" />
      <LinkList data={links} onOrder={onOrder} />
      <PortList rows={ports} onOrder={onOrder} focusId={focusPortId} />
      <details open><summary>Fabbriche ({options.factories.length})</summary><ul className="build-list">{options.factories.map(row)}</ul></details>
    </section>
  );
}

/** Riepilogo economico della nazione del giocatore (economySummary). */
export function EconomyPanel({ summary, upgrades = null, onOrder = null, network = null, harbours = null }) {
  if (!summary) return null;
  const { balance, population, workers, power, stocks, plants, queue, mines } = summary;
  return (
    <section aria-label="Economia">
      <h2>Economia</h2>
      <dl className="eco-dl">
        <dt>Cassa</dt><dd>{fmt(balance)} ECV</dd>
        <dt>Popolazione</dt><dd>{population ? fmt(population) : 'dato mancante'}</dd>
        <dt>Lavoratori</dt><dd>{fmt(workers.free)} liberi su {fmt(workers.total)} (impiegati {fmt(workers.employed)}, in cantiere {fmt(workers.building)})</dd>
        <dt>Energia</dt><dd>{fmt(power.supply)} MW prodotti · {fmt(power.demand)} richiesti · {power.surplus >= 0 ? 'surplus' : 'deficit'} {fmt(Math.abs(power.surplus))} MW</dd>
      </dl>
      <h3>In costruzione ({queue.length})</h3>
      {queue.length === 0 ? <p className="muted small">Nessun cantiere. Scegli una provincia sulla mappa (pulsante «i») per ordinare miniere e fabbriche.</p> : (
        <ul>{queue.map((q) => <li key={q.id}>{q.label} · {q.where} · mancano {q.daysLeft} giorni su {q.totalDays}</li>)}</ul>
      )}
      {upgrades && onOrder ? <UpgradeList upgrades={upgrades} onOrder={onOrder} title="Migliora gli impianti" /> : null}
      {network ? <p className="small">Rete (km): {[4, 3, 2, 1].map((l) => `${network.names[l]} ${fmt(network.km[l])}`).join(' · ')} · {network.upgradable} collegamenti migliorabili</p> : null}
      {harbours ? <p className="small">Porti: {[3, 2, 1].map((l) => `${harbours.names[l]} ${harbours.count[l]}`).join(' · ')}</p> : null}
      <h3>Scorte (t)</h3>
      <p className="small">{stocks.map((s) => `${s.label} ${fmt(s.tons)}`).join(' · ') || 'vuote'}</p>
      <details><summary>Impianti ({plants.reduce((a, p) => a + p.count, 0)}) e miniere ({mines.length})</summary>
        <ul>{plants.map((p) => <li key={`${p.type}|${p.level}`}>{p.name} × {p.count}</li>)}{mines.map((m) => <li key={m.id}>Miniera {m.label} · {m.where}</li>)}</ul>
      </details>
    </section>
  );
}
