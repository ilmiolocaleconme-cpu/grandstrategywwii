// Simbolo NATO semplificato (cornice per affiliazione + glifo per categoria + barre di scaglione). Logica in src/rules/unitSheet.js.
// Forma E colore cambiano con l'affiliazione: il simbolo si legge anche senza colore. Etichetta accessibile sempre presente.
const COLOR = { amico: '#2f6fb3', nemico: '#b03a2e', neutrale: '#3f7a3a' };

function frame(shape, color) {
  if (shape === 'diamond') return <polygon points="30,4 56,24 30,44 4,24" fill="#efe9d6" stroke={color} strokeWidth="3" />;
  if (shape === 'square') return <rect x="6" y="8" width="48" height="34" fill="#efe9d6" stroke={color} strokeWidth="3" />;
  return <rect x="4" y="8" width="52" height="32" rx="1" fill="#efe9d6" stroke={color} strokeWidth="3" />; // amico: rettangolo
}

function glyph(g, color) {
  if (g === 'x') return <g stroke={color} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="14" x2="42" y2="34" /><line x1="42" y1="14" x2="18" y2="34" /></g>;
  if (g === 'oval') return <ellipse cx="30" cy="24" rx="16" ry="8" fill="none" stroke={color} strokeWidth="3" />;
  if (g === 'oval-x') return <g><ellipse cx="30" cy="24" rx="16" ry="8" fill="none" stroke={color} strokeWidth="3" /><g stroke={color} strokeWidth="2.5"><line x1="22" y1="19" x2="38" y2="29" /><line x1="38" y1="19" x2="22" y2="29" /></g></g>;
  if (g === 'wheel') return <circle cx="30" cy="24" r="7" fill="none" stroke={color} strokeWidth="3" />;
  if (g === 'slash') return <line x1="18" y1="34" x2="42" y2="14" stroke={color} strokeWidth="3" strokeLinecap="round" />;
  return null;
}

export default function NatoSymbol({ spec, size = 48 }) {
  if (!spec) return null;
  const color = COLOR[spec.affiliation] ?? COLOR.neutrale;
  const bars = Array.from({ length: spec.marks }, (_, i) => i);
  return (
    <svg role="img" aria-label={`Simbolo NATO: ${spec.label}`} width={size} height={size * 0.8} viewBox="0 0 60 48" className="nato-symbol">
      {bars.length ? <g fill={color}>{bars.map((i) => <rect key={i} x={30 - (bars.length * 5) / 2 + i * 5} y="0" width="3" height="5" />)}</g> : null}
      {frame(spec.frame, color)}
      {glyph(spec.glyph, color)}
    </svg>
  );
}
