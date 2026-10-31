import { matchPath, MATCH } from '../frontend/js/motion.js';
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, g = s => (rnd() + rnd() + rnd() - 1.5) * 2 * s, U = (a, b) => a + (b - a) * rnd();
const dense = (pts, n = 14) => { const o = []; for (let i = 1; i < pts.length; i++) for (let t = 0; t < n; t++) o.push([pts[i-1][0] + (pts[i][0]-pts[i-1][0]) * t / n, pts[i-1][1] + (pts[i][1]-pts[i-1][1]) * t / n]); o.push(pts.at(-1)); return o; };
// rounded-corner polyline (human strokes are not sharp)
const round = (pts, r = .12) => { const o = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const a = pts[i-1], b = pts[i], c = pts[i+1]; const p1 = [b[0] + (a[0]-b[0]) * r, b[1] + (a[1]-b[1]) * r], p2 = [b[0] + (c[0]-b[0]) * r, b[1] + (c[1]-b[1]) * r]; o.push(p1); for (let t = 1; t < 4; t++) { const u = t / 4; o.push([(1-u)*(1-u)*p1[0] + 2*u*(1-u)*b[0] + u*u*p2[0], (1-u)*(1-u)*p1[1] + 2*u*(1-u)*b[1] + u*u*p2[1]]); } o.push(p2); } o.push(pts.at(-1)); return o; };
const wob = (pts, s) => pts.map(p => [p[0] + g(s), p[1] + g(s)]);
function sloppyZ() { const sl = U(-.18, .18), w = U(.8, 1.2), h = U(.8, 1.3);
  const c = [[0, 0 + g(.05)], [w * 1 + g(.1), sl + g(.05)], [g(.12), h + g(.08)], [w + g(.1), h + sl + g(.08)]];
  return wob(dense(round(c, U(.05, .2))), .015); }
function sloppyJ() { const tilt = U(-.2, .2), hook = U(.5, 1.0), len = U(.9, 1.3);
  const top = [.8 + tilt, 0]; const pts = [top, [.8, len * .5]]; const r = U(.3, .45) * hook;
  for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * U(.75, 1.0); pts.push([.8 - r + r * Math.cos(a), len * .5 + .25 + r * Math.sin(a)]); }
  return wob(dense(pts, 4), .015); }
const shapes = {
  line: () => dense([[.5, 0], [.5 + g(.05), 1]]), hline: () => dense([[0, .5], [1, .5 + g(.05)]]), diag: () => dense([[0, 0], [1, 1]]),
  circle: () => Array.from({ length: 50 }, (_, i) => [.5 + .5 * Math.cos(i / 50 * 6.28), .5 + .5 * Math.sin(i / 50 * 6.28)]),
  wave: () => Array.from({ length: 50 }, (_, i) => [i / 50, .5 + .25 * Math.sin(i / 50 * 12)]),
  N: () => dense(round([[0, 1], [0, 0], [1, 1], [1, 0]], .1)), seven: () => dense(round([[0, 0], [1, 0], [.3, 1]], .1)), L: () => dense([[0, 0], [0, 1], [1, 1]]),
  check: () => dense([[0, .5], [.3, 1], [1, 0]]), S: () => Array.from({ length: 50 }, (_, i) => { const t = i / 49 * 2 * Math.PI; return [.5 + .3 * Math.sin(t) , t / 6.28 + .15 * Math.sin(2*t)]; }),
  U: () => Array.from({ length: 40 }, (_, i) => { const a = i / 39 * Math.PI; return [.5 - .5 * Math.cos(a), .5 * Math.sin(a) + (i < 5 ? 0 : 0)]; }), zig: () => dense([[0, 0], [.5, 1], [1, 0]]),
};
const N = 400; let bad = 0;
const rate = (kind, fn, n = N) => { let ok = 0; for (let i = 0; i < n; i++) if (matchPath(kind, fn()) <= MATCH[kind]) ok++; return ok / n; };
for (const k of ['Z', 'J']) {
  const acc = rate(k, k === 'Z' ? sloppyZ : sloppyJ); const ok = acc >= 0.97; if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', `${k}: ${(acc * 100).toFixed(1)}% of sloppy hand-drawn ${k}s accepted`);
  for (const n of ['circle', 'wave', 'hline', 'N', 'seven', 'check', 'zig', 'U']) { const fa = rate(k, () => wob(shapes[n](), .02), 100); const ok2 = fa === 0; if (!ok2) bad++; console.log(ok2 ? 'ok  ' : 'FAIL', `  ${k} rejects ${n} (false accept ${(fa * 100).toFixed(0)}%)`); }
}
process.exit(bad ? 1 : 0);
