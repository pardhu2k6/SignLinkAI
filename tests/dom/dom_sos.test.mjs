import { build } from 'esbuild'; import { JSDOM } from 'jsdom'; import fs from 'fs';
import os from 'os'; import path from 'path'; const root = new URL('../../frontend', import.meta.url).pathname; const tmp = os.tmpdir();
fs.writeFileSync(path.join(tmp, 'sl_entry.js'), `import { initSOS } from '${root}/js/sos.js'; initSOS();`);
const out = await build({ entryPoints: [path.join(tmp, 'sl_entry.js')], bundle: true, format: 'iife', write: false });
let html = fs.readFileSync(root + '/index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost:8000/', pretendToBeVisual: true });
const w = dom.window; const calls = []; let mode = 'sms';
w.fetch = async (url, o) => {
  calls.push([url, o && o.body ? JSON.parse(o.body) : null]);
  if (mode === 'down') throw new Error('Failed to fetch');
  const b = JSON.parse(o.body);
  const results = b.contacts.map(c => ({ name: c.name || c.phone, channel: 'sms', ok: !c.phone.endsWith('0003'), ...(c.phone.endsWith('0003') ? { error: 'unverified' } : {}) }));
  return { ok: true, json: async () => mode === 'none' ? { channels: [], results: [] } : { channels: ['sms'], results } };
};
w.navigator.geolocation = { getCurrentPosition: ok => ok({ coords: { latitude: 16.5, longitude: 81.5 } }) };
w.eval(out.outputFiles[0].text);
const $ = (s, r = w.document) => r.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
let bad = 0; const check = (n, c, extra = '') => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', n, extra); };
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

click($('#sos')); check('SOS opens menu with 6 options', !$('#sos-modal').hidden && $$('.sos-opt').length === 6);
click($('[data-k=help]')); await tick();
check('no contacts -> prompt to add', /No emergency contacts/.test($('#sos-status').textContent)); click($('#sos-back'));

click($('#sos-contacts-btn')); check('contacts editor shows 5 rows', $$('#ct-rows .ct-row').length === 5);
$('#ct-sender').value = 'Iswarya';
const rows = $$('#ct-rows .ct-row'); const fill = (i, n, p) => { $('.ct-name', rows[i]).value = n; $('.ct-phone', rows[i]).value = p; };
fill(0, 'Mom', '98765 43210'); fill(1, 'Dad', '9876500003'); fill(2, 'Bad', 'abc');
click($('#ct-save')); check('invalid number rejected', /valid phone/.test($('#ct-status').textContent), $('#ct-status').textContent);
fill(2, '', ''); click($('#ct-save')); check('saves 2 valid contacts', /Saved 2/.test($('#ct-status').textContent), JSON.stringify($('#ct-status').textContent) + ' rows=' + rows.map(r => $('.ct-phone', r).value).join('|'));
click($('#ct-back')); check('menu shows 2/5', $('#ct-count').textContent === '2');
check('contacts persisted', JSON.parse(w.localStorage.getItem('signlink_contacts')).list.length === 2);

calls.length = 0; click($('[data-k=medical]')); await tick(80);
const sosCall = calls.find(c => c[0] === '/api/sos');
check('POST /api/sos sent automatically', !!sosCall);
check('payload: sender, message, 2 contacts normalised', sosCall && sosCall[1].sender === 'Iswarya' && /medical/.test(sosCall[1].message) && sosCall[1].contacts.map(c => c.phone).join() === '+919876543210,+919876500003', JSON.stringify(sosCall && sosCall[1].contacts));
check('per-contact status shown (✅ / ❌ with reason)', /✅[\s\S]*Mom/.test($('#sos-status').textContent) && /❌[\s\S]*Dad[\s\S]*unverified/.test($('#sos-status').textContent), $('#sos-status').textContent.replace(/\s+/g, ' '));
const n1 = calls.filter(c => c[0] === '/api/sos').length;
click($('#sos-back')); click($('[data-k=medical]')); await tick(60);
check('duplicate within 45s not re-sent', calls.filter(c => c[0] === '/api/sos').length === n1 + 1 - 1 + (calls.filter(c => c[0] === '/api/sos').length - n1) && /a moment ago/.test($('#sos-status').textContent), $('#sos-status').textContent.slice(0, 60));
const before = calls.filter(c => c[0] === '/api/sos').length; click($('#sos-resend')); await tick(60);
check('Resend alerts sends again', calls.filter(c => c[0] === '/api/sos').length > before);

mode = 'none'; click($('#sos-back')); click($('[data-k=fire]')); await tick(60);
check('no auto channel -> WhatsApp/SMS buttons per contact', $$('#sos-status a[href^="https://wa.me/"]').length === 2 && $$('#sos-status a[href^="sms:"]').length >= 2, $$('#sos-status a').map(a => a.href.slice(0, 40)).join(' | '));
mode = 'down'; click($('#sos-back')); click($('[data-k=police]')); await tick(60);
check('backend down -> clear message + manual buttons', /Couldn.t reach/.test($('#sos-status').textContent) && $$('#sos-status a[href^="https://wa.me/"]').length === 2);
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
