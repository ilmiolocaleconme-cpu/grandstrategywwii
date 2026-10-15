import { QUALITY_COLORS } from './geo.js';

const QUALITY_LABEL = { verified: 'verificato', approximate: 'approssimato', hypothesis: 'ipotesi' };
const ISSUE_LABEL = {
  includes_sea: 'il poligono include tratti di mare',
  country_outline_not_provinces: 'contorno nazionale, non province',
  land_only: 'solo terraferma',
  modern_borders: 'confini possibilmente moderni',
  oblast_1922_29_non_banovine: 'suddivisione delle oblast 1922–29, non delle banovine del 1936',
  tracciato_da_immagine: 'tracciato da un\'immagine',
  confini_interni_approssimati: 'confini interni approssimati (~2 km)',
  internal_province_edges: 'confini interni tra province di una stessa nazione approssimati',
  derived_from_neighbor_holes: 'ricavata dai buchi della provincia vicina',
  derived_from_country_outline: 'derivata dal contorno nazionale',
  may_include_sea: 'il poligono può includere tratti di mare',
  capoluogo_fuori_dal_contorno_costiero: 'il capoluogo cade fuori dal contorno costiero',
};

export default function ProvincePanel({ item, nationNames, onClose }) {
  if (!item) {
    return (
      <aside className="panel" aria-live="polite">
        <h2>Nessuna provincia selezionata</h2>
        <p className="muted">Tocca una provincia sulla mappa per vederne i dettagli. Trascina per spostare, pizzica o usa + e − per ingrandire.</p>
      </aside>
    );
  }
  const p = item.props;
  return (
    <aside className="panel" aria-live="polite">
      <div className="panel-head">
        <h2>{p.name}</h2>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </div>
      {p.nameLocal && p.nameLocal !== p.name && <p className="muted">{p.nameLocal}</p>}
      <dl>
        <dt>Nazione</dt><dd>{nationNames[p.owner] ?? p.owner}</dd>
        <dt>Area approssimata</dt><dd>{Math.round(item.areaKm2).toLocaleString('it-IT')} km²</dd>
        <dt>Qualità dei confini</dt>
        <dd><i className="dot" style={{ background: QUALITY_COLORS[p.borderQuality] }} />{QUALITY_LABEL[p.borderQuality] ?? p.borderQuality}</dd>
        <dt>Validità</dt><dd>{p.validFrom} → {p.validTo === '9999-12-31' ? 'oggi' : p.validTo}{p.dateBasis === 'assumed' ? ' (assunta)' : ''}</dd>
        <dt>Fonte</dt><dd>{p.source}</dd>
        <dt>Licenza</dt><dd>{p.license}</dd>
      </dl>
      {p.knownIssues?.length > 0 && (
        <>
          <h3>Limiti noti</h3>
          <ul>{p.knownIssues.map((k) => <li key={k}>{ISSUE_LABEL[k] ?? k}</li>)}</ul>
        </>
      )}
      {p.notes && <p className="muted small">{p.notes}</p>}
    </aside>
  );
}
