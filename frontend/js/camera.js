// ONE shared camera for Communicate and Learn: it keeps running when you switch between those pages.
// The <video>/<canvas> pair is simply moved into whichever page is showing.
import { Tracker } from './tracker.js';

export const video = document.createElement('video');
video.playsInline = true; video.muted = true;
export const canvas = document.createElement('canvas');

let handler = () => {}, starting = null;
const tracker = new Tracker({ video, canvas, onFrame: f => handler(f) });

export const cam = {
  running: false,
  wantOn: false,                                     // user wants the camera on (so it resumes automatically after visiting Home/History/About)
  canvas,
  mount(wrap) { wrap.prepend(canvas); wrap.prepend(video); },
  setHandler(h) { handler = h; },
  async start() {
    if (cam.running) return;
    if (!starting) starting = tracker.start().then(() => { cam.running = true; cam.wantOn = true; }).finally(() => { starting = null; });
    return starting;
  },
  stop(keepWant = false) { tracker.stop(); cam.running = false; if (!keepWant) cam.wantOn = false; },
};
