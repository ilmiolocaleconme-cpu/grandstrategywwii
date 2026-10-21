import { QUALITY_COLORS } from './geo.js';
import { TERRAIN_COLORS, TERRAIN_LABEL } from '../data/terrain.js';

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

export default function ProvincePanel({ item, nationNames, nationControl, onClose }) {
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
        <dt>Territorio</dt><dd>{nationNames[p.owner] ?? p.owner}</dd>
        {nationControl?.[p.owner] && nationControl[p.owner] !== p.owner && <><dt>Controllato da</dt><dd>{nationNames[nationControl[p.owner]] ?? nationControl[p.owner]}</dd></>}
        <dt>Area approssimata</dt><dd>{Math.round(item.areaKm2).toLocaleString('it-IT')} km²</dd>
        {p.terreno && <><dt>Terreno</dt><dd><i className="dot" style={{ background: TERRAIN_COLORS[p.terreno] }} />{TERRAIN_LABEL[p.terreno] ?? p.terreno}{p.terrenoSecondario ? ` (anche ${(TERRAIN_LABEL[p.terrenoSecondario] ?? p.terrenoSecondario).toLowerCase()})` : ''}{p.kind !== 'citta' ? ' · stima da raster' : ''}</dd></>}
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
