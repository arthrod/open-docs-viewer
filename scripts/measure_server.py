"""Measure /r/<engine> on the viewer val with plain HTTP: total time, bytes, Server-Timing.

    python3 scripts/measure_server.py docxodus,folio,eigenpal,plate,docen,wordcraft,superdoc 5
    python3 scripts/measure_server.py all 5 --doc lorem-500 --samples results/samples.json

--doc showcase|redline|lorem-500 picks the document (default: the val's own
default, the rich sample). With --samples PATH the medians go into that file
under samples.<doc>.server (server/samples.ts `SampleResults`). A run that
fails keeps its HTTP status and the first line of the body; a run that never
answers within 180 s, or whose page stops before its closing </html> (the
connection was closed partway: HTTP 200 and the headers say nothing of it), is
recorded as code 0.

`bytes` is the page itself. WordCraft's page holds one image URL per page and
the images are separate requests, made as each page nears the viewport;
scripts/measure_server_client.py counts what a browser fetches at load.
"""
import json, random, re, subprocess, sys, tempfile

# These scripts are run with `python -I`, which leaves the script's folder off the import path.
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from measure_lib import classify, samples_shell, server_args, server_entry

ARGS = server_args(sys.argv[1:])
ALL = ["docxodus", "folio", "eigenpal", "plate", "docen", "wordcraft", "superdoc"]
ENGINES = ALL if ARGS.engines == "all" else ARGS.engines.split(",")
RUNS = ARGS.runs
BASE = "https://viewers.benchmarks.law/r/"
FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main"
DOC = ARGS.doc
DOCUMENTS = {
    "showcase": "showcase.docx (47,871 B)",
    "redline": "redline.docx (80,450 B): 23 tracked changes, 6 comments",
    "lorem-500": "lorem-500.docx (467,814 B): 500 pages in Microsoft Word",
}
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
        # Any failed transfer (not only a timeout), a page cut off partway, or a non-200 answer.
        with open(body.name, "rb") as f:
            status, error = classify(returncode=p.returncode, code=r["code"], size=r["bytes"], total=float(total), body=f.read(), limit_s=LIMIT_S)
        if error:
            r["httpCode"], r["code"], r["error"] = r["code"], status, error
        return r


res = {e: [] for e in ENGINES}
for _ in range(RUNS):
    for e in ENGINES:
        x = hit(e)
        res[e].append(x)
        print(e, json.dumps(x), file=sys.stderr, flush=True)
print(json.dumps(res))

if ARGS.samples:
    path = ARGS.samples
    try:
        out = json.load(open(path))
    except (OSError, ValueError):
        out = {}
    # The whole shape the landing reads, also when the file is new (measure_lib.samples_shell).
    doc = samples_shell(out, DOC or "showcase", f"{DOCUMENTS[DOC or 'showcase']} with a never-seen ?n= per run")["samples"][DOC or "showcase"]
    for e, xs in res.items():
        doc["server"][e] = server_entry(xs)
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}", file=sys.stderr)
