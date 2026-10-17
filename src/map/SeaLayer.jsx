import { memo, useMemo } from 'react';
import { ringToPath, project } from './geo.js';
import { seaLabels } from './seaView.js';

export { seaLabels };

const KIND_LABEL = { ocean: 'oceano', sea: 'mare', gulf: 'golfo', strait: 'stretto', approach: 'approdo' };

/** Modello di disegno delle zone marittime: percorso SVG (anelli pari-dispari: i buchi sono isole) e punto del nome. */
export function buildSeaModel(file) {
  return file.zones.map((z) => ({
    id: z.id,
    name: z.name,
    kind: z.kind,
    strategic: Boolean(z.strategic),
    d: z.rings.map((r) => ringToPath(r, 0.03)).join(''),
    at: project(z.seed[0], z.seed[1]),
  }));
}

// Sotto le province: la terra copre i bordi imprecisi, l'acqua resta visibile.
export const SeaLayer = memo(function SeaLayer({ model, selectedId, px, onPick }) {
  return (
    <>
      {model.map((z) => (
        <path
          key={z.id}
          d={z.d}
          fillRule="evenodd"
          className={`sea-zone ${z.kind}${z.id === selectedId ? ' selected' : ''}`}
          strokeWidth={(z.id === selectedId ? 2 : 0.8) * px}
          data-id={z.id}
          onClick={() => onPick(z.id)}
        />
      ))}
    </>
  );
});

export function SeaPanel({ zone, byId, onClose, onSelect }) {
  if (!zone) return null;
  return (
    <aside className="panel" aria-live="polite">
      <div className="panel-head">
        <h2>{zone.name}</h2>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </div>
      <p className="muted">{KIND_LABEL[zone.kind] ?? zone.kind} · {zone.region}{zone.strategic ? ' · strategica' : ''}</p>
      {zone.note ? <p>{zone.note}</p> : null}
      <dl>
        <dt>Area</dt><dd>~{Math.round(zone.areaKm2).toLocaleString('it-IT')} km²</dd>
        <dt>Coste</dt><dd>{zone.coastal.length} province affacciate</dd>
      </dl>
      <h3>Zone confinanti</h3>
      <ul>
        {zone.neighbors.map(([id, km]) => (
          <li key={id}><button type="button" className="linklike" onClick={() => onSelect(id)}>{byId.get(id)?.name ?? id}</button> <span className="muted small">~{km} km di contatto</span></li>
        ))}
      </ul>
      <p className="muted small">Qualità: ipotesi. Le zone sono una divisione di gioco (flotte, rotte, commercio), non storica; i confini seguono la distanza via mare dai punti scelti.</p>
    </aside>
  );
}

export function useSeaIndex(file) {
  return useMemo(() => new Map((file?.zones ?? []).map((z) => [z.id, z])), [file]);
}
