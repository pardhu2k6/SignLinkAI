import { getHistory, clearHistory, exportHistoryCsv } from './api.js';
import { $, speak, toast } from './ui.js';

export function initHistory() {
  const body = $('#h-body');
  async function render() {
    const rows = await getHistory();
    body.innerHTML = rows.length ? rows.map((r, i) => `<tr><td class="sign">${r.sign}</td><td>${r.sentence || ''}</td>
      <td>${new Date(r.created_at * 1000).toLocaleTimeString()}</td><td><button class="btn ghost" data-i="${i}">🔊 Speak</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="muted center">Nothing yet — go to Communicate and start signing.</td></tr>';
    body.querySelectorAll('button').forEach(b => b.onclick = () => speak(rows[b.dataset.i].sentence || rows[b.dataset.i].sign));
  }
  $('#h-export').onclick = exportHistoryCsv;
  $('#h-clear').onclick = async () => { if (confirm('Clear all history?')) { await clearHistory(); render(); toast('History cleared'); } };
  return { enter: render, leave() {} };
}
