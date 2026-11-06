// Riepilogo in alto dello stato maggiore: cassa (ECV), uomini disponibili, prontezza, morale, avvisi.
// Icone con etichetta sempre presente. Un dato assente mostra «—» e «dato non disponibile», mai uno zero.
const fmt = (n) => (n === null || n === undefined ? null : n.toLocaleString('it-IT'));

const ITEMS = [
  { key: 'ecv', label: 'ECV', icon: <path d="M12 6v12M9 9.5h4.5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H15" />, circle: true },
  { key: 'men', label: 'Uomini liberi', icon: <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-4 3-6 6-6s6 2 6 6" /> },
  { key: 'readiness', label: 'Prontezza', icon: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />, suffix: '%' },
  { key: 'morale', label: 'Morale', icon: <path d="M8.5 14c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2" />, suffix: '' },
  { key: 'alerts', label: 'Avvisi', icon: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" /> },
];

export default function CommandSummary({ summary }) {
  if (!summary) return null;
  return (
    <div className="cmd-summary" role="group" aria-label="Riepilogo dello stato maggiore">
      {ITEMS.map((it) => {
        const v = summary[it.key];
        const shown = v === null || v === undefined ? null : it.key === 'ecv' || it.key === 'men' ? fmt(v) : `${v}${it.suffix ?? ''}`;
        return (
          <span key={it.key} className={`cmd-sum${it.key === 'alerts' && v > 0 ? ' warn' : ''}`} title={`${it.label}: ${shown ?? 'dato non disponibile'}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="cmd-sum-ico">{it.circle ? <circle cx="12" cy="12" r="8.5" /> : null}{it.icon}</svg>
            <b>{shown ?? '—'}</b>
            <small className="sr-only">{it.label}</small>
          </span>
        );
      })}
    </div>
  );
}
