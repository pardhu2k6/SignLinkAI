const BASE = window.SIGNLINK_API || '';   // set window.SIGNLINK_API in index.html if the backend is hosted elsewhere
let backendUp = null;

async function call(path, opts = {}, ms = 30000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  let r; try { r = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, ...opts }); } catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); } finally { clearTimeout(timer); }
  if (!r.ok) { let d = ''; try { d = (await r.json()).detail || ''; } catch {} throw new Error(d || `${r.status}`); }
  return opts.raw ? r : r.json();
}
export async function backendAvailable() {
  if (backendUp === null) { try { await call('/api/health'); backendUp = true; } catch { backendUp = false; } }
  return backendUp;
}

// history: falls back to localStorage so the static (Netlify) build still works
const LS = 'signlink_history';
const lsGet = () => JSON.parse(localStorage.getItem(LS) || '[]');
export async function addHistory(sign, sentence) {
  if (await backendAvailable()) return call('/api/history', { method: 'POST', body: JSON.stringify({ sign, sentence }) }).catch(() => {});
  const h = lsGet(); h.unshift({ id: Date.now(), sign, sentence, created_at: Date.now() / 1000 }); localStorage.setItem(LS, JSON.stringify(h.slice(0, 500)));
}
export async function getHistory() { return (await backendAvailable()) ? call('/api/history') : lsGet(); }
export async function clearHistory() { if (await backendAvailable()) await call('/api/history', { method: 'DELETE' }); localStorage.removeItem(LS); }
export async function exportHistoryCsv() {
  const rows = await getHistory();
  const esc = s => `"${String(s).replace(/"/g, '""')}"`;
  const csv = 'sign,sentence,time\n' + rows.map(r => [r.sign, r.sentence, new Date(r.created_at * 1000).toLocaleString()].map(esc).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'signlink_history.csv'; a.click();
}


import { formSentenceLocal, normalizeText } from './sentence.js';

const GTX = (q, t) => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${t}&dt=t&q=${encodeURIComponent(q)}`;
const usable = (t, src) => { t = (t || '').trim(); return !!t && t.toLowerCase() !== src.trim().toLowerCase() && !/^(MYMEMORY WARNING|INVALID|PLEASE SELECT|QUERY LENGTH)/i.test(t); };

export async function translate(text, target) {
  const q = formSentenceLocal(text) || text;                       // proper-case text translates far better than ALL CAPS letters
  const errors = [];
  if (await backendAvailable()) {
    try { const r = await call('/api/translate', { method: 'POST', body: JSON.stringify({ text: q, target }) }); if (usable(r.translation, q)) return r.translation; }
    catch (e) { errors.push('server ' + e.message); }
  }
  try { const d = await (await fetch(GTX(q, target))).json(); const t = d[0].map(s => s[0]).join(''); if (usable(t, q)) return t; errors.push('google unusable'); } catch (e) { errors.push('google ' + e.message); }
  try { const r = await (await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|${target}`)).json(); if (usable(r.responseData.translatedText, q)) return r.responseData.translatedText; errors.push('mymemory unusable'); } catch (e) { errors.push('mymemory ' + e.message); }
  throw new Error(errors.join(', ') || 'no translation service answered');
}
export const googleTranslateUrl = (text, target) => `https://translate.google.com/?sl=en&tl=${target}&op=translate&text=${encodeURIComponent(formSentenceLocal(text) || text)}`;
