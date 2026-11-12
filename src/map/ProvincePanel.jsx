import { useEffect, useMemo, useState } from 'react';
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

// Provincia intera = somma delle sponde (decisione dell'utente 11/11/2026): totali e dettaglio per sponda. Si costruisce sulle sponde.
function WholeProvince({ sum, resourceLabel }) {
  const deposits = Object.entries(sum.total.deposits);
  return (
    <section className="pv-whole" aria-label={`Provincia intera: ${sum.name}`}>
      <ul className="pv-ind">
        <li><span className="muted small">Sponde</span><b>{sum.banks.length}</b></li>
        <li><span className="muted small">Slot</span><b>{sum.total.used}/{sum.total.slots}</b></li>
        <li><span className="muted small">Impianti</span><b>{sum.total.factories}</b></li>
      </ul>
      {deposits.length ? <p className="small">Giacimenti (miniere al massimo): {deposits.map(([r, t]) => `${resourceLabel(r)} +${Math.round(t)} t/g`).join(' · ')}</p> : null}
      <ul className="pv-banks">
        {sum.banks.map((b) => (
          <li key={b.id}><b>{b.name}</b><span className="muted small">slot {b.used}/{b.slots} · impianti {b.factories}{Object.keys(b.mines).length ? ` · miniere ${Object.entries(b.mines).map(([r, l]) => `${resourceLabel(r)} L${l}`).join(', ')}` : ''}</span></li>
        ))}
      </ul>
      {sum.legacy ? <p className="muted small">Costruito sulla provincia prima delle sponde: impianti {sum.legacy.factories}, slot {sum.legacy.used} (contati nel totale).</p> : null}
      <p className="muted small">Si costruisce su una sponda: torna alla sponda per i lavori.</p>
    </section>
  );
}

function ProvinceBody({ item, nationNames, nationControl, provinceResources, provinceData, linkStats, hydro, game, onClose, build = null, hqs = null, onOpenHq = null, sum = null }) {
  const [whole, setWhole] = useState(false);
  useEffect(() => { setWhole(false); }, [item?.id]);
  const showWhole = whole && sum !== null;
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
          <h2>{showWhole ? sum.name : header.name}</h2>
          {sum ? (
            <button type="button" className={`pv-whole-toggle${showWhole ? ' on' : ''}`} aria-pressed={showWhole} title={showWhole ? 'Torna alla sponda toccata' : 'Vedi la provincia intera: somma delle sponde'} onClick={() => setWhole((v) => !v)}>
              {showWhole ? 'Sponda' : 'Provincia'}
            </button>
          ) : null}
          <button type="button" className="close" aria-label="Chiudi" onClick={onClose}>×</button>
        </div>
        {header.nameLocal && <p className="muted">{header.nameLocal}</p>}
        <p className="pv-owner">{header.ownerName}</p>
        <p className="pv-control">Controllo: <b>{header.controllerName}</b> · <span className={`tone-${header.status.tone}`}>Stato: {header.status.label}</span></p>
        {showWhole ? null : <ul className="pv-ind">
          {header.indicators.map((i) => (
            <li key={i.id} className={`tone-${i.tone}`}><span className="muted small">{i.label}</span><b>{i.value}</b></li>
          ))}
        </ul>}
      </header>
      {alert && <div className={`pv-alert tone-${alert.tone}`} role="alert">⚠ {alert.label}</div>}
      {showWhole ? <WholeProvince sum={sum} resourceLabel={(r) => RESOURCE_META[r]?.label ?? r} /> : build}
      {cards.map((c) => <Card key={c.id} card={c} quality={c.id === 'data' ? p.borderQuality : null} />)}
      {hqs && hqs.length && onOpenHq ? (
        <section className="pv-hq" aria-label="Comandi stimati in questa provincia">
          <h3>Comandi</h3>
          <ul>{hqs.map((h) => <li key={h.id}><button type="button" onClick={() => onOpenHq(h.id)}>{h.name}</button> <small className="muted">{h.estimated ? `posizione stimata: ${h.inProvince} di ${h.basedOn} divisioni sottostanti sono qui` : 'posizione nota'}</small></li>)}</ul>
        </section>
      ) : null}
    </aside>
  );
}

/**
 * Pannello della provincia: intestazione sempre visibile, Panoramica, schede espandibili ordinate per priorità
 * (docs/DESIGN_PANNELLO_PROVINCIA.md). Il pannello esiste solo su richiesta (pulsante «i» nell'angolo della mappa).
 */
export default function ProvincePanel({ item, nationNames, nationControl, provinceResources, provinceData, linkStats, hydro, game, onClose, build = null, hqs = null, onOpenHq = null, sum = null }) {
  if (!item) return null;
  return <ProvinceBody item={item} nationNames={nationNames} nationControl={nationControl} provinceResources={provinceResources} provinceData={provinceData} linkStats={linkStats} hydro={hydro} game={game} onClose={onClose} build={build} hqs={hqs} onOpenHq={onOpenHq} sum={sum} />;
}
