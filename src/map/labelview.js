// Nomi sulla mappa da posizioni già calcolate (data/labels.json, scripts/labels-compute.js): nessun calcolo di forme
// a runtime, solo scelta per zoom e vista. Il nome è «scritto sul territorio»: il corpo è in unità di mappa, quindi
// cresce con lo zoom; compare quando supera il corpo minimo (in pixel) ed è limitato dal corpo massimo.
//   - nazioni: da zoom basso, finché non subentrano le province (le piccole compaiono solo ingrandendo);
//   - province: da `provMinK` in su, con la variante più leggibile (intero, due righe, sigla);
//   - mari: da `seaMinK` in su (solo se il livello ⚓ è attivo).
// Funzioni pure, provate con node (tests/labelview.test.js).
import { TEXT_H, LINE_STEP } from './labelfit.js';

export const LABEL_DEFAULTS = {
  nationMinPx: 9, nationMaxPx: 26, nationMaxK: 8, // nazioni: oltre `nationMaxK` lasciano il posto alle province
  provMinPx: 5, provMaxPx: 20, provMinK: 8, comfortPx: 8, abbrMinPx: 7, abbrMaxPx: 11,
  seaMinPx: 7, seaMaxPx: 20, seaMinK: 3,
};

const ABBR_NONE = null;

/**
 * Nomi da disegnare con la vista corrente. `view` {k,x,y}, `vb` {x,y,w,h} del viewBox, `pxPerUnit` pixel per unità di
 * viewBox (senza zoom), `offsets` copie del mondo visibili. `opts.showSeas`: livello dei mari attivo.
 * Ogni voce: { id, kind ('nation'|'prov'|'sea'), name, x, y, off, angle, size, length, lines, lineLengths, abbr, rect }.
 */
export function pickStaticLabels(file, view, vb, pxPerUnit, offsets = [0], opts = {}) {
  const o = { ...LABEL_DEFAULTS, ...opts };
  const sx = view.k * pxPerUnit; // pixel per unità di mappa
  const W = vb.w * pxPerUnit;
  const H = vb.h * pxPerUnit;
  const out = [];
  const usedAbbr = new Set(); // una sigla già mostrata non si ripete: meglio nessun nome che uno ambiguo

  // Posizione e ingombro in pixel; null se il nome sta fuori vista.
  const place = (e, form, fontPx, charW, off) => {
    const n = form.l.length;
    const longest = Math.max(...form.l.map((l) => l.length));
    const w = longest * fontPx * charW;
    const h = fontPx * (TEXT_H + (n - 1) * LINE_STEP);
    const cx = (view.k * (form.x + off) + view.x - vb.x) * pxPerUnit;
    const cy = (view.k * form.y + view.y - vb.y) * pxPerUnit;
    const a = (form.r * Math.PI) / 180;
    const hx = (w / 2) * Math.abs(Math.cos(a)) + (h / 2) * Math.abs(Math.sin(a));
    const hy = (w / 2) * Math.abs(Math.sin(a)) + (h / 2) * Math.abs(Math.cos(a));
    if (cx + hx < 0 || cx - hx > W || cy + hy < 0 || cy - hy > H) return null;
    return { id: e.id, name: form.l.join(' '), x: form.x, y: form.y, off, angle: form.r, size: fontPx / sx, length: w / sx, rect: [cx - hx - 2, cy - hy - 1, cx + hx + 2, cy + hy + 1], lines: form.l, lineLengths: form.l.map((l) => (l.length * fontPx * charW) / sx), abbr: Boolean(form.a) };
  };

  const single = (list, kind, charW, minPx, maxPx, off) => {
    for (const e of list) {
      const fontPx = Math.min(e.s * sx, maxPx);
      if (e.s * sx < minPx) continue;
      const rec = place(e, e, fontPx, charW, off);
      if (rec) out.push({ ...rec, kind });
    }
  };

  for (const off of offsets) {
    if (view.k < o.nationMaxK) single(file.nations, 'nation', file.charW.nations, o.nationMinPx, o.nationMaxPx, off);
    if (opts.showSeas !== false && view.k >= o.seaMinK) single(file.seas, 'sea', file.charW.seas, o.seaMinPx, o.seaMaxPx, off);
    if (view.k < o.provMinK) continue;
    const charW = file.charW.provinces;
    for (const p of file.provinces) {
      // ordine delle varianti: intero, due righe, sigle. Vince la prima con corpo comodo; se nessuna lo è, la non-sigla con il corpo
      // più grande (>= minimo); la sigla solo se non entra nessun'altra forma.
      let chosen = null;
      let abbrChoice = ABBR_NONE;
      for (const form of p.f) {
        const fontPx = Math.min(form.s * sx, o.provMaxPx);
        if (form.s * sx < o.provMinPx) continue;
        if (form.a) {
          if (!abbrChoice && form.s * sx >= o.abbrMinPx && !usedAbbr.has(form.l[0])) abbrChoice = { form, fontPx: Math.min(fontPx, o.abbrMaxPx) };
          continue;
        }
        if (!chosen || fontPx > chosen.fontPx) chosen = { form, fontPx };
        if (fontPx >= o.comfortPx) break;
      }
      if (!chosen) chosen = abbrChoice;
      if (!chosen) continue;
      const rec = place(p, chosen.form, chosen.fontPx, charW, off);
      if (!rec) continue;
      if (chosen.form.a) usedAbbr.add(chosen.form.l[0]);
      out.push({ ...rec, kind: 'prov' });
    }
  }
  return out;
}
