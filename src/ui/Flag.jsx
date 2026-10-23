// Bandiera disegnata dai dati di data/flags.json (forme semplici). Decorativa: il nome della nazione sta accanto.
export default function Flag({ flag, className = 'flag' }) {
  if (!flag) return <div className={`${className} flag-missing`} aria-hidden="true" />;
  return (
    <svg className={className} viewBox={`0 0 ${flag.w} ${flag.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      {flag.shapes.map((s, i) => {
        if (s.t === 'rect') return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill} />;
        if (s.t === 'circle') return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />;
        if (s.t === 'polygon') return <polygon key={i} points={s.points} fill={s.fill} />;
        return <path key={i} d={s.d} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth} />;
      })}
    </svg>
  );
}
