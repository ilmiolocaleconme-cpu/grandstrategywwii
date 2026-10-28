import { useMemo } from 'react';
import { QUALITY_COLORS } from './geo.js';
import { TERRAIN_LABEL } from '../data/terrain.js';
import { RESOURCE_META } from '../data/provinceResources.js';
import { provinceEntry } from '../data/provinceData.js';
import { installedMegawatts } from '../data/hydro.js';
import { buildProvinceView } from '../rules/provinceView.js';

const ISSUE_LABEL = {
  includes_sea: 'il poligono include tratti di mare',
  divisione_ipotetica_in_3_province: 'provincia ipotetica: la regione è stata divisa in 3 unendo province attuali',
  taglio_curvo_ipotetico: 'confine interno tracciato come taglio curvo ipotetico',
  raggruppata_da_unita_attuali: 'raggruppata da province attuali (confini moderni)',
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

const TONE_ICON = { good: '🟢', ok: '🟢', warn: '🟡', bad: '🔴', na: '⚪' };

function Card({ card, quality }) {
  return (
    <details className={`pv-card pv-${card.level.toLowerCase()}`} open={card.open}>
      <summary>
        <span className="pv-title">{card.title}</span>
        <span className={`pv-chip tone-${card.status.tone}`}>{TONE_ICON[card.status.tone]} {card.status.label}</span>
        {card.main && <span className="pv-main"><span className="muted small">{card.main.label}</span> <b>{card.main.value}</b></span>}
      </summary>
      <div className="pv-body">
        {card.lines?.map((l) => <p key={l} className="pv-line">{l}</p>)}
        {card.metrics.length > 0 && (
          <dl className="pv-metrics">
            {card.metrics.map((m) => <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>)}
          </dl>
        )}
        {card.modifiers.length > 0 && <ul className="pv-mods">{card.modifiers.map((m) => <li key={m}>{m}</li>)}</ul>}
        {card.details.length > 0 && (
          <dl className="pv-details">
            {card.details.map((d) => <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>)}
          </dl>
        )}
        {card.id === 'data' && (
          <>
            {quality && <p className="small"><i className="dot" style={{ background: QUALITY_COLORS[quality] }} />Qualità dei confini: {card.status.label}</p>}
            {card.knownIssues?.length > 0 && (
              <>
                <h3>Limiti noti</h3>
                <ul>{card.knownIssues.map((k) => <li key={k}>{ISSUE_LABEL[k] ?? k}</li>)}</ul>
              </>
            )}
            {card.notes && <p className="muted small">{card.notes}</p>}
          </>
        )}
      </div>
    </details>
  );
}

function ProvinceBody({ item, nationNames, nationControl, provinceResources, provinceData, linkStats, hydro, game, onClose }) {
  const p = item.props;
  const motherId = p.parentProvince ?? p.id;
  const resourceIds = provinceResources?.[p.id] ?? provinceResources?.[p.parentProvince] ?? [];
  const date = game?.date ?? '1936-01-01';
  const view = useMemo(() => buildProvinceView({
    props: p,
    areaKm2: item.areaKm2,
    nationNames,
    nationControl,
    state: game ?? null,
    terrainLabel: p.terreno ? (TERRAIN_LABEL[p.terreno] ?? p.terreno) : null,
    resourceLabels: resourceIds.map((r) => RESOURCE_META[r]?.label ?? r),
    population: provinceEntry(provinceData?.population, p),
    agriculture: provinceEntry(provinceData?.agriculture, p),
    military: provinceEntry(provinceData?.military, p),
    linkStats: linkStats?.get(motherId) ?? (linkStats ? { links: 0, rail: 0, road: 0 } : null),
    hydroMw: hydro ? installedMegawatts(hydro, date, { provinceId: motherId }) : null,
  }), [item, p, nationNames, nationControl, game, resourceIds, provinceData, linkStats, hydro, date, motherId]);
  const { header, alert, cards } = view;
  return (
    <aside className="panel pv" aria-live="polite">
      <header className="pv-head">
        <div className="panel-head">
          <h2>{header.name}</h2>
          <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
        </div>
        {header.nameLocal && <p className="muted">{header.nameLocal}</p>}
        <p className="pv-owner">{header.ownerName}</p>
        <p className="pv-control">Controllo: <b>{header.controllerName}</b> · <span className={`tone-${header.status.tone}`}>Stato: {header.status.label}</span></p>
        <ul className="pv-ind">
          {header.indicators.map((i) => (
            <li key={i.id} className={`tone-${i.tone}`}><span className="muted small">{i.label}</span><b>{i.value}</b></li>
          ))}
        </ul>
      </header>
      {alert && <div className={`pv-alert tone-${alert.tone}`} role="alert">⚠ {alert.label}</div>}
      {cards.map((c) => <Card key={c.id} card={c} quality={c.id === 'data' ? p.borderQuality : null} />)}
    </aside>
  );
}

/**
 * Pannello della provincia: intestazione sempre visibile, Panoramica, schede espandibili ordinate per priorità
 * (docs/DESIGN_PANNELLO_PROVINCIA.md). Il pannello esiste solo su richiesta (pulsante «i» nell'angolo della mappa).
 */
export default function ProvincePanel({ item, nationNames, nationControl, provinceResources, provinceData, linkStats, hydro, game, onClose }) {
  if (!item) return null;
  return <ProvinceBody item={item} nationNames={nationNames} nationControl={nationControl} provinceResources={provinceResources} provinceData={provinceData} linkStats={linkStats} hydro={hydro} game={game} onClose={onClose} />;
}
