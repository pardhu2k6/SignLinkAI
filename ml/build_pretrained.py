"""
Rebuilds the shipped pretrained model (frontend/model/model.json) from PUBLIC landmark datasets.

  train data : AkramOM606/American-Sign-Language-Detection  (MIT)  -> model/keypoint_classifier/keypoint.csv
  check data : EvaNathani/SignBridge (no licence, used ONLY to measure accuracy on a different source)

Usage:
  git clone --depth 1 https://github.com/AkramOM606/American-Sign-Language-Detection data/akram
  git clone --depth 1 https://github.com/EvaNathani/SignBridge data/eva        # optional cross-check
  python build_pretrained.py
J and Z are excluded: they are motion signs and can't be recognised from one still frame.
"""
import csv, json, time
from pathlib import Path

import numpy as np
from sklearn.metrics import classification_report
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler

from features import augment, extract

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "frontend" / "model" / "model.json"
ALL = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
LETTERS = [c for c in ALL if c not in "JZ"]
PER_CLASS, AUG = 1500, 4
rng = np.random.default_rng(0)


def load_akram():
    rows = []
    for r in csv.reader(open(HERE / "data/akram/model/keypoint_classifier/keypoint.csv", encoding="utf-8-sig")):
        if len(r) == 43:
            try: rows.append([float(v) for v in r])
            except ValueError: pass
    a = np.array(rows); y = np.array([ALL[int(i)] for i in a[:, 0]])
    X = np.zeros((len(a), 21, 3)); X[:, :, :2] = a[:, 1:].reshape(-1, 21, 2)
    m = np.isin(y, LETTERS); return X.reshape(len(a), 63)[m], y[m]


def load_eva():
    p = HERE / "data/eva/data"
    if not p.exists(): return None
    import pandas as pd
    d = pd.concat([pd.read_csv(p / f"keypoints_{s}.csv") for s in ("train", "val", "test")])
    d = d[d.label.isin(LETTERS)]; return d.iloc[:, :63].values, d.label.values


def balanced(X, y, n):
    idx = np.concatenate([rng.permutation(np.where(y == c)[0])[:n] for c in np.unique(y)]); return X[idx], y[idx]


def featurize(X, y, k):
    F, Y = [], []
    for r, l in zip(X, y):
        F.append(extract(r)); Y.append(l)
        for _ in range(k): F.append(extract(augment(r, rng))); Y.append(l)
    return np.array(F), np.array(Y)


def main():
    le = LabelEncoder().fit(LETTERS)
    X, y = balanced(*load_akram(), PER_CLASS)
    F, Y = featurize(X, le.transform(y), AUG); sc = StandardScaler().fit(F)
    print(f"training on {len(X)} real samples ({len(F)} with augmentation), {len(LETTERS)} letters")
    t = time.time()
    clf = MLPClassifier((256, 128), alpha=1e-3, max_iter=120, early_stopping=True, n_iter_no_change=10, random_state=0).fit(sc.transform(F), Y)
    print(f"trained in {time.time()-t:.0f}s")

    acc = None; eva = load_eva()
    if eva is not None:
        Xe, ye = balanced(*eva, 400); Fe = np.array([extract(r) for r in Xe]); pe = clf.predict(sc.transform(Fe)); ye = le.transform(ye)
        acc = float((pe == ye).mean())
        print(classification_report(ye, pe, target_names=le.classes_, zero_division=0))
        print(f"CROSS-DATASET ACCURACY (different people/camera, never seen in training): {acc:.1%}")

    model = {"labels": list(le.classes_), "mean": sc.mean_.tolist(), "scale": sc.scale_.tolist(),
             "layers": [{"W": w.T.round(5).tolist(), "b": b.round(5).tolist()} for w, b in zip(clf.coefs_, clf.intercepts_)],
             "meta": {"accuracy": round(acc, 3) if acc else None, "samples": int(len(X)), "built": time.strftime("%Y-%m-%d"),
                      "source": "AkramOM606/American-Sign-Language-Detection (MIT)"}}
    OUT.parent.mkdir(parents=True, exist_ok=True); OUT.write_text(json.dumps(model, separators=(",", ":")))
    print("saved", OUT, f"({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
