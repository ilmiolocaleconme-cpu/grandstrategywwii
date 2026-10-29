// Pannello Commercio della partita. Le regole sono in rules/trade.js e game/tradeState.js: qui solo scelta, anteprima e messaggi.
import { useMemo, useState } from 'react';
import { modeName } from './tradeView.js';

const fmt = (v) => (Math.round(v * 10) / 10).toLocaleString('it-IT');
const Msg = ({ msg }) => (msg ? <p className={msg.ok ? 'muted' : 'warn'} role="status">{msg.text}</p> : null);

/**
 * goods: tradeGoods(...); partners: [{ id, name }]; rows: tradeRows(...). onPreview(order) → previewTrade; onOpen(order) → { ok, text }; onCancel(id) → { ok, text }.
 * Il giocatore è sempre una delle due parti: `direction` 'sell' (vende) o 'buy' (compra).
 */
export function TradePanel({ goods, partners, rows, onPreview, onOpen, onCancel }) {
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ partner: '', direction: 'sell', good: '', perDay: '10', days: '30', mode: 'auto' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const order = useMemo(() => (form.partner && form.good ? { partner: form.partner, direction: form.direction, good: form.good, perDay: Number(form.perDay), days: Number(form.days), mode: form.mode } : null), [form]);
  const preview = useMemo(() => (order ? onPreview(order) : null), [order, onPreview]);
  if (!goods || goods.length === 0) return null;
  const unit = goods.find((g) => g.id === form.good)?.unit ?? 't';
  return (
    <section aria-label="Commercio">
      <h2>Commercio</h2>
      <Msg msg={msg} />
      <div className="trade-form">
        <label className="small">Nazione{' '}
          <select value={form.partner} onChange={set('partner')}><option value="">— scegli —</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>{' '}
        <label className="small">Operazione{' '}
          <select value={form.direction} onChange={set('direction')}><option value="sell">Vendi</option><option value="buy">Compra</option></select>
        </label>{' '}
        <label className="small">Merce{' '}
          <select value={form.good} onChange={set('good')}><option value="">— scegli —</option>{goods.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.price} ECV/{g.unit === 'pezzi' ? 'pezzo' : 't'})</option>)}</select>
        </label>{' '}
        <label className="small">{unit === 'pezzi' ? 'Pezzi' : 'Tonnellate'} al giorno{' '}
          <input type="number" min="1" step={unit === 'pezzi' ? 1 : 'any'} value={form.perDay} onChange={set('perDay')} style={{ width: '5em' }} />
        </label>{' '}
        <label className="small">Giorni{' '}
          <input type="number" min="1" step="1" value={form.days} onChange={set('days')} style={{ width: '4em' }} />
        </label>{' '}
        <label className="small">Trasporto{' '}
          <select value={form.mode} onChange={set('mode')}><option value="auto">La via più rapida</option><option value="land">Via terra</option><option value="sea">Via mare</option></select>
        </label>
      </div>
      {preview ? (
        preview.ok ? (
          <div className="small">
            <p className="muted">Percorso {preview.route.kind === 'sea' ? 'via mare' : 'via terra'}: {fmt(preview.route.km)} km, {preview.route.days} giorni di viaggio · {fmt(preview.valuePerDay)} ECV al giorno, {fmt(preview.totalValue)} ECV in tutto.</p>
            {preview.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
          </div>
        ) : <p className="warn small">{preview.message}</p>
      ) : <p className="muted small">Scegli nazione e merce per vedere la rotta.</p>}
      <button type="button" className="nation-btn" disabled={!preview?.ok} onClick={() => setMsg(onOpen(order))}>Apri contratto</button>
      <h3>Contratti ({rows.length})</h3>
      {rows.length === 0 ? <p className="muted small">Nessun contratto. Un contratto vende una quantità al giorno al prezzo di listino; la merce arriva dopo il viaggio.</p> : (
        <ul className="build-list">
          {rows.map((r) => (
            <li key={r.id} className="build-row">
              <div>
                <strong>{r.id}</strong> · {r.role} {r.good} · {r.partner} · {fmt(r.perDay)} {r.unit === 'pezzi' ? 'pezzi' : 't'}/giorno · {modeName(r.kind)}
                <div className="muted small">{r.statusName} · consegnate {fmt(r.delivered)}, in viaggio {fmt(r.inTransit)} · pagati {fmt(r.paid)} ECV · viaggio {r.transitDays} giorni · restano {r.daysLeft} giorni{r.shortfallDays ? ` · giorni con consegna parziale: ${r.shortfallDays}` : ''}</div>
              </div>
              {r.canCancel ? <button type="button" className="nation-btn" onClick={() => setMsg(onCancel(r.id))}>Annulla</button> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Versione 1: l'altra nazione accetta sempre; nessun effetto diplomatico, nessun rischio in mare, nessuna capacità dei porti.</p>
    </section>
  );
}
