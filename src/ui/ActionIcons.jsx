// Icone delle azioni sulle unità, disegnate in SVG (decisione dell'utente 10/11/2026): uguali su ogni telefono, niente emoji.
// «i» = scheda dell'unità, catena unita = Inquadra in un comando, catena spezzata = Scollega, bandierina = Supporto.
// Decorative: l'etichetta sta sempre sul pulsante (aria-label o testo accanto).

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' };

export function InfoIcon({ size = 22 }) {
  return <svg {...base} width={size} height={size}><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5h.01" strokeWidth="2.6" /></svg>;
}

export function LinkIcon({ size = 22 }) {
  return <svg {...base} width={size} height={size}><path d="M10 14a3.5 3.5 0 0 0 5 0l3.5-3.5a3.5 3.5 0 0 0-5-5L12.5 6.5" /><path d="M14 10a3.5 3.5 0 0 0-5 0l-3.5 3.5a3.5 3.5 0 0 0 5 5l1-1" /></svg>;
}

export function UnlinkIcon({ size = 22 }) {
  return <svg {...base} width={size} height={size}><path d="M15.5 13.5l3-3a3.5 3.5 0 0 0-5-5l-3 3" /><path d="M8.5 10.5l-3 3a3.5 3.5 0 0 0 5 5l3-3" /><path d="M4 4l3 3M20 20l-3-3M9 3v2M3 9h2M15 21v-2M21 15h-2" /></svg>;
}

export function SupportIcon({ size = 20 }) {
  return <svg {...base} width={size} height={size}><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></svg>;
}
