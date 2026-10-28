import { useState } from 'react';

const fmt = (v) => Math.round(v).toLocaleString('it-IT');
const costText = (c) => `${fmt(c.ecv)} ECV · ${fmt(c.steel)} t acciaio · ${fmt(c.workers)} lavoratori · ${c.days} giorni`;

/** Elenco di ciò che si può costruire in una provincia (opzioni da provinceBuildOptions). onOrder(order) → testo di esito. */
export function ProvinceBuild({ options, onOrder }) {
  const [msg, setMsg] = useState(null);
  if (!options || (options.mines.length === 0 && options.factories.length === 0)) return null;
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
      <details><summary>Fabbriche ({options.factories.length})</summary><ul className="build-list">{options.factories.map(row)}</ul></details>
    </section>
  );
}

/** Riepilogo economico della nazione del giocatore (economySummary). */
export function EconomyPanel({ summary }) {
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
      <h3>Scorte (t)</h3>
      <p className="small">{stocks.map((s) => `${s.label} ${fmt(s.tons)}`).join(' · ') || 'vuote'}</p>
      <details><summary>Impianti ({plants.reduce((a, p) => a + p.count, 0)}) e miniere ({mines.length})</summary>
        <ul>{plants.map((p) => <li key={p.type}>{p.name} × {p.count}</li>)}{mines.map((m) => <li key={m.id}>Miniera {m.label} · {m.where}</li>)}</ul>
      </details>
    </section>
  );
}
