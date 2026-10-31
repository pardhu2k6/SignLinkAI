import { loadModel, hasModel, modelInfo } from './classifier.js';
import { loadWords } from './sentence.js';
import { cam } from './camera.js';
import { initSOS } from './sos.js';
import { $, $$, addXP, getXP, speak, toast } from './ui.js';
import { initCommunicate } from './communicate.js';
import { initLearn } from './learn.js';
import { initHistory } from './history.js';
import { LESSONS } from './lessons.js';

window.addEventListener('error', e => toast('JS error: ' + e.message, 6000));
window.addEventListener('unhandledrejection', e => toast('Error: ' + (e.reason?.message || e.reason), 6000));
$('#xp').textContent = getXP(); $('#st-lessons').textContent = LESSONS.length;
if (localStorage.getItem('signlink_theme') === 'dark') document.documentElement.dataset.theme = 'dark';
$('#theme').onclick = () => {
  const d = document.documentElement.dataset.theme === 'dark'; document.documentElement.dataset.theme = d ? '' : 'dark';
  localStorage.setItem('signlink_theme', d ? 'light' : 'dark');
};

initSOS();

const pages = { home: { enter() {}, leave() {} }, about: { enter() {}, leave() {} },
  communicate: initCommunicate(), learn: initLearn(), history: initHistory() };
let current = null;
function route() {
  const name = (location.hash.replace('#/', '') || 'home'); const next = pages[name] ? name : 'home';
  if (current) pages[current].leave();
  $$('.page').forEach(p => p.hidden = p.id !== 'page-' + next);
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.p === next));
  current = next;
  if (next !== 'communicate' && next !== 'learn' && cam.running) cam.stop(true);   // camera light off on pages that don't need it; resumes automatically on return
  pages[next].enter(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

await Promise.all([loadModel(), loadWords()]);
const info = modelInfo();
if (info) {
  $('#st-classes').textContent = info.labels.length + 2;   // + J and Z (motion) $('#st-acc').textContent = info.accuracy ? Math.round(info.accuracy * 100) + '%' : '—';
}
route();
