"""Feature extraction (2D only: x,y). MUST stay identical to frontend/js/features.js (see test_parity.py).
z is ignored on purpose: MediaPipe's z is noisy and differs between photos and live video."""
import numpy as np

TIPS = [4, 8, 12, 16, 20]
CHAINS = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]]
FEATURE_DIM = 72  # 42 coords + 10 tip-tip + 5 tip-wrist + 15 joint cosines


def extract(flat):
    """flat: 63 floats (x,y,z per landmark) -> 72 features (z unused)."""
    p = np.asarray(flat, dtype=np.float64).reshape(21, 3)[:, :2]
    p = p - p[0]
    p = p / max(float(np.linalg.norm(p[9])), 1e-6)   # wrist -> middle-finger MCP
    out = list(p.reshape(-1))
    for i in range(5):
        for j in range(i + 1, 5):
            out.append(float(np.linalg.norm(p[TIPS[i]] - p[TIPS[j]])))
    for t in TIPS:
        out.append(float(np.linalg.norm(p[t])))
    for c in CHAINS:
        for i in range(1, 4):
            a, b = p[c[i - 1]] - p[c[i]], p[c[i + 1]] - p[c[i]]
            out.append(float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)))
    return np.asarray(out, dtype=np.float64)


def augment(flat, rng):
    """Mirror (either hand), in-plane rotation, anisotropic squash (fake 3D tilt), jitter."""
    p = np.asarray(flat, dtype=np.float64).reshape(21, 3)[:, :2].copy()
    p -= p[0]
    if rng.random() < 0.5:
        p[:, 0] *= -1
    a = np.deg2rad(rng.uniform(-18, 18)); c, s = np.cos(a), np.sin(a)
    p = p @ np.array([[c, -s], [s, c]]).T
    p *= np.array([rng.uniform(0.88, 1.12), rng.uniform(0.88, 1.12)])
    p += rng.normal(0, 0.012 * max(np.linalg.norm(p[9]), 1e-6), p.shape)
    out = np.zeros((21, 3)); out[:, :2] = p
    return out.reshape(-1)
