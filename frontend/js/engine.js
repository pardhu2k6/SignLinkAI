import { predict, Stabilizer } from './classifier.js';
import { MotionRecognizer } from './motion.js';

// A J/Z drawing starts from a pose the static model may already have accepted as one of these letters -> replace it
const COMPAT = { J: ['I'], Z: ['D', 'G', 'L', 'P', 'Q', 'X', 'T'] };

/** One object per camera: static letters (neural net + stabiliser) + motion letters (J, Z). */
export class SignEngine {
  constructor(opts = {}) { this.stab = new Stabilizer(opts); this.motion = new MotionRecognizer(); this.holdoff = 0; this.lastStatic = null; }
  reset() { this.stab.reset(); this.motion.reset(); }
  update(f, now = performance.now()) {
    if (!f.flat) { this.stab.update(null); this.motion.reset(); return { candidate: null, conf: 0, progress: 0, commit: null, trail: [] }; }
    const m = this.motion.update(f.flat, f.aspect || 4 / 3, now);
    if (m.commit) {
      const ls = this.lastStatic, replaces = ls && now - ls.time < 3500 && COMPAT[m.commit].includes(ls.label) ? ls.label : null;
      this.stab.reset(); this.holdoff = now + 900; this.lastStatic = null;
      return { candidate: m.commit, conf: 1, progress: 1, commit: m.commit, replaces, trail: m.trail, motion: true };
    }
    const fail = m.reason ? { kind: m.kind || m.gate, reason: m.reason, score: m.rejected, limit: m.limit } : null;
    if (m.state === 'tracking') { this.stab.reset(); return { candidate: m.kind, conf: 0, progress: m.progress || 0, commit: null, trail: m.trail, motion: true, drawing: true }; }
    const p = predict(f.flat);
    const r = this.stab.update(p, now);
    if (now < this.holdoff) { this.stab.reset(); return { ...r, commit: null, trail: [], motionFail: fail }; }
    if (r.commit) this.lastStatic = { label: r.commit, time: now };
    return { ...r, trail: m.trail || [], gate: m.gate, pred: p, motionFail: fail };
  }
}
