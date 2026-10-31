import { MotionRecognizer, resample } from '../frontend/js/motion.js';
const A = 4 / 3;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = s => (rnd() + rnd() + rnd() - 1.5) * 2 * s;

// hand with given pose; offset (ox,oy) translates the whole hand (normalised image coords)
function hand(kind, ox, oy) {
  const lm = Array.from({ length: 21 }, () => [0.5, 0.8]);
  const set = (i, dx, dy) => lm[i] = [0.5 + dx, 0.8 + dy];
  set(0, 0, 0); set(1, .04, -.03); set(2, .07, -.06); set(3, .08, -.09); set(4, .06, -.12);
  const fing = (base, mcpx, ext) => {      // wrist-relative; extended finger goes straight up
    set(base, mcpx, -.2);
    if (ext) { set(base + 1, mcpx, -.3); set(base + 2, mcpx, -.38); set(base + 3, mcpx, -.46); }
    else { set(base + 1, mcpx, -.22); set(base + 2, mcpx, -.17); set(base + 3, mcpx, -.12); }
  };
  fing(5, -.06, kind === 'Z'); fing(9, 0, false); fing(13, .05, false); fing(17, .09, kind === 'J');
  // make mcp9 exactly 0.2 above wrist (palm size L = 0.2)
  const flat = []; lm.forEach(p => flat.push(p[0] + ox, p[1] + oy, 0)); return flat;
}
const bez = (pts, n) => { const o = []; for (let i = 1; i < pts.length; i++) for (let t = 0; t < n; t++) o.push([pts[i-1][0] + (pts[i][0] - pts[i-1][0]) * t / n, pts[i-1][1] + (pts[i][1] - pts[i-1][1]) * t / n]); o.push(pts.at(-1)); return o; };
const SHAPES = {
  Z: bez([[0, 0], [1, 0], [0, 1], [1, 1]], 12),
  J: [...bez([[.8, 0], [.8, .55]], 10), ...Array.from({ length: 16 }, (_, i) => { const a = i / 15 * Math.PI * 0.95; return [.45 + .35 * Math.cos(a), .55 + .4 * Math.sin(a)]; })],
  line: bez([[.5, 0], [.5, 1]], 20), circle: Array.from({ length: 40 }, (_, i) => [.5 + .5 * Math.cos(i / 40 * 6.28), .5 + .5 * Math.sin(i / 40 * 6.28)]),
  wave: Array.from({ length: 40 }, (_, i) => [i / 40, .5 + .2 * Math.sin(i / 40 * 12)]), diag: bez([[0, 0], [1, 1]], 20),
};
function run(pose, shape, { size = .3, secs = 1.1, noise = .004, mirror = false, pauseStart = .5 } = {}) {
  const m = new MotionRecognizer(); let t = 1000, commit = null, rejected = null;
  const frames = [];
  const base = SHAPES[shape], n = Math.round(secs * 30);
  for (let i = 0; i < pauseStart * 30; i++) frames.push(base[0]);
  for (let i = 0; i < n; i++) frames.push(base[Math.min(base.length - 1, Math.floor(i / n * base.length))]);
  for (let i = 0; i < 20; i++) frames.push(base.at(-1));                        // rest after drawing
  for (const p of frames) {
    const x = (mirror ? 1 - p[0] : p[0]) * size, y = p[1] * size;               // physical units in mirrored view
    const ox = 1 - (0.2 + x) / A + 0.5 - 0.5 * 1, oy = 0.1 + y;                  // raw image x = 1 - mirrored
    const r = m.update(hand(pose, ox - 0.5 + gauss(noise), oy - 0.8 + 0.2 + gauss(noise)), A, t += 33);
    if (r.commit) commit = r.commit; if (r.rejected !== undefined) rejected = r.rejected;
  }
  return commit || (rejected !== null ? `rej(${rejected.toFixed(2)})` : null);
}
let fail = 0; const check = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, '->', got); };
for (const size of [.2, .3, .45]) for (const noise of [.002, .006]) {
  check(`Z size${size} noise${noise}`, run('Z', 'Z', { size, noise }), 'Z');
  check(`J size${size} noise${noise}`, run('J', 'J', { size, noise }), 'J');
}
check('Z left-handed (mirrored)', run('Z', 'Z', { mirror: true }), 'Z');
check('J left-handed (mirrored)', run('J', 'J', { mirror: true }), 'J');
check('Z slow 1.8s', run('Z', 'Z', { secs: 1.8 }), 'Z');
check('Z fast 0.6s', run('Z', 'Z', { secs: .6 }), 'Z');
for (const s of ['line', 'circle', 'wave', 'diag']) { check(`pose Z + ${s} => none`, String(run('Z', s)).startsWith('rej') || run('Z', s) === null ? 'none' : run('Z', s), 'none'); check(`pose J + ${s} => none`, String(run('J', s)).startsWith('rej') || run('J', s) === null ? 'none' : run('J', s), 'none'); }
check('Z shape in J pose => none', run('J', 'Z') === 'Z' ? 'Z' : 'none', 'none');
check('standing still (Z pose) => none', run('Z', 'line', { size: 0.002 }) === null ? 'none' : 'x', 'none');
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
