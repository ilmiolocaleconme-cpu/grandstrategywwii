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
  gau_nsdap: 'Gau NSDAP (distretto di partito), non una divisione amministrativa',
  riferimento_mappa_1937: 'riferimento: mappa del 31.12.1937, non del 1° gennaio 1936',
  suddivisione_moderna_non_1936: 'suddivisione amministrativa moderna, non quella del 1936',
  unita_storica_ricostruita: 'unità storica ricostruita da suddivisioni moderne',
  allineato_ai_vicini_su_raster: 'confini verso i vicini ricalcolati sui loro tracciati (raster 0,0025°)',
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

const BASIS = {
  curated_unverified: 'da elenco curato, non verificato',
  unknown_assumed_false: 'sconosciuta, assunta non navigabile',
  proxy_from_natural_earth_scalerank: 'stimata dall\'importanza cartografica',
  curated: 'corretta a mano',
  derived_from_geometry: 'ricavata dalla geometria',
  derived_from_geometry_uncertain: 'ricavata dalla geometria, incerta',
  none_in_area: 'nessuna foce vicina nell\'area studiata',
};
const CLASS_LABEL = { main: 'principale', secondary: 'secondario', tributary: 'affluente' };
const WIDTH_LABEL = { large: 'larga', medium: 'media', small: 'stretta' };

export function RiverPanel({ river, rivers, onClose }) {
  const into = river.flowsInto ? rivers.find((r) => r.id === river.flowsInto) : null;
  const tributaries = rivers.filter((r) => r.flowsInto === river.id).map((r) => r.name);
  return (
    <aside className="panel" aria-live="polite">
      <div className="panel-head">
        <h2>{river.name}</h2>
        <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
      </div>
      {river.nameLocal && river.nameLocal !== river.name && <p className="muted">{river.nameLocal}</p>}
      <dl>
        <dt>Tipo</dt><dd>{CLASS_LABEL[river.class] ?? river.class}</dd>
        <dt>Confluisce in</dt><dd>{into ? into.name : 'mare, lago o fuori area'} <span className="muted small">({BASIS[river.flowsIntoBasis] ?? river.flowsIntoBasis})</span></dd>
        <dt>Lunghezza (area)</dt><dd>{river.lengthKm.toLocaleString('it-IT')} km</dd>
        <dt>Navigabile</dt><dd>{river.navigable ? 'sì' : 'no'} <span className="muted small">({BASIS[river.navigableBasis] ?? river.navigableBasis})</span></dd>
        <dt>Larghezza</dt><dd>{WIDTH_LABEL[river.widthClass] ?? river.widthClass} <span className="muted small">({BASIS[river.widthBasis] ?? river.widthBasis})</span></dd>
        {tributaries.length > 0 && (<><dt>Affluenti</dt><dd>{tributaries.slice(0, 8).join(', ')}{tributaries.length > 8 ? `, +${tributaries.length - 8}` : ''}</dd></>)}
        <dt>Fonte</dt><dd>{river.source}</dd>
        <dt>Licenza</dt><dd>{river.license}</dd>
      </dl>
      <h3>Limiti noti</h3>
      <ul>
        <li>corso moderno, non quello del 1936</li>
        <li>linea generalizzata (scala 1:10 milioni)</li>
        <li>nessun ponte, guado o traghetto ancora nei dati</li>
        {river.knownIssues?.includes('confluence_uncertain') && <li>confluenza incerta</li>}
      </ul>
    </aside>
  );
}
