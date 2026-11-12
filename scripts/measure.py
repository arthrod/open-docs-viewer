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

If Cloudflare (in front of val.run) shows a challenge, the run is recorded as
blocked; nothing here tries to get past it.

    uv run --with playwright python -I scripts/measure.py docxodus,plate 3 > out.json
    uv run --with playwright python -I scripts/measure.py all 3 --results results/browser.json

With --results PATH the summary is also written in the shape the landing page
renders (server/results.ts `Results`); engines not measured in this run keep
their previous entry from PATH. scripts/remeasure.sh and the "Re-measure"
GitHub workflow use this.
"""
import asyncio, datetime, json, os, platform, random, statistics, sys, tempfile, time, urllib.parse

from playwright.async_api import async_playwright

BASE = "https://open-docs-viewer.val.run"
DOC = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main/showcase.docx"
TIMEOUT_S = 120
ALL = ["apryse", "canvas-editor", "docen", "docxodus", "eigenpal", "folio", "google-viewer", "nutrient", "plate", "superdoc", "word-online", "wordcraft"]
# Cross-origin frames: the page sees only the frame's load event.
FRAME = {"google-viewer", "word-online"}
FRAME_HOW = "frame load event (cross-origin: the page cannot see when the vendor finished rendering)"


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
                state = await page.evaluate(
                    "() => ({r: document.documentElement.dataset.odRendered, e: document.documentElement.dataset.odError, t: document.title})"
                )
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
            m = {x["name"]: x["value"] for x in (await cdp.send("Performance.getMetrics"))["metrics"]}
            out["heapBytes"] = int(m.get("JSHeapUsedSize", 0))
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {e}"[:300]
        out["bytes"] = sum(sizes)
        out["requests"] = len(sizes)
        await ctx.close()
        return out


async def main():
    engines = ALL if sys.argv[1] == "all" else sys.argv[1].split(",")
    runs = int(sys.argv[2])
    out_path = None
    if "--results" in sys.argv:
        index = sys.argv.index("--results") + 1
        if index >= len(sys.argv) or sys.argv[index].startswith("--"):
            sys.exit("--results requires a path")
        out_path = sys.argv[index]
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
            "how": "data-od-rendered" if ok else (xs[0].get("blocked") or xs[0].get("error")),
        }
    print(json.dumps({"engines": summary, "raw": res}, indent=1))
    if out_path:
        write_results(out_path, summary, runs)


def write_results(path: str, summary: dict, runs: int) -> None:
    try:
        with open(path) as f:
            prev = json.load(f)
    except json.JSONDecodeError as exc:
        sys.exit(f"Cannot parse results file {path}: {exc}")
    except OSError:
        prev = {"engines": {}}
    engines = dict(prev.get("engines", {}))
    for e, s in summary.items():
        if s["renderedMs"] is None:
            continue
        if e in FRAME and s["renderedMs"] is not None:
            s = {**s, "how": FRAME_HOW}
        engines[e] = s
    where = os.environ.get("MEASURE_WHERE") or f"from {platform.system()} {platform.machine()}"
    out = {
        "measuredAt": datetime.date.today().isoformat(),
        "environment": f"Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), {runs} runs, median; {where}",
        "document": "showcase.docx (47,871 B) with a never-seen ?n= per run",
        "engines": dict(sorted(engines.items())),
    }
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}", file=sys.stderr)


asyncio.run(main())
