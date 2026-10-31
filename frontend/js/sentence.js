// Offline sentence helpers: no API key needed.
let RANK = new Map();
export async function loadWords() {
  try { const w = await (await fetch('js/words.json')).json(); RANK = new Map(w.map((x, i) => [x, i])); } catch { /* works without it, just less smart */ }
}
const known = w => RANK.has(w);

/** "ILOVEYOU" -> ["i","love","you"] (only used when the user typed no spaces) */
function segment(s) {
  const n = s.length, cost = Array(n + 1).fill(Infinity), back = Array(n + 1).fill(0); cost[0] = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(0, i - 16); j < i; j++) {
    const w = s.slice(j, i), r = RANK.get(w);
    if (r === undefined || (w.length === 1 && w !== 'a' && w !== 'i') || (w.length === 2 && r > 1500)) continue;
    const c = cost[j] + Math.log(r + 3) + 1.5;
    if (c < cost[i]) { cost[i] = c; back[i] = j; }
  }
  if (!isFinite(cost[n])) return null;
  const out = []; for (let i = n; i > 0; i = back[i]) out.unshift(s.slice(back[i], i));
  const avg = cost[n] / out.length;
  return out.length >= 2 && avg < 7.2 ? out : null;
}

const Q = new Set(['who', 'what', 'where', 'when', 'why', 'how', 'is', 'are', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'may']);
const cap = w => w ? w[0].toUpperCase() + w.slice(1) : w;

/** "ISWARYA IS HERE" -> "Iswarya is here"  (known words lowercase, unknown words = names -> Capitalised) */
export function normalizeText(text) {
  const t = text.replace(/([.?!,])(?=[A-Za-z])/g, '$1 ');          // "animal.xx" -> "animal. xx" (punctuation must not glue words together)
  return t.trim().split(/\s+/).filter(Boolean).map(w => {
    const m = w.match(/^(.*?)([.,?!]*)$/), core = m[1], tail = m[2];
    const l = core.toLowerCase().replace(/_/g, ' ');
    let out;
    if (!core) out = '';
    else if (l === 'i') out = 'I';
    else if (/^i'(m|ll|ve|d)$/.test(l)) out = 'I' + l.slice(1);
    else if (l.length === 1) out = core;                              // a lone letter stays a letter
    else out = RANK.size && !known(l) ? cap(l) : l;                   // known word -> lowercase, unknown -> a name
    return out + tail;
  }).join(' ');
}

export function formSentenceLocal(text) {
  let t = text.trim(); if (!t) return '';
  if (!/\s/.test(t) && /^[a-zA-Z]{6,}$/.test(t)) { const seg = segment(t.toLowerCase()); if (seg) t = seg.join(' '); }
  let s = normalizeText(t).replace(/\s+/g, ' ');
  const first = s.split(' ')[0].toLowerCase();
  s = cap(s);
  return /[.?!]$/.test(s) ? s : s + (Q.has(first) && s.split(' ').length > 1 ? '?' : '.');
}

/** Manual formatting buttons. kind: sentence | title | lower | upper | . | ? | ! | split */
export function applyFormat(text, kind) {
  const t = text.replace(/\s+/g, ' ').trim(); if (!t) return '';
  const strip = s => s.replace(/[.?!]+$/, '');
  switch (kind) {
    case 'sentence': { const s = normalizeText(strip(t)); return cap(s) + (/[.?!]$/.test(t) ? t.slice(-1) : ''); }
    case 'title': return t.split(' ').map(w => cap(w.toLowerCase())).join(' ');
    case 'lower': return t.toLowerCase();
    case 'upper': return t.toUpperCase();
    case '.': case '?': case '!': return strip(t) + kind;
    case 'split': {                       // "ILOVEYOU" -> "I love you" (only for text with no spaces)
      if (/\s/.test(t)) return null;
      const seg = segment(strip(t).toLowerCase()); return seg ? seg.join(' ') : null;
    }
    default: return t;
  }
}
