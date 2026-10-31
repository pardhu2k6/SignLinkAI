import { cam } from './camera.js';
import { hasModel } from './classifier.js';
import { SignEngine } from './engine.js';
import { addHistory, translate, googleTranslateUrl } from './api.js';
import { LANGS } from './lessons.js';
import { formSentenceLocal, applyFormat } from './sentence.js';
import { $, toast, speak, addXP, drawTrail } from './ui.js';

const VOICE = { te: 'te-IN', hi: 'hi-IN', ta: 'ta-IN', kn: 'kn-IN', ml: 'ml-IN', bn: 'bn-IN', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' };

const failMessage = f => f.reason === 'small' ? `${f.kind}: drawing too small — draw it bigger (move your whole hand)` : `${f.kind}: shape not recognised (${f.score.toFixed(2)} vs max ${f.limit}) — draw it larger and a bit slower`;
let lastFailToast = 0;

export function initCommunicate() {
  const root = $('#page-communicate');
  const engine = new SignEngine();
  let gestures = [], sentence = '', translated = '';

  $('#c-lang', root).innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  const renderSentence = () => { $('#c-sentence', root).innerHTML = sentence ? sentence.replace(/ /g, '&nbsp; ') : '<em>Start signing…</em>'; };
  const renderStream = () => {
    $('#c-stream', root).innerHTML = gestures.length
      ? gestures.map(g => `<span class="chip">${g}</span>`).join('')
      : '<div class="empty">✋<br>No gestures recognized yet…</div>';
  };

  const clearTranslation = () => { translated = ''; $('#c-out', root).textContent = '—'; };
  function commit(label, replaces = null) {
    clearTranslation();
    if (replaces && gestures.at(-1) === replaces && sentence.endsWith(replaces)) { gestures.pop(); sentence = sentence.slice(0, -1); }   // J/Z replaces the I/D... accepted just before
    if (/[.?!]$/.test(sentence) && /^[A-Za-z]$/.test(label)) { sentence += ' '; gestures.push('␣'); }   // new letters after a finished sentence start a new word
    gestures.push(label); sentence += label;
    renderStream(); renderSentence(); addHistory(label, sentence); addXP(1);
    if (label === 'J' || label === 'Z') toast(`✓ ${label} (motion sign)`);
  }

  function onFrame(f) {
    $('#d-hands', root).textContent = f.hands; $('#d-fps', root).textContent = f.fps ? Math.round(f.fps) : '—';
    const r = engine.update(f);
    drawTrail(cam.canvas, r.trail);
    if (!f.flat) { ['d-hand', 'd-fingers', 'd-conf'].forEach(id => $('#' + id, root).textContent = '—'); $('#c-live', root).textContent = ''; $('#c-ring', root).style.width = '0'; return; }
    $('#d-hand', root).textContent = f.hand; $('#d-fingers', root).textContent = f.fingers;
    $('#d-conf', root).textContent = r.pred ? Math.round(r.pred.conf * 100) + '%' : (r.motion ? '✍' : '—');
    $('#c-live', root).innerHTML = r.drawing ? `✍ drawing ${r.candidate}…` : r.candidate ? `${r.candidate} <small>${r.motion ? '' : Math.round(r.conf * 100) + '%'}</small>` : '';
    $('#c-ring', root).style.width = r.progress * 100 + '%';
    if (r.commit) commit(r.commit, r.replaces);
    if (r.motionFail && performance.now() - lastFailToast > 3500) { lastFailToast = performance.now(); toast(failMessage(r.motionFail), 3500); }
  }

  const overlay = $('#c-cam-overlay', root);
  async function syncCam() {                       // camera already running (or should resume)? show it, no click needed
    overlay.hidden = cam.running;
    if (cam.wantOn && !cam.running) { try { await cam.start(); overlay.hidden = true; } catch { overlay.hidden = false; } }
  }
  $('#c-start', root).onclick = async () => { try { await cam.start(); overlay.hidden = true; } catch (e) { toast('Camera error: ' + (e.message || e)); } };
  $('#c-stop', root).onclick = () => { cam.stop(); overlay.hidden = false; engine.reset(); };

  // sentence builder
  const add = s => { sentence += s; renderSentence(); };
  $('#b-space', root).onclick = () => { add(' '); gestures.push('␣'); renderStream(); };
  $('#b-j', root).onclick = () => commit('J'); $('#b-z', root).onclick = () => commit('Z');
  $('#b-del', root).onclick = () => { sentence = sentence.slice(0, -1); gestures.pop(); renderSentence(); renderStream(); };
  $('#b-clear', root).onclick = () => { sentence = ''; gestures = []; renderSentence(); renderStream(); };
  $('#b-speak', root).onclick = () => speak(sentence);
  $('#b-save', root).onclick = () => { if (sentence.trim()) { addHistory('SENTENCE', sentence.trim()); toast('Saved to history'); } };
  $('#s-clear', root).onclick = () => { gestures = []; renderStream(); };

  const sourceText = () => sentence.trim() || gestures.filter(g => g !== '␣').join('');
  const setSentence = s => { sentence = s; clearTranslation(); renderSentence(); };
  // "Form Sentence": automatic offline formatting (spacing, capitals, punctuation) - no AI, no internet
  $('#s-form', root).onclick = () => {
    const src = sourceText(); if (!src) return toast('Sign something first');
    setSentence(formSentenceLocal(src)); addHistory('SENTENCE', sentence);
    const res = $('#s-result', root); res.hidden = false; res.innerHTML = `<small class="muted">Sentence</small><br><b>${sentence.replace(/</g, '&lt;')}</b>`;
  };
  // manual formatting buttons
  root.querySelectorAll('[data-fmt]').forEach(btn => btn.onclick = () => {
    const src = sentence.trim() || sourceText(); if (!src) return toast('Nothing to format yet');
    const out = applyFormat(src, btn.dataset.fmt);
    if (out === null) return toast(/\s/.test(src) ? 'Split words only works on text without spaces' : 'Couldn’t find words to split — use the Space button between words');
    setSentence(out);
  });

  const lang = () => $('#c-lang', root).value;
  $('#c-translate', root).onclick = async () => {
    const out = $('#c-out', root), text = sourceText();
    if (!text) { out.textContent = 'Nothing to translate yet — sign something or press Form Sentence first.'; return; }
    const btn = $('#c-translate', root); btn.disabled = true; out.textContent = 'Translating…';
    try { translated = await translate(text, lang()); out.textContent = translated || '(empty result)'; }
    catch (e) { translated = ''; out.innerHTML = 'Couldn’t reach the translation service (' + (e.message || 'network') + '). <a target="_blank" rel="noopener" href="' + googleTranslateUrl(text, lang()) + '">Open in Google Translate ↗</a>'; }
    finally { btn.disabled = false; }
  };
  $('#c-tr-speak', root).onclick = () => translated ? speak(translated, VOICE[lang()] || 'en-IN', true) : toast('Translate something first');
  $('#c-tr-open', root).onclick = () => window.open(googleTranslateUrl(sourceText() || ' ', lang()), '_blank', 'noopener');

  return {
    enter() { if (!hasModel()) $('#c-nomodel', root).hidden = false; renderSentence(); renderStream(); cam.mount($('.video-wrap', root)); cam.setHandler(onFrame); engine.reset(); syncCam(); },
    leave() { engine.reset(); },
  };
}
