// Menu a tendina della barra in alto («Livelli» e «Menu»): un pulsante che apre un pannello, si chiude toccando fuori, con Esc o scegliendo una voce.
// Solo interfaccia: nessuno stato di gioco. children può essere una funzione (close) => nodo per chiudere dopo la scelta.
import { useEffect, useRef, useState } from 'react';

export function Popover({ label, badge = null, active = false, align = 'left', title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="pop" ref={ref}>
      <button type="button" className={`pop-btn${active || open ? ' on' : ''}`} aria-haspopup="true" aria-expanded={open} title={title} onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>{badge ? <span className="pop-badge">{badge}</span> : null}<span aria-hidden="true" className="pop-caret">▾</span>
      </button>
      {open ? <div className={`pop-panel ${align}`}>{typeof children === 'function' ? children(close) : children}</div> : null}
    </div>
  );
}

/** Voce del pannello: con «checked» (booleano) è un interruttore o una scelta con la spunta, altrimenti un'azione. */
export function PopItem({ children, checked, onClick, disabled = false }) {
  const toggle = typeof checked === 'boolean';
  return (
    <button type="button" className={`pop-item${toggle && checked ? ' on' : ''}`} aria-pressed={toggle ? checked : undefined} disabled={disabled} onClick={onClick}>
      {toggle ? <span className="pop-check" aria-hidden="true">{checked ? '✓' : ''}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export const PopSection = ({ title, children }) => (
  <section className="pop-section" aria-label={title}><h3>{title}</h3><div>{children}</div></section>
);
