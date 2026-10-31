import { flatten } from './features.js';

let handsP = null;
function getHands() {
  if (!handsP) {
    const h = new window.Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
    h.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    handsP = h.initialize().then(() => h);
  }
  return handsP;
}

function fingersUp(lm) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let n = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(lm[tip], lm[0]) > d(lm[pip], lm[0]) * 1.1) n++;
  if (d(lm[4], lm[17]) > d(lm[3], lm[17]) * 1.05) n++;
  return n;
}

export class Tracker {
  constructor({ video, canvas, onFrame }) { Object.assign(this, { video, canvas, onFrame, running: false, fps: 0, last: 0 }); }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    this.video.srcObject = this.stream; await this.video.play();
    const hands = await getHands();
    hands.onResults(r => this._results(r));
    this.running = true; this._tok = {}; this._loop(hands, this._tok);
  }
  stop() {
    this.running = false;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.video.srcObject = null;
    const c = this.canvas.getContext('2d'); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  async _loop(hands, tok) {
    while (this.running && this._tok === tok) {
      if (this.video.readyState >= 2) { try { await hands.send({ image: this.video }); } catch (e) { console.error(e); } }
      await new Promise(r => requestAnimationFrame(r));
    }
  }
  _results(r) {
    const v = this.video, cv = this.canvas;
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    const now = performance.now(); const dt = now - this.last; this.last = now;
    if (dt > 0) this.fps = this.fps ? this.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
    const all = r.multiHandLandmarks || [];
    if (!all.length) return this.onFrame({ hands: 0, fps: this.fps });
    let best = 0;
    all.forEach((lm, i) => {
      window.drawConnectors?.(ctx, lm, window.HAND_CONNECTIONS, { color: '#5b4fd6', lineWidth: 3 });
      window.drawLandmarks?.(ctx, lm, { color: '#fff', fillColor: '#ef4444', lineWidth: 1, radius: 3 });
      if (r.multiHandedness[i].score > r.multiHandedness[best].score) best = i;
    });
    const lm = all[best], h = r.multiHandedness[best];
    this.onFrame({
      hands: all.length, fps: this.fps, aspect: v.videoWidth / v.videoHeight, flat: flatten(lm), score: h.score,
      hand: h.label === 'Left' ? 'Right' : 'Left',   // frames are un-mirrored, MediaPipe assumes selfie view
      fingers: fingersUp(lm),
    });
  }
}
