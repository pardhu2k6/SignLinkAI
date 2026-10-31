"""Checks JS and Python feature extractors agree. Run: python test_parity.py (needs node)."""
import json, subprocess, numpy as np
from features import extract
rng = np.random.default_rng(0)
raw = rng.random((5, 63)).tolist()
js = "import {extractFeatures as e} from '../frontend/js/features.js';" \
     f"const r={json.dumps(raw)};console.log(JSON.stringify(r.map(e)));"
open("_p.mjs", "w").write(js)
out = json.loads(subprocess.check_output(["node", "_p.mjs"]))
err = max(np.abs(np.array(out[i]) - extract(raw[i])).max() for i in range(5))
print("max abs diff:", err); assert err < 1e-6, "JS/Python features diverged!"
import os; os.remove("_p.mjs")
