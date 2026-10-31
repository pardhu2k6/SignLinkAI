export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
import { normalizeText } from './sentence.js';
/** Speaks words as words (not letter by letter): all-caps text makes many voices spell it out. */
export function speak(text, lang = 'en-IN', raw = false) {
  if (!text || !('speechSynthesis' in window)) return;
  const clean = raw ? text : normalizeText(text.replace(/[␣]/g, ' '));
  const u = new SpeechSynthesisUtterance(clean); u.lang = lang; u.rate = 0.95;
  const voices = speechSynthesis.getVoices();
  const v = voices.find(x => x.lang === lang) || voices.find(x => x.lang.startsWith(lang.split('-')[0]));
  if (v) u.voice = v;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
/** draws the fingertip path while a J / Z is being drawn (canvas is mirrored by CSS like the video) */
export function drawTrail(canvas, trail) {
  if (!trail || trail.length < 2) return;
  const c = canvas.getContext('2d'); c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#22d3ee'; c.beginPath();
  trail.forEach((p, i) => i ? c.lineTo(p.x * canvas.width, p.y * canvas.height) : c.moveTo(p.x * canvas.width, p.y * canvas.height)); c.stroke();
}
export function addXP(n) {
  const xp = (+localStorage.getItem('signlink_xp') || 0) + n;
  localStorage.setItem('signlink_xp', xp); $('#xp').textContent = xp;
}
export const getXP = () => +localStorage.getItem('signlink_xp') || 0;

