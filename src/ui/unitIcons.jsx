// Icone e illustrazioni disegnate in SVG per il pannello Divisioni (18/11/2026). Originali, nessuna immagine esterna: funzionano offline.
// Colore da `currentColor`; le illustrazioni usano una tavolozza seppia.

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  // elmetto
  infantry: <><path d="M4 15c0-5 3.6-9 8-9s8 4 8 9" {...S} /><path d="M2.5 15.5h19l-1.5 2.5H5z" fill="currentColor" stroke="none" /></>,
  // autocarro
  motorized_infantry: <><path d="M2 7h11v9H2zM13 10h4.5l3 3v3H13z" {...S} /><circle cx="6" cy="17.5" r="1.8" fill="currentColor" /><circle cx="17" cy="17.5" r="1.8" fill="currentColor" /></>,
  // semicingolato
  mechanized_infantry: <><path d="M3 9h12l2 3h4v3H3z" {...S} /><path d="M7 15h11a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4z" {...S} /><circle cx="4.5" cy="17.5" r="1.6" fill="currentColor" /></>,
  // carro
  tank: <><path d="M6 10h9l1.5 3H4.5z" fill="currentColor" stroke="none" /><path d="M14 11h8" {...S} /><path d="M4 14h16a2.5 2.5 0 0 1 0 5H4a2.5 2.5 0 0 1 0-5z" {...S} /><circle cx="7" cy="16.5" r="1" fill="currentColor" /><circle cx="12" cy="16.5" r="1" fill="currentColor" /><circle cx="17" cy="16.5" r="1" fill="currentColor" /></>,
  // cacciacarri: casamatta bassa e cannone lungo
  anti_tank: <><path d="M4 11h11l2 3H3z" fill="currentColor" stroke="none" /><path d="M12 12h10" {...S} /><path d="M4 14.5h15a2.3 2.3 0 0 1 0 4.6H4a2.3 2.3 0 0 1 0-4.6z" {...S} /></>,
  // obice
  artillery: <><path d="M3 9l11 5" {...S} strokeWidth={2.6} /><circle cx="14" cy="16" r="3.2" {...S} /><path d="M14 16l7 3M11 18l-3 3" {...S} /></>,
  // chiave inglese: supporto e servizi
  support: <><path d="M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4 16.4 7.6 20l6.3-6.3A4.5 4.5 0 0 0 20 9.5l-2.7 2.7-3.2-.8-.8-3.2L16 5.5a4.5 4.5 0 0 0-1.5-1.5z" {...S} /></>,
  men: <><circle cx="9" cy="7" r="3" {...S} /><path d="M3 20c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5" {...S} /><circle cx="17" cy="8" r="2.4" {...S} /><path d="M16 13.6c3 .2 5 2.4 5 6" {...S} /></>,
  horse: <><path d="M5 20v-6c0-3 2-5 5-5h3l2-4 1 2 3 1-1 3h-2l-1 2v7M9 20v-5" {...S} /></>,
  truck: <><path d="M2 7h11v9H2zM13 10h4.5l3 3v3H13z" {...S} /><circle cx="6" cy="17.5" r="1.8" fill="currentColor" /><circle cx="17" cy="17.5" r="1.8" fill="currentColor" /></>,
  fire: <><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1.5 1.5 2 2 2 .3-2.5-.2-4.5 1-7z" {...S} /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" {...S} /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" {...S} /><path d="M8 11V8a4 4 0 0 1 8 0v3" {...S} /></>,
  plus: <path d="M12 5v14M5 12h14" {...S} strokeWidth={2.4} />,
  back: <path d="M20 12H5M11 5l-7 7 7 7" {...S} strokeWidth={2.6} />,
  check: <path d="M4 12.5l5 5L20 6.5" {...S} strokeWidth={2.6} />,
  reset: <><path d="M20 11a8 8 0 1 0-2.3 5.7" {...S} /><path d="M20 4v7h-7" {...S} /></>,
  swap: <><path d="M4 8h14l-3-3M20 16H6l3 3" {...S} /></>,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></>,
};
const CATEGORY_ICON = { infantry: 'infantry', motorized: 'motorized_infantry', mechanized: 'mechanized_infantry', armored: 'tank' };

export function Icon({ name, size = 22, title, className }) {
  const key = PATHS[name] ? name : (CATEGORY_ICON[name] ?? 'infantry');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {PATHS[key]}
    </svg>
  );
}

// ---- Illustrazioni di testata: sagome su cielo seppia, una per categoria -------------------------------------------------------------------
const soldier = (x, y, s = 1, k = 0) => (
  <g key={`s${k}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0-30c-3 0-6 2-6 5h12c0-3-3-5-6-5z" /><circle cx="0" cy="-22" r="3.3" />
    <path d="M-5-19h10l2 13h-3l-1 14h-3l-1-11-1 11h-3l-1-14h-3z" /><path d="M5-15l16-7 .8 1.6-15 8z" />
  </g>
);
const tank = (x, y, s = 1, k = 0) => (
  <g key={`t${k}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-34-4h68a6 6 0 0 1 0 12h-68a6 6 0 0 1 0-12z" /><path d="M-30-14h52l6 10h-64z" /><path d="M-14-24h22l4 10h-30z" /><path d="M8-21h44v3H8z" />
  </g>
);
const truck = (x, y, s = 1, k = 0) => (
  <g key={`k${k}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-30-24h38v20h-38z" /><path d="M10-18h12l8 8v6h-20z" /><circle cx="-20" cy="0" r="5" /><circle cx="18" cy="0" r="5" /><path d="M-32-4h64v2h-64z" />
  </g>
);
const ruins = <path d="M0 140V96h18v-12h10v12h14V70h8v-8h6v8h10v70zM420 140V88h12V72h10v16h20v-26h8v10h10v80z" opacity="0.35" />;

export function Banner({ category }) {
  const fig = category === 'armored' ? [tank(140, 118, 1.25, 1), tank(300, 112, 0.9, 2), soldier(410, 120, 0.9, 3), soldier(436, 122, 0.85, 4)]
    : category === 'motorized' ? [truck(120, 120, 1.2, 1), truck(260, 116, 0.95, 2), soldier(380, 122, 0.95, 3), soldier(410, 124, 0.9, 4), soldier(440, 121, 0.9, 5)]
      : category === 'mechanized' ? [tank(130, 118, 1.0, 1), truck(280, 118, 1.0, 2), soldier(390, 122, 0.95, 3), soldier(420, 124, 0.9, 4)]
        : [70, 120, 170, 225, 280, 335, 390, 440].map((x, i) => soldier(x, 122 + (i % 2) * 4, 1 - (i % 3) * 0.08, i));
  return (
    <svg className="de-banner" viewBox="0 0 520 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="de-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9b98f" /><stop offset="0.7" stopColor="#8e7f5c" /><stop offset="1" stopColor="#4d4632" /></linearGradient>
        <radialGradient id="de-smoke" cx="0.75" cy="0.3" r="0.6"><stop offset="0" stopColor="#efe4c4" stopOpacity="0.55" /><stop offset="1" stopColor="#efe4c4" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="520" height="140" fill="url(#de-sky)" />
      <rect width="520" height="140" fill="url(#de-smoke)" />
      <g fill="#2b2619">{ruins}</g>
      <path d="M0 128c80-8 160 6 260-2s180 6 260-4v18H0z" fill="#2b2619" />
      <g fill="#1d1a12">{fig}</g>
    </svg>
  );
}
