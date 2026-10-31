// Full engine on a simulated hand drawing Z / J. A static letter may be accepted first (I / D...), but the J/Z commit must REPLACE it,
// so the final text is exactly one letter.
import fs from 'fs';
globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL('../frontend/model/model.json', import.meta.url))) });
const { loadModel } = await import('../frontend/js/classifier.js'); await loadModel();
const { SignEngine } = await import('../frontend/js/engine.js');
const A = 4 / 3;
function hand(kind, ox, oy) {
  const lm = Array.from({ length: 21 }, () => [0.5, 0.8]); const set = (i, dx, dy) => lm[i] = [0.5 + dx, 0.8 + dy];
  set(1, .04, -.03); set(2, .07, -.06); set(3, .08, -.09); set(4, .06, -.12);
  const fing = (b, x, ext) => { set(b, x, -.2); if (ext) { set(b+1, x, -.3); set(b+2, x, -.38); set(b+3, x, -.46); } else { set(b+1, x, -.22); set(b+2, x, -.17); set(b+3, x, -.12); } };
  fing(5, -.06, kind === 'Z'); fing(9, 0, false); fing(13, .05, false); fing(17, .09, kind === 'J');
  const f = []; lm.forEach(p => f.push(p[0] + ox, p[1] + oy, 0)); return f;
}
const seg = (pts, n) => { const o = []; for (let i = 1; i < pts.length; i++) for (let t = 0; t < n; t++) o.push([pts[i-1][0] + (pts[i][0]-pts[i-1][0]) * t / n, pts[i-1][1] + (pts[i][1]-pts[i-1][1]) * t / n]); return o; };
const SH = { Z: seg([[0,0],[1,0],[0,1],[1,1]], 10), J: [...seg([[.8,0],[.8,.55]], 10), ...Array.from({length:16},(_,i)=>{const a=i/15*Math.PI*.95;return [.45+.35*Math.cos(a), .55+.4*Math.sin(a)];})] };
let bad = 0;
for (const k of ['Z', 'J']) {
  const e = new SignEngine(), commits = []; let t = 1000;
  const frames = [...Array(24).fill(SH[k][0]), ...SH[k], ...Array(30).fill(SH[k].at(-1))];   // 0.8s hold, draw, rest
  for (const p of frames) { const r = e.update({ flat: hand(k, 0.5 - (0.2 + p[0] * .3) / A, p[1] * .3 - .5), aspect: A }, t += 33); if (r.commit) { if (r.replaces && commits.at(-1) === r.replaces) commits.pop(); commits.push(r.commit); } }
  const ok = commits.length === 1 && commits[0] === k; if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', k, '->', JSON.stringify(commits));
}
process.exit(bad ? 1 : 0);
