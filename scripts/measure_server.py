# Measure /r/<engine> on the viewer val with plain HTTP: total time, bytes, Server-Timing.
import subprocess, sys, json, random, statistics, re
ENGINES = sys.argv[1].split(",")
RUNS = int(sys.argv[2])
BASE = "https://open-docs-viewer.val.run/r/"
def hit(e):
    out = subprocess.run(["curl", "-s", "-o", "/dev/null", "-D", "-", "-w", "\n%{http_code} %{size_download} %{time_total}", f"{BASE}{e}?n={random.getrandbits(40):x}"], capture_output=True, text=True, timeout=120).stdout
    code, size, total = out.strip().splitlines()[-1].split()
    st = dict((k, float(v)) for k, v in re.findall(r"(\w+);dur=([\d.]+)", out))
    return {"code": int(code), "bytes": int(size), "totalMs": round(float(total) * 1000), **st}
res = {e: [] for e in ENGINES}
for r in range(RUNS):
    for e in ENGINES:
        res[e].append(hit(e))
print(json.dumps(res))
