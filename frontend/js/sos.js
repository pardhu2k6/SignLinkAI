import { $, $$, speak, toast } from './ui.js';
import { MAX, loadContacts, saveContacts, validContacts, buildMessage, waLink, smsLink } from './contacts.js';

// Emergency numbers (India). Change for your country.
const SOS = {
  help:    { e: '🆘', t: 'Need Help',     msg: 'I need help. Please assist me.', tel: '112' },
  medical: { e: '🏥', t: 'Medical',       msg: 'I need medical help. Please call an ambulance.', tel: '108' },
  police:  { e: '👮', t: 'Call Police',   msg: 'Please call the police. I need help.', tel: '100' },
  fire:    { e: '🔥', t: 'Fire',          msg: 'There is a fire! Please call the fire brigade.', tel: '101' },
  breathe: { e: '🫁', t: "Can't Breathe", msg: "I can't breathe. I need medical help now.", tel: '108' },
  lost:    { e: '📍', t: 'I am Lost',     msg: 'I am lost. Please help me find my way.', tel: '112' },
};
const BASE = window.SIGNLINK_API || '';
const view = id => ['sos-menu', 'sos-alert', 'sos-contacts'].forEach(v => { $('#' + v).hidden = v !== id; });
let key = 'help', locLink = '', lastSent = {}, sendToken = 0;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** location link, or '' if refused / too slow */
function getLocation(ms) {
  return new Promise(res => {
    if (!navigator.geolocation) return res('');
    const t = setTimeout(() => res(''), ms);
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(t); locLink = `https://maps.google.com/?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`; res(locLink); },
      () => { clearTimeout(t); res(''); }, { enableHighAccuracy: true, timeout: ms, maximumAge: 60000 });
  });
}

async function postSos(d, message, location) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(BASE + '/api/sos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ sender: d.sender, message, location, contacts: validContacts(d), country_code: d.cc }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function manualButtons(d, text) {
  const cs = validContacts(d);
  return `<p class="small">Your browser can’t send messages silently. Tap to send:</p>` + cs.map(c =>
    `<div class="ct-line"><b>${esc(c.name || c.phone)}</b><a target="_blank" rel="noopener" href="${waLink(c.phone, text)}">💬 WhatsApp</a><a href="${smsLink([c.phone], text)}">✉ SMS</a></div>`).join('') +
    (cs.length > 1 ? `<div class="ct-line"><b>Everyone</b><a href="${smsLink(cs.map(c => c.phone), text)}">✉ SMS all</a></div>` : '') +
    `<p class="small">For automatic sending, set up Twilio or Telegram in <code>backend/.env</code> (see README).</p>`;
}

async function sendAlerts(k, force = false) {
  const o = SOS[k], box = $('#sos-status'), d = loadContacts(), cs = validContacts(d), token = ++sendToken;
  if (!cs.length) { box.innerHTML = '⚠ No emergency contacts saved yet. <a href="#" id="sos-add-contacts">Add up to 5 contacts</a>'; $('#sos-add-contacts').onclick = e => { e.preventDefault(); openContacts(); }; return; }
  if (!force && Date.now() - (lastSent[k] || 0) < 45000) { box.textContent = 'Alerts for this SOS were sent a moment ago. Tap “Resend alerts” to send again.'; return; }
  box.textContent = k === 'lost' ? 'Getting your location, then alerting your contacts…' : 'Alerting your contacts…';
  if (k === 'lost') await getLocation(6000); else if (!locLink) getLocation(12000);      // urgent ones are sent at once; location follows
  if (token !== sendToken) return;
  const text = buildMessage(d.sender, o.msg, k === 'lost' ? locLink : '');
  try {
    const r = await postSos(d, o.msg, k === 'lost' ? locLink : '');
    if (token !== sendToken) return;
    if (!r.channels.length) { box.innerHTML = manualButtons(d, text); return; }
    lastSent[k] = Date.now();
    box.innerHTML = r.results.map(x => `<div class="ct-line">${x.ok ? '✅' : '❌'} <b>${esc(x.name)}</b> <small>(${x.channel})</small>${x.error ? ` <small>${esc(x.error)}</small>` : ''}</div>`).join('');
    if (k !== 'lost') getLocation(12000).then(async link => { if (link && token === sendToken) { try { await postSos(d, 'My live location update.', link); box.innerHTML += '<div class="ct-line">📍 Location sent</div>'; } catch {} } });
  } catch (e) {                                              // backend not running / network error
    box.innerHTML = `<p class="small">Couldn’t reach the SignLink server (${esc(e.message)}).</p>` + manualButtons(d, buildMessage(d.sender, o.msg, locLink));
  }
}

function openAlert(k) {
  key = k; const o = SOS[k]; view('sos-alert');
  $('#sos-emoji').textContent = o.e; $('#sos-title').textContent = o.t.toUpperCase(); $('#sos-msg').textContent = o.msg;
  const call = $('#sos-call'); call.href = 'tel:' + o.tel; call.textContent = `📞 Call ${o.tel}`;
  speak(o.msg, 'en-IN', true); if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  $('#sos-loc').innerHTML = locLink ? `My location: <a style="color:#fff" target="_blank" rel="noopener" href="${locLink}">${locLink}</a>` : '';
  $('#sos-share').hidden = !locLink;
  sendAlerts(k);
}

// ---- contacts editor ----
function renderContacts() {
  const d = loadContacts(); $('#ct-sender').value = d.sender; $('#ct-cc').value = d.cc;
  $('#ct-rows').innerHTML = Array.from({ length: MAX }, (_, i) => {
    const c = d.list[i] || {};
    return `<div class="ct-row"><span>${i + 1}</span><input class="ct-name" placeholder="Name" maxlength="40" value="${esc(c.name || '')}"><input class="ct-phone" placeholder="Phone (e.g. 98765 43210)" maxlength="25" inputmode="tel" value="${esc(c.phone || '')}"></div>`;
  }).join('');
  $('#ct-status').textContent = '';
}
const readContacts = () => ({
  sender: $('#ct-sender').value.trim(), cc: $('#ct-cc').value.trim() || '+91',
  list: $$('#ct-rows .ct-row').map(r => ({ name: $('.ct-name', r).value.trim(), phone: $('.ct-phone', r).value.trim() })).filter(c => c.phone || c.name),
});
function updateCount() { $('#ct-count').textContent = validContacts(loadContacts()).length; }
function openContacts() { renderContacts(); view('sos-contacts'); }

export function initSOS() {
  updateCount();
  $('#sos').onclick = () => { $('#sos-modal').hidden = false; updateCount(); view('sos-menu'); };
  $$('.sos-opt').forEach(b => b.onclick = () => openAlert(b.dataset.k));
  $('#sos-close').onclick = () => { $('#sos-modal').hidden = true; window.speechSynthesis?.cancel(); };
  $('#sos-back').onclick = () => { sendToken++; window.speechSynthesis?.cancel(); view('sos-menu'); };
  $('#sos-repeat').onclick = () => speak(SOS[key].msg, 'en-IN', true);
  $('#sos-resend').onclick = () => sendAlerts(key, true);
  $('#sos-share').onclick = async () => {
    const text = buildMessage(loadContacts().sender, SOS[key].msg, locLink);
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Copied — paste it into a message'); } } catch {}
  };
  $('#sos-contacts-btn').onclick = openContacts;
  $('#ct-back').onclick = () => { updateCount(); view('sos-menu'); };
  $('#ct-save').onclick = () => {
    const d = readContacts(), bad = d.list.filter(c => c.phone && !validContacts({ cc: d.cc, list: [c] }).length);
    if (bad.length) { $('#ct-status').textContent = `⚠ “${bad[0].phone}” doesn’t look like a valid phone number.`; return; }
    saveContacts(d); updateCount(); $('#ct-status').textContent = `✅ Saved ${validContacts(d).length} contact(s).`;
  };
  $('#ct-test').onclick = async () => {
    const d = readContacts(); saveContacts(d); updateCount(); const st = $('#ct-status');
    if (!validContacts(d).length) { st.textContent = 'Add at least one valid contact first.'; return; }
    st.textContent = 'Sending test…';
    try {
      const r = await postSos(d, 'This is a TEST of my emergency alert. No emergency.', '');
      st.innerHTML = r.channels.length ? r.results.map(x => `${x.ok ? '✅' : '❌'} ${esc(x.name)} ${x.error ? '— ' + esc(x.error) : ''}`).join('<br>')
        : manualButtons(d, buildMessage(d.sender, 'This is a TEST of my emergency alert. No emergency.', ''));
    } catch (e) { st.textContent = '❌ ' + e.message + ' (is the backend running?)'; }
  };
}
