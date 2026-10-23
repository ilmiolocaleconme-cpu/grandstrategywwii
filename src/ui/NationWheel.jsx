import { useRef, useState } from 'react';
import flagsFile from '../../data/flags.json';
import descriptionsFile from '../../data/nation_descriptions.json';
import Flag from './Flag.jsx';
import { clampIndex, slotPose, startIndex, stepFromDrag, visibleSlots } from '../game/nationWheel.js';

/**
 * Ruota di scelta: cinque posti, la nazione al centro sporge e le altre arretrano. Scorre una nazione per volta
 * (trascinando, con ‹ ›, frecce, o toccando una card laterale). Si gioca solo col pulsante sotto; i bloccati restano visibili.
 */
export default function NationWheel({ list, startId, onStart }) {
  const [center, setCenter] = useState(() => startIndex(list, startId));
  const drag = useRef(null);
  const go = (delta) => setCenter((c) => clampIndex(c + delta, list.length));
  const current = list[center];
  const description = descriptionsFile.descriptions[current.id];

  const onPointerDown = (e) => { drag.current = { x: e.clientX, id: e.pointerId, moved: false }; };
  const onPointerMove = (e) => { if (drag.current && Math.abs(e.clientX - drag.current.x) > 8) drag.current.moved = true; };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d) go(stepFromDrag(e.clientX - d.x));
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  };

  return (
    <div className="wheel-wrap">
      <div className="wheel" role="group" aria-roledescription="ruota" aria-label="Nazioni: scorri per sceglierne una" tabIndex={0}
        onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; }}>
        {visibleSlots(center, list.length).map(({ offset, index }) => {
          if (index === null) return null;
          const n = list[index];
          const p = slotPose(offset);
          const style = { transform: `translateX(${p.x}px) translateZ(${p.z}px) rotateY(${p.rotY}deg) scale(${p.scale})`, opacity: p.opacity, zIndex: 10 - Math.abs(offset) };
          const body = (
            <>
              <Flag flag={flagsFile.flags[n.id]} />
              <strong>{n.name}</strong>
              {offset === 0 ? <span className={description ? 'nation-desc' : 'nation-desc muted'}>{n.playable ? (description || 'Descrizione in arrivo') : 'In arrivo: mancano le province'}</span> : null}
            </>
          );
          const cls = `wheel-card${offset === 0 ? ' is-center' : ''}${n.playable ? '' : ' is-locked'}`;
          return offset === 0 ? (
            <div key={n.id} className={cls} style={style} aria-current="true">{body}</div>
          ) : (
            <button key={n.id} type="button" className={cls} style={style} onClick={() => go(offset)} aria-label={`${n.name}${n.playable ? '' : ' (in arrivo)'}: porta al centro`}>{body}</button>
          );
        })}
      </div>
      <div className="wheel-actions">
        <button type="button" className="nation-btn" onClick={() => go(-1)} disabled={center === 0} aria-label="Nazione precedente">‹</button>
        <button type="button" className="nation-btn wheel-play" onClick={() => onStart(current.id)} disabled={!current.playable}>
          {current.playable ? `Gioca con ${current.name}` : `${current.name}: in arrivo`}
        </button>
        <button type="button" className="nation-btn" onClick={() => go(1)} disabled={center === list.length - 1} aria-label="Nazione successiva">›</button>
      </div>
    </div>
  );
}
