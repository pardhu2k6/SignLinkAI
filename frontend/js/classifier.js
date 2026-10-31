import { extractFeatures } from './features.js';

let M = null;

export async function loadModel(url = 'model/model.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const m = await r.json();
    m.L = m.layers.map(l => ({ out: l.b.length, inp: l.W[0].length, b: Float32Array.from(l.b), W: Float32Array.from(l.W.flat()) }));
    m.mean = Float32Array.from(m.mean); m.scale = Float32Array.from(m.scale);
    M = m;
  } catch { M = null; }
  return M;
}
export const modelInfo = () => M && { labels: M.labels, ...M.meta };
export const hasModel = () => !!M;

/** flat: 63 raw landmark values -> {label, conf, probs} (~0.1 ms) */
export function predict(flat) {
  if (!M) return null;
  const f = extractFeatures(flat);
  let x = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) x[i] = (f[i] - M.mean[i]) / M.scale[i];
  for (let k = 0; k < M.L.length; k++) {
    const { out, inp, W, b } = M.L[k]; const y = new Float32Array(out);
    for (let j = 0; j < out; j++) { let s = b[j]; const o = j * inp; for (let i = 0; i < inp; i++) s += W[o + i] * x[i]; y[j] = s; }
    if (k < M.L.length - 1) for (let j = 0; j < out; j++) if (y[j] < 0) y[j] = 0;
    x = y;
  }
  let mx = -Infinity; for (const v of x) if (v > mx) mx = v;
  let sum = 0; for (let i = 0; i < x.length; i++) { x[i] = Math.exp(x[i] - mx); sum += x[i]; }
  let best = 0; for (let i = 0; i < x.length; i++) { x[i] /= sum; if (x[i] > x[best]) best = i; }
  return { label: M.labels[best], conf: x[best], probs: x };
}

/**
 * Turns noisy per-frame predictions into clean, committed signs.
 * - averages probabilities over a short window (kills flicker)
 * - needs confidence >= minConf held for holdMs before committing (~0.45s)
 * - same sign is only re-committed after repeatMs (so "LL" works but history isn't spammed)
 */
export class Stabilizer {
  constructor({ window = 8, minConf = 0.8, holdMs = 450, repeatMs = 1300 } = {}) {
    Object.assign(this, { window, minConf, holdMs, repeatMs });
    this.reset();
  }
  reset() { this.buf = []; this.cand = null; this.since = 0; this.committed = false; this.lastCommit = 0; }
  update(pred, now = performance.now()) {
    if (!pred) { this.reset(); return { candidate: null, conf: 0, progress: 0, commit: null }; }
    this.buf.push(pred.probs); if (this.buf.length > this.window) this.buf.shift();
    const n = pred.probs.length, avg = new Float32Array(n);
    for (const p of this.buf) for (let i = 0; i < n; i++) avg[i] += p[i] / this.buf.length;
    let b = 0; for (let i = 1; i < n; i++) if (avg[i] > avg[b]) b = i;
    const label = M.labels[b], conf = avg[b];
    if (conf < this.minConf) { this.cand = null; this.committed = false; return { candidate: null, conf, progress: 0, commit: null }; }
    if (label !== this.cand) { this.cand = label; this.since = now; this.committed = false; }
    let commit = null;
    const held = now - this.since;
    if (!this.committed && held >= this.holdMs) { commit = label; this.committed = true; this.lastCommit = now; }
    else if (this.committed && now - this.lastCommit >= this.repeatMs) { commit = label; this.lastCommit = now; }
    return { candidate: label, conf, progress: this.committed ? 1 : Math.min(1, held / this.holdMs), commit };
  }
}
