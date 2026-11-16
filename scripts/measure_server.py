"""Measure /r/<engine> on the viewer val with plain HTTP: total time, bytes, Server-Timing.

    python3 scripts/measure_server.py docxodus,folio,eigenpal,plate,docen,wordcraft 5
    python3 scripts/measure_server.py all 5 --doc lorem-500 --samples results/samples.json

--doc showcase|redline|lorem-500 picks the document (default: the val's own
default, the rich sample). With --samples PATH the medians go into that file
under samples.<doc>.server (server/samples.ts `SampleResults`). A run that
fails keeps its HTTP status and the first line of the body; a run that never
answers within 180 s is recorded as code 0.
"""
import json, random, re, statistics, subprocess, sys, tempfile

ALL = ["docxodus", "folio", "eigenpal", "plate", "docen", "wordcraft"]
ENGINES = ALL if sys.argv[1] == "all" else sys.argv[1].split(",")
RUNS = int(sys.argv[2])
BASE = "https://viewers.benchmarks.law/r/"
FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main"
DOC = sys.argv[sys.argv.index("--doc") + 1] if "--doc" in sys.argv else None
LIMIT_S = 180


def hit(e):
    n = f"{random.getrandbits(40):x}"
    url = f"{BASE}{e}?n={n}" if not DOC else f"{BASE}{e}?src={FIXTURES}/{DOC}.docx%3Fn%3D{n}"
    with tempfile.NamedTemporaryFile() as body:
        p = subprocess.run(
            ["curl", "-s", "-o", body.name, "-D", "-", "-m", str(LIMIT_S), "-w", "\n%{http_code} %{size_download} %{time_total}", url],
            capture_output=True, text=True,
        )
        out = p.stdout
        code, size, total = out.strip().splitlines()[-1].split()
        r = {"code": int(code), "bytes": int(size), "totalMs": round(float(total) * 1000)}
        r.update((k, float(v)) for k, v in re.findall(r"(\w+);dur=([\d.]+)", out))
        pages = re.search(r"(?im)^x-pages:\s*(\d+)", out)
        if pages:
            r["pages"] = int(pages.group(1))
        if p.returncode == 28:
            r["error"] = f"no complete answer within {LIMIT_S} s (curl timed out after {r['bytes']:,} B)"
            r["code"] = 0
        elif r["code"] != 200:
            r["error"] = open(body.name, errors="replace").read(200).strip().splitlines()[0] if r["bytes"] else "empty body"
        return r


res = {e: [] for e in ENGINES}
for _ in range(RUNS):
    for e in ENGINES:
        x = hit(e)
        res[e].append(x)
        print(e, json.dumps(x), file=sys.stderr, flush=True)
print(json.dumps(res))

if "--samples" in sys.argv:
    path = sys.argv[sys.argv.index("--samples") + 1]
    try:
        out = json.load(open(path))
    except (OSError, ValueError):
        out = {}
    doc = out.setdefault("samples", {}).setdefault(DOC or "showcase", {"browser": {}, "server": {}})
    for e, xs in res.items():
        ok = [x for x in xs if x["code"] == 200]
        med = lambda k: round(statistics.median(x[k] for x in ok if k in x)) if any(k in x for x in ok) else None
        bad = next((x for x in xs if x["code"] != 200), None)
        entry = {"code": 200 if ok else bad["code"], "totalMs": med("totalMs"), "renderMs": med("render"), "bytes": med("bytes"),
                 "pages": med("pages"), "runs": [x["totalMs"] if x["code"] == 200 else None for x in xs]}
        if bad:
            entry["error"] = bad.get("error", f"HTTP {bad['code']}")
        doc.setdefault("server", {})[e] = entry
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}", file=sys.stderr)
