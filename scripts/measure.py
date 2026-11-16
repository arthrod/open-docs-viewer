"""Measure the view-only pages (/v/<engine>) in real Google Chrome.

Each run launches the installed Chrome (headed, channel "chrome") with a fresh
temporary profile, so every run is cold: empty HTTP cache, no service workers.
The document URL carries a never-seen ?n= so no CDN or server cache can serve
a previous fetch of it.

Per run:
  renderedMs  ms from navigation start to <html data-od-rendered> (set by
              client/view.ts two frames after the engine shows the document)
  bytes       response headers + bodies of every finished request, all frames
  requests    finished requests, all frames
  heapBytes   JSHeapUsedSize of the top page (Chrome DevTools Protocol);
              cross-origin frames (Microsoft, Google) are not included
  rendererRss resident memory of every renderer process of that Chrome (`ps`),
              read at the same moment: unlike the JS heap it includes
              WebAssembly memory, canvases, the DOM and cross-origin frames

If Cloudflare (in front of val.run) shows a challenge, the run is recorded as
blocked; nothing here tries to get past it.

    uv run --with playwright python -I scripts/measure.py docxodus,plate 3 > out.json
    uv run --with playwright python -I scripts/measure.py all 3 --results results/browser.json
    uv run --with playwright python -I scripts/measure.py all 3 --doc lorem-500 --samples results/samples.json

--doc showcase|redline|lorem-500 picks the document (default: showcase).
With --samples PATH the summary goes into that file under samples.<doc>.browser
(server/samples.ts `SampleResults`), which the landing's "Other documents"
section renders.

With --results PATH the summary is also written in the shape the landing page
renders (server/results.ts `Results`); engines not measured in this run keep
their previous entry from PATH. scripts/remeasure.sh and the "Re-measure"
GitHub workflow use this.
"""
import asyncio, datetime, json, os, platform, random, statistics, subprocess, sys, tempfile, time, urllib.parse

from playwright.async_api import async_playwright

BASE = "https://viewers.benchmarks.law"
FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main"
# --doc ID picks one; the default is the rich sample the published table uses.
DOCS = {
    "showcase": ("showcase.docx", "showcase.docx (47,871 B)"),
    "redline": ("redline.docx", "redline.docx (80,450 B): 23 tracked changes, 6 comments"),
    "lorem-500": ("lorem-500.docx", "lorem-500.docx (467,814 B): 500 pages in Microsoft Word"),
}
DOC_ID = sys.argv[sys.argv.index("--doc") + 1] if "--doc" in sys.argv else "showcase"
DOC = f"{FIXTURES}/{DOCS[DOC_ID][0]}"
TIMEOUT_S = 240
ALL = ["apryse", "canvas-editor", "docen", "docxodus", "eigenpal", "folio", "google-viewer", "nutrient", "plate", "superdoc", "word-online", "wordcraft"]
# Cross-origin frames: the page sees only the frame's load event.
FRAME = {"google-viewer", "word-online"}
FRAME_HOW = "frame load event (cross-origin: the page cannot see when the vendor finished rendering)"


def renderer_rss(profile: str) -> int:
    """RSS (bytes) of the renderer processes of the Chrome using `profile`."""
    out = subprocess.run(["ps", "-axo", "pid=,ppid=,rss=,command="], capture_output=True, text=True).stdout
    rows = [l.split(None, 3) for l in out.splitlines()]
    rows = [(int(r[0]), int(r[1]), int(r[2]) * 1024, r[3]) for r in rows if len(r) == 4]
    roots = {pid for pid, _, _, cmd in rows if f"--user-data-dir={profile}" in cmd and "--type=" not in cmd}
    return sum(rss for _, ppid, rss, cmd in rows if ppid in roots and "--type=renderer" in cmd)


async def one(pw, slug: str) -> dict:
    src = f"{DOC}?n={random.getrandbits(48):x}"
    url = f"{BASE}/v/{slug}?src={urllib.parse.quote(src, safe='')}"
    with tempfile.TemporaryDirectory() as profile:
        ctx = await pw.chromium.launch_persistent_context(profile, channel="chrome", headless=False, viewport={"width": 1280, "height": 800})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        sizes: list[int] = []

        async def finished(req):
            try:
                s = await req.sizes()
                sizes.append(s["responseHeadersSize"] + s["responseBodySize"])
            except Exception:
                sizes.append(0)

        ctx.on("requestfinished", lambda r: asyncio.ensure_future(finished(r)))
        out: dict = {"engine": slug}
        try:
            await page.goto(url, wait_until="commit", timeout=TIMEOUT_S * 1000)
            deadline = time.monotonic() + TIMEOUT_S
            while time.monotonic() < deadline:
                try:
                    # 5 s per ask: an engine laying out 500 pages can hold the main thread.
                    state = await asyncio.wait_for(page.evaluate(
                        "() => ({r: document.documentElement.dataset.odRendered, e: document.documentElement.dataset.odError, t: document.title})"
                    ), 5)
                except Exception:
                    await asyncio.sleep(0.1)  # a navigation under the call; ask again
                    continue
                if "Just a moment" in (state["t"] or "") or "Attention Required" in (state["t"] or ""):
                    out["blocked"] = state["t"]
                    break
                if state["r"]:
                    out["renderedMs"] = int(state["r"])
                    break
                if state["e"]:
                    out["error"] = state["e"][:300]
                    break
                await asyncio.sleep(0.1)
            else:
                out["error"] = f"not rendered within {TIMEOUT_S}s"
            await asyncio.sleep(1.5)  # let trailing requests finish before counting
            cdp = await ctx.new_cdp_session(page)
            await cdp.send("Performance.enable")
            m = {x["name"]: x["value"] for x in (await asyncio.wait_for(cdp.send("Performance.getMetrics"), 60))["metrics"]}
            out["heapBytes"] = int(m.get("JSHeapUsedSize", 0))
            out["rendererRss"] = renderer_rss(profile)
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {e}"[:300]
        out["bytes"] = sum(sizes)
        out["requests"] = len(sizes)
        try:
            await asyncio.wait_for(ctx.close(), 20)
        except Exception:
            subprocess.run(["pkill", "-f", f"--user-data-dir={profile}"])  # a renderer that never yields
        return out


async def main():
    engines = ALL if sys.argv[1] == "all" else sys.argv[1].split(",")
    runs = int(sys.argv[2])
    out_path = sys.argv[sys.argv.index("--results") + 1] if "--results" in sys.argv else None
    res: dict[str, list] = {e: [] for e in engines}
    async with async_playwright() as pw:
        for r in range(runs):
            for e in engines:
                x = await one(pw, e)
                res[e].append(x)
                print(json.dumps(x), file=sys.stderr, flush=True)
    summary = {}
    for e, xs in res.items():
        ok = [x for x in xs if "renderedMs" in x]
        med = lambda k: int(statistics.median(x[k] for x in ok)) if ok else None
        summary[e] = {
            "renderedMs": med("renderedMs"),
            "runs": [x.get("renderedMs") for x in xs],
            "bytes": med("bytes"),
            "requests": med("requests"),
            "heapBytes": med("heapBytes"),
            "rendererRss": med("rendererRss"),
            "how": "data-od-rendered" if ok else (xs[0].get("blocked") or xs[0].get("error")),
        }
    print(json.dumps({"engines": summary, "raw": res}, indent=1))
    if out_path:
        write_results(out_path, summary, runs)
    if "--samples" in sys.argv:
        write_sample(sys.argv[sys.argv.index("--samples") + 1], summary, runs)


def environment(runs: int) -> str:
    where = os.environ.get("MEASURE_WHERE") or f"from {platform.system()} {platform.machine()}"
    return f"Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), {runs} runs, median; {where}"


def write_sample(path: str, summary: dict, runs: int) -> None:
    """Merge this run into results/samples.json under samples.<doc>.browser."""
    try:
        out = json.load(open(path))
    except (OSError, ValueError):
        out = {}
    out["measuredAt"] = datetime.date.today().isoformat()
    out["environment"] = environment(runs)
    doc = out.setdefault("samples", {}).setdefault(DOC_ID, {"browser": {}, "server": {}})
    doc["document"] = f"{DOCS[DOC_ID][1]} with a never-seen ?n= per run"
    for e, s in summary.items():
        if e in FRAME and s["renderedMs"] is not None:
            s = {**s, "how": FRAME_HOW}
        doc.setdefault("browser", {})[e] = s
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}", file=sys.stderr)


def write_results(path: str, summary: dict, runs: int) -> None:
    try:
        prev = json.load(open(path))
    except (OSError, ValueError):
        prev = {"engines": {}}
    engines = dict(prev.get("engines", {}))
    for e, s in summary.items():
        if e in FRAME and s["renderedMs"] is not None:
            s = {**s, "how": FRAME_HOW}
        engines[e] = s
    out = {
        "measuredAt": datetime.date.today().isoformat(),
        "environment": environment(runs),
        "document": f"{DOCS[DOC_ID][1]} with a never-seen ?n= per run",
        "engines": dict(sorted(engines.items())),
    }
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}", file=sys.stderr)


asyncio.run(main())
