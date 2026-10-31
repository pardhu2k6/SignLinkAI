// Emergency contacts: storage + pure helpers (no DOM) so they can be unit-tested.
export const MAX = 5;
const KEY = 'signlink_contacts';

export function loadContacts() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return { sender: d.sender || '', cc: d.cc || '+91', list: (d.list || []).slice(0, MAX) }; }
  catch { return { sender: '', cc: '+91', list: [] }; }
}
export const saveContacts = d => localStorage.setItem(KEY, JSON.stringify({ sender: d.sender, cc: d.cc, list: d.list.slice(0, MAX) }));

/** '98765 43210' -> '+919876543210' (null if it cannot be a phone number). Same rules as the backend. */
export function normPhone(raw, cc = '+91') {
  let s = String(raw || '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = (cc.startsWith('+') ? cc : '+' + cc) + s.replace(/^0+/, '');
  return /^\+\d{8,15}$/.test(s) ? s : null;
}
/** contacts with a usable phone number, normalised */
export const validContacts = d => d.list.map(c => ({ name: (c.name || '').trim(), phone: normPhone(c.phone, d.cc) })).filter(c => c.phone).slice(0, MAX);

export const buildMessage = (sender, msg, location) => `🚨 SOS from ${sender || 'Someone'}: ${msg}` + (location ? `\n📍 Location: ${location}` : '') + '\n— sent by SignLink AI';
export const waLink = (phone, text) => `https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(text)}`;
export const smsLink = (phones, text) => `sms:${phones.join(',')}?body=${encodeURIComponent(text)}`;
