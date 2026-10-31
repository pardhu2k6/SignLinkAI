"""Draws a reference hand image per letter from real landmark poses (MIT dataset) -> frontend/signs/<LETTER>.svg"""
import csv
from pathlib import Path
import numpy as np
from features import extract

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "frontend" / "signs"; OUT.mkdir(parents=True, exist_ok=True)
ALL = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
SKIN, EDGE = "#f2c8a0", "#b9855a"
CHAINS = {"thumb": [1, 2, 3, 4], "index": [5, 6, 7, 8], "middle": [9, 10, 11, 12], "ring": [13, 14, 15, 16], "pinky": [17, 18, 19, 20]}
WIDTH = {"thumb": 15, "index": 13, "middle": 13.5, "ring": 12.5, "pinky": 11}
MOTION = {  # dashed path drawn over the hand for J and Z (viewBox 200x200)
    "J": "M150 70 C150 120 140 150 105 150 C85 150 78 138 80 126",
    "Z": "M62 62 L138 62 L62 138 L138 138",
}


def load():
    rows = []
    for r in csv.reader(open(HERE / "data/akram/model/keypoint_classifier/keypoint.csv", encoding="utf-8-sig")):
        if len(r) == 43:
            try: rows.append([float(v) for v in r])
            except ValueError: pass
    a = np.array(rows); return a[:, 0].astype(int), a[:, 1:].reshape(-1, 21, 2)


def medoid(P):
    F = np.array([extract(np.c_[p, np.zeros(21)].reshape(-1)) for p in P])
    return P[np.argmin(((F - np.median(F, 0)) ** 2).sum(1))]


def svg(letter, p):
    p = p.copy(); p[:, 1] = p[:, 1]                       # image coords: y grows downward, as captured
    lo, hi = p.min(0), p.max(0); s = 150 / max(hi - lo); c = (lo + hi) / 2
    q = (p - c) * s + 100
    scale_w = max(0.6, min(1.3, s / 120))
    pts = lambda idx: " ".join(f"{q[i,0]:.1f},{q[i,1]:.1f}" for i in idx)
    g = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="18" fill="#f6f4ff"/>']
    g.append(f'<polygon points="{pts([0,1,5,9,13,17])}" fill="{SKIN}" stroke="{EDGE}" stroke-width="2.5" stroke-linejoin="round"/>')
    ext = {n: np.linalg.norm(p[CHAINS[n][-1]] - p[0]) - np.linalg.norm(p[CHAINS[n][0]] - p[0]) for n in CHAINS}
    for name in sorted(CHAINS, key=lambda n: -ext[n]):   # extended fingers first, curled ones drawn on top
        ch = CHAINS[name]; w = WIDTH[name] * scale_w
        g.append(f'<polyline points="{pts(ch)}" fill="none" stroke="{EDGE}" stroke-width="{w+4}" stroke-linecap="round" stroke-linejoin="round"/>')
        g.append(f'<polyline points="{pts(ch)}" fill="none" stroke="{SKIN}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')
        for j in ch[:-1]:   # knuckle creases
            g.append(f'<circle cx="{q[j,0]:.1f}" cy="{q[j,1]:.1f}" r="{w*0.16:.1f}" fill="{EDGE}" opacity=".55"/>')
        t = ch[-1]; g.append(f'<ellipse cx="{q[t,0]:.1f}" cy="{q[t,1]:.1f}" rx="{w*0.32:.1f}" ry="{w*0.38:.1f}" fill="#fff3e8" stroke="{EDGE}" stroke-width="1.4"/>')
    if letter in MOTION:
        g.append(f'<path d="{MOTION[letter]}" fill="none" stroke="#5b4fd6" stroke-width="4" stroke-dasharray="7 6" stroke-linecap="round"/>')
    g.append(f'<text x="100" y="192" text-anchor="middle" font-family="Outfit,sans-serif" font-weight="700" font-size="15" fill="#6b6b8d">{letter}</text></svg>')
    return "".join(g)


y, P = load()
for i, L in enumerate(ALL):
    (OUT / f"{L}.svg").write_text(svg(L, medoid(P[y == i])))
print("wrote", len(list(OUT.glob("*.svg"))), "images")
