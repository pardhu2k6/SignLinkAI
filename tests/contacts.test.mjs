import { normPhone, validContacts, buildMessage, waLink, smsLink } from '../frontend/js/contacts.js';
let bad = 0; const eq = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', n, ok ? '' : `${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
eq('10-digit -> +91', normPhone('98765 43210'), '+919876543210'); eq('leading 0', normPhone('09876543210'), '+919876543210');
eq('already +cc', normPhone('+1 (415) 555-0100'), '+14155550100'); eq('garbage', normPhone('abc'), null); eq('too short', normPhone('123'), null);
eq('other default cc', normPhone('4155550100', '+1'), '+14155550100');
eq('max 5 + drops invalid', validContacts({ cc: '+91', list: [...Array(7)].map((_, i) => ({ name: 'c' + i, phone: i === 1 ? 'x' : '98765432' + (10 + i) })) }).length, 5);
eq('message', buildMessage('Iswarya', 'I need help.', 'https://m/1'), '🚨 SOS from Iswarya: I need help.\n📍 Location: https://m/1\n— sent by SignLink AI');
eq('wa link', waLink('+919876543210', 'hi there'), 'https://wa.me/919876543210?text=hi%20there'); eq('sms link', smsLink(['+91a', '+91b'], 'x y'), 'sms:+91a,+91b?body=x%20y');
process.exit(bad ? 1 : 0);
