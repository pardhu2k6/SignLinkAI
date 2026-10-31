import { cam } from './camera.js';
import { SignEngine } from './engine.js';
import { LESSONS, CATEGORIES, LEVEL_NAMES } from './lessons.js';
import { $, $$, toast, addXP, drawTrail } from './ui.js';

// Put your own photos in frontend/signs/photos/<LETTER>.jpg to override the built-in pose drawings.
const imgFor = l => `signs/${l}.svg`;
const photoFor = l => `signs/photos/${l}.jpg`;

let lastFail = 0;
export function initLearn() {
  const root = $('#page-learn');
  const engine = new SignEngine({ holdMs: 550 });
  let cat = 'All', target = null;
  const done = new Set(JSON.parse(localStorage.getItem('signlink_done') || '[]'));

  $('#l-chips', root).innerHTML = CATEGORIES.map(c => `<button class="pill ${c === cat ? 'active' : ''}" data-c="${c}">${c === 'All' ? 'All' : LEVEL_NAMES[c]}</button>`).join('');
  $$('#l-chips .pill', root).forEach(b => b.onclick = () => { cat = b.dataset.c; $$('#l-chips .pill', root).forEach(x => x.classList.toggle('active', x === b)); renderCards(); });

  const imgTag = (l, cls = '') => `<img class="${cls}" src="${photoFor(l)}" alt="ASL sign for ${l}" loading="lazy" onerror="this.onerror=null;this.src='${imgFor(l)}'">`;

  function renderTarget() {
    const box = $('#l-target', root);
    if (!target) { box.innerHTML = '<p class="muted center">Tap a letter below to see how it’s signed.</p>'; return; }
    box.innerHTML = `<div class="target-img">${imgTag(target.label)}</div>
      <div><h3>Letter ${target.label}</h3><span class="lvl">${LEVEL_NAMES[target.level]}</span>
      <p class="tip">${target.tip}</p><p class="hint">Your camera is mirrored like a mirror — hold the sign facing the camera, fingers clearly visible.</p></div>`;
  }

  function renderCards() {
    $('#l-cards', root).innerHTML = LESSONS.filter(l => cat === 'All' || l.cat === cat).map(l => `
      <div class="card lesson ${done.has(l.label) ? 'done' : ''} ${target?.label === l.label ? 'sel' : ''}" data-l="${l.label}">
        ${done.has(l.label) ? '<span class="tick">✓</span>' : ''}${imgTag(l.label, 'thumb')}
        <b>Letter ${l.label}</b><div class="xp">+${l.xp} XP</div><span class="lvl">${LEVEL_NAMES[l.level]}</span>
      </div>`).join('');
    $$('.lesson', root).forEach(el => el.onclick = () => { target = LESSONS.find(l => l.label === el.dataset.l); renderCards(); renderTarget(); $('#l-target', root).scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }

  function onFrame(f) {
    const r = engine.update(f); drawTrail(cam.canvas, r.trail);
    if (!f.flat) { $('#l-sign', root).textContent = '—'; $('#l-bar', root).style.width = '0'; $('#l-pct', root).textContent = '0%'; return; }
    $('#l-sign', root).textContent = r.drawing ? '✍' : (r.candidate || (r.pred ? r.pred.label : '—'));
    const conf = r.motion ? (r.commit ? 1 : r.progress) : (r.pred ? r.pred.conf : 0);
    $('#l-bar', root).style.width = conf * 100 + '%'; $('#l-pct', root).textContent = r.drawing ? 'drawing…' : Math.round(conf * 100) + '%';
    $('#l-msg', root).textContent = target ? (target.level === 'motion' ? `Hold the pose, then draw ${target.label} in the air` : `Show the letter ${target.label}`) : 'Pick a letter below, then show the sign';
    if (r.motionFail && performance.now() - lastFail > 3500) { lastFail = performance.now(); toast(r.motionFail.reason === 'small' ? 'Draw it bigger — move your whole hand' : `Shape not recognised (${r.motionFail.score.toFixed(2)} vs max ${r.motionFail.limit}) — draw larger and a bit slower`, 3500); }
    if (r.commit && target && r.commit === target.label && !done.has(target.label)) {
      done.add(target.label); localStorage.setItem('signlink_done', JSON.stringify([...done])); addXP(target.xp);
      toast(`✓ Letter ${target.label} +${target.xp} XP`); renderCards(); $('#l-prog', root).textContent = `${done.size} / ${LESSONS.length}`;
    }
  }

  const overlay = $('#l-overlay', root);
  async function syncCam() {
    overlay.hidden = cam.running;
    if (cam.wantOn && !cam.running) { try { await cam.start(); overlay.hidden = true; } catch { overlay.hidden = false; } }
  }
  $('#l-start', root).onclick = async () => { try { await cam.start(); overlay.hidden = true; } catch (e) { toast('Camera error: ' + (e.message || e)); } };
  $('#l-stop', root).onclick = () => { cam.stop(); overlay.hidden = false; engine.reset(); };
  $('#l-reset', root).onclick = () => { done.clear(); localStorage.removeItem('signlink_done'); target = null; renderCards(); renderTarget(); $('#l-prog', root).textContent = `0 / ${LESSONS.length}`; toast('Progress reset'); };

  return {
    enter() { $('#l-prog', root).textContent = `${done.size} / ${LESSONS.length}`; renderCards(); renderTarget(); cam.mount($('.video-wrap', root)); cam.setHandler(onFrame); engine.reset(); syncCam(); },
    leave() { engine.reset(); },
  };
}
