// Ponti del posto selezionato: stato e azioni (demolisci, ripristina). Le azioni richiedono un'unità propria su una delle due sponde.
export default function BridgeSection({ rows, onDestroy, onRepair }) {
  if (!rows?.length) return null;
  return (
    <section className="bridge-section" aria-label="Ponti">
      <h3>Ponti</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className={`bridge-row bridge-${r.status}`}>
            <div>
              <strong>{r.otherName}</strong>{' '}
              <span>{r.main ? 'fiume principale' : 'fiume minore'}{r.inferred ? ' · ponte ipotetico' : ''}</span>
              <div>{r.label} ({r.intact}/{r.total}){r.blocked ? ' · passaggio bloccato' : ''}{r.daysLeft != null ? ` · ripristino tra ${r.daysLeft} g` : ''}</div>
            </div>
            <div className="bridge-actions">
              {r.canDestroy && <button type="button" onClick={() => onDestroy(r)}>Demolisci</button>}
              {r.canRepair && <button type="button" onClick={() => onRepair(r)}>{`Ripristina${r.repairDays ? ` (${r.repairDays} g)` : ''}`}</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
