// Mirror of ml/features.py — keep in sync (see ml/test_parity.py).
const TIPS = [4, 8, 12, 16, 20];
const CHAINS = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]];
export const FEATURE_DIM = 72;  // 2D only (x,y); z is ignored on purpose

export function flatten(lm) {
  const f = new Array(63);
  for (let i = 0; i < 21; i++) { f[3*i] = lm[i].x; f[3*i+1] = lm[i].y; f[3*i+2] = lm[i].z; }
  return f;
}

export function extractFeatures(flat) {
  const p = [];
  for (let i = 0; i < 21; i++) p.push([flat[3*i]-flat[0], flat[3*i+1]-flat[1]]);
  const scale = Math.max(Math.hypot(p[9][0], p[9][1]), 1e-6);
  for (const q of p) { q[0] /= scale; q[1] /= scale; }
  const d = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
  const out = [];
  for (const q of p) out.push(q[0], q[1]);
  for (let i = 0; i < 5; i++) for (let j = i+1; j < 5; j++) out.push(d(p[TIPS[i]], p[TIPS[j]]));
  for (const t of TIPS) out.push(Math.hypot(p[t][0], p[t][1]));
  for (const c of CHAINS) for (let i = 1; i < 4; i++) {
    const a = [p[c[i-1]][0]-p[c[i]][0], p[c[i-1]][1]-p[c[i]][1]];
    const b = [p[c[i+1]][0]-p[c[i]][0], p[c[i+1]][1]-p[c[i]][1]];
    out.push((a[0]*b[0]+a[1]*b[1]) / (Math.hypot(a[0],a[1])*Math.hypot(b[0],b[1]) + 1e-9));
  }
  return out;
}
