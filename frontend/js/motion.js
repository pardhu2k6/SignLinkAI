// Recognises the two motion letters: J (little finger draws a J) and Z (index finger draws a Z).
// Idea: a still pose says WHICH finger to follow, then the fingertip path is matched to a template ($1-style, no ML needed).
const N = 32;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

function tpl(poly) {            // dense polyline -> N evenly spaced points
  return resample(poly);
}
function pathLen(p) { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i-1][0], p[i][1] - p[i-1][1]); return d; }
export function resample(pts, n = N) {
  const I = pathLen(pts) / (n - 1); if (!(I > 0)) return null;
  const src = pts.map(p => p.slice()), out = [src[0]]; let D = 0;
  for (let i = 1; i < src.length; i++) {
    let d = Math.hypot(src[i][0] - src[i-1][0], src[i][1] - src[i-1][1]);
    while (D + d >= I && d > 0) {
      const t = (I - D) / d, q = [src[i-1][0] + t * (src[i][0] - src[i-1][0]), src[i-1][1] + t * (src[i][1] - src[i-1][1])];
      out.push(q); src.splice(i, 0, q); d = Math.hypot(src[i][0] - q[0], src[i][1] - q[1]); D = 0;
    }
    D += d;
  }
  while (out.length < n) out.push(src[src.length - 1].slice());
  return out.slice(0, n);
}
function normalize(pts) {       // centre on bbox, scale longest side to 1 (keeps aspect ratio)
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), s = Math.max(x1 - x0, y1 - y0, 1e-6);
  return pts.map(p => [(p[0] - (x0 + x1) / 2) / s, (p[1] - (y0 + y1) / 2) / s]);
}
const dist = (a, b) => a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;

// y grows downward. x as seen in the MIRRORED preview (what the signer sees).
const BASE = {
  Z: [[0, 0], [1, 0], [0, 1], [1, 1]],
  J: [[.8, 0], [.8, .45], [.77, .72], [.65, .9], [.45, 1], [.25, .95], [.12, .78]],
};
const dense = poly => { const o = []; for (let i = 1; i < poly.length; i++) for (let t = 0; t < 12; t++) o.push([poly[i-1][0] + (poly[i][0] - poly[i-1][0]) * t / 12, poly[i-1][1] + (poly[i][1] - poly[i-1][1]) * t / 12]); o.push(poly[poly.length - 1]); return o; };
const TEMPLATES = {};
for (const [k, poly] of Object.entries(BASE)) {
  const a = normalize(resample(dense(poly))); TEMPLATES[k] = [a, a.map(p => [-p[0], p[1]])];   // + mirrored (left-handed signers)
}
// max allowed distance to the template; calibrated on 400 sloppy hand-drawn samples per letter (tests/shape_calibration.mjs)
export const MATCH = { Z: 0.235, J: 0.21 };
/** distance between a drawn path and a letter's template (smaller = better) */
export function matchPath(kind, path) {
  const r = resample(path); if (!r) return Infinity;
  const n = normalize(r); return Math.min(...TEMPLATES[kind].map(t => dist(n, t)));
}

/** which still pose is the hand making? 'Z' = only index up, 'J' = only little finger up */
export function gateOf(f) {
  const P = i => [f[3*i], f[3*i+1]], d = (i) => Math.hypot(P(i)[0] - f[0], P(i)[1] - f[1]);
  const up = (t, p) => d(t) > d(p) * 1.12, down = (t, p) => d(t) < d(p) * 1.02;
  const idx = up(8, 6), mid = up(12, 10), rng = up(16, 14), pky = up(20, 18);
  if (idx && down(12, 10) && down(16, 14) && down(20, 18)) return 'Z';
  if (pky && down(8, 6) && down(12, 10) && down(16, 14)) return 'J';
  return null;
}
const TIP = { Z: 8, J: 20 };

export class MotionRecognizer {
  constructor() { this.reset(); this.cool = 0; }
  reset() { this.state = 'idle'; this.kind = null; this.buf = []; this.miss = 0; this.trail = []; }
  /** flat: 63 landmark values; aspect = video width/height (so x and y have equal scale) */
  update(flat, aspect = 4 / 3, now = performance.now()) {
    if (now < this.cool) { this.reset(); return { state: 'idle', gate: null, trail: [] }; }
    const gate = flat ? gateOf(flat) : null;
    if (!gate || (this.kind && gate !== this.kind)) {
      if (this.state === 'tracking' && ++this.miss <= 12 && this.kind) return flat ? this._frame(flat, now, aspect, this.kind) : { state: 'tracking', gate: null, kind: this.kind, trail: this.trail };
      const res = this.state === 'tracking' ? this._finish(now) : null;
      this.reset(); return res || { state: 'idle', gate, trail: [] };
    }
    this.kind = gate; this.miss = 0;
    return this._frame(flat, now, aspect, gate);
  }
  _frame(flat, now, aspect, kind) {
    const t = TIP[kind], L = Math.hypot((flat[27] - flat[0]) * aspect, flat[28] - flat[1]) || 1e-6;
    const pt = { x: (1 - flat[3*t]) * aspect, y: flat[3*t+1], rx: flat[3*t], ry: flat[3*t+1], t: now, L };
    this.buf.push(pt);
    if (this.state === 'idle') this.state = 'armed';
    if (this.state === 'armed') {
      while (this.buf.length > 1 && now - this.buf[0].t > 450) this.buf.shift();       // short pre-roll
      const a = this.buf[0], moved = Math.hypot(pt.x - a.x, pt.y - a.y) / L;
      if (moved > 0.22) { this.state = 'tracking'; this.t0 = now; }
    } else if (this.state === 'tracking') {
      const recent = this.buf.filter(p => now - p.t < 450);
      const xs = recent.map(p => p.x), ys = recent.map(p => p.y);
      const still = recent.length > 8 && Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / L < 0.22;   // hand has come to rest (robust to tracker jitter)
      if (still || now - this.t0 > 2800) { const res = this._finish(now); this.reset(); return res || { state: 'idle', gate: kind, trail: [] }; }
    }
    this.trail = this.buf.map(p => ({ x: p.rx, y: p.ry }));
    return { state: this.state, gate: kind, kind, trail: this.trail, progress: Math.min(1, (now - (this.t0 || now)) / 1200) };
  }
  _finish(now) {
    const kind = this.kind; if (!kind || this.buf.length < 8) return null;
    let b = this.buf.slice(); const L = b[b.length - 1].L;
    const mean = a => [a.reduce((s, p) => s + p.x, 0) / a.length, a.reduce((s, p) => s + p.y, 0) / a.length];
    const far = (p, c) => Math.hypot(p.x - c[0], p.y - c[1]) / L > 0.12;
    const tail = mean(b.slice(-6)); while (b.length > 8 && !far(b[b.length - 1], tail)) b.pop();     // drop resting tail
    const head = mean(b.slice(0, 6)); while (b.length > 8 && !far(b[0], head)) b.shift();            // drop resting start
    const path = b.map(p => [p.x, p.y]), xs = path.map(p => p[0]), ys = path.map(p => p[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / L;
    const len = pathLen(path) / L;
    if (size < 0.35 || len < 0.6) return len > 0.35 ? { state: 'idle', gate: kind, reason: 'small' } : null;       // too small to be a letter
    const d = matchPath(kind, path);
    this.cool = now + 900;
    return d <= MATCH[kind] ? { state: 'done', gate: kind, kind, commit: kind, score: d, trail: this.buf.map(p => ({ x: p.rx, y: p.ry })) }
                            : { state: 'idle', gate: kind, kind, rejected: d, limit: MATCH[kind], reason: 'shape' };
  }
}
