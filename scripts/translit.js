// Traslitterazione in alfabeto latino dei nomi originali (russo, ucraino, greco), per i nomi delle città.
// Russo: BGN/PCGN semplificato (senza segni diacritici); ucraino: traslitterazione nazionale 2010; greco: ELOT 743 semplificato
// (senza accenti). L'arabo non si traslittera qui: le vocali mancano nella scrittura, il risultato sarebbe inventato.

const RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const UK = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', 'ʼ': '', '’': '' };
const UK_INITIAL = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function cyr(text, map, initial = {}) {
  let out = '';
  let start = true; // inizio di parola
  for (const ch of text) {
    const low = ch.toLowerCase();
    const isUpper = ch !== low;
    const m = start && initial[low] !== undefined ? initial[low] : map[low];
    if (m === undefined) { out += ch; start = /[\s\-]/.test(ch); continue; }
    out += isUpper ? cap(m) : m;
    start = false;
  }
  return out;
}

export const cyrillicToLatin = (text, lang = 'ru') => (lang === 'uk' ? cyr(text, UK, UK_INITIAL) : cyr(text, RU));

const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
const GR_PAIRS = { αι: 'e', ει: 'i', οι: 'i', υι: 'i', ου: 'ou', αυ: 'av', ευ: 'ev', γγ: 'ng', γκ: 'g', μπ: 'b', ντ: 'd' };

export function greekToLatin(text) {
  const t = text.normalize('NFD').replace(/\p{M}/gu, '');
  let out = '';
  for (let i = 0; i < t.length; i += 1) {
    const two = t.slice(i, i + 2).toLowerCase();
    if (GR_PAIRS[two] !== undefined) { const m = GR_PAIRS[two]; out += t[i] !== t[i].toLowerCase() ? cap(m) : m; i += 1; continue; }
    const ch = t[i];
    const low = ch.toLowerCase();
    const m = GR[low];
    out += m === undefined ? ch : (ch !== low ? cap(m) : m);
  }
  return out;
}
