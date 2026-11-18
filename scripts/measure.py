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
  load1, cores the machine's 1-minute load average when the run started, and its
              core count: a timing taken on a busy machine is slower than the engine

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
import asyncio, datetime, json, os, platform, random, sys, tempfile, time, urllib.parse

from playwright.async_api import async_playwright

# These scripts are run with `python -I`, which leaves the script's folder off the import path.
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from measure_lib import check_results_document, chrome_args, chrome_note, close_context, engine_summary, load_note, machine_load, measure_args, read_results, renderer_rss, runs_note, samples_shell, stamp_rows, stopped_path, write_raw, where_note

# Parsed, and refused if it would mix documents in the main table, before any browser starts.
ARGS = measure_args(sys.argv[1:])
check_results_document(ARGS.doc, ARGS.results)

BASE = "https://viewers.benchmarks.law"
FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main"
# --doc ID picks one; the default is the rich sample the published table uses.
DOCS = {
    "showcase": ("showcase.docx", "showcase.docx (47,871 B)"),
    "redline": ("redline.docx", "redline.docx (80,450 B): 23 tracked changes, 6 comments"),
    "lorem-500": ("lorem-500.docx", "lorem-500.docx (467,814 B): 500 pages in Microsoft Word"),
}
DOC_ID = ARGS.doc
DOC = f"{FIXTURES}/{DOCS[DOC_ID][0]}"
TIMEOUT_S = 240
ALL = ["apryse", "canvas-editor", "docen", "docxodus", "eigenpal", "folio", "google-viewer", "nutrient", "plate", "superdoc", "word-online", "wordcraft",
       "betteroffice", "onlyoffice", "opendoc", "react-docx", "univer"]
# Cross-origin frames: the page sees only the frame's load event.
FRAME = {"google-viewer", "word-online"}
FRAME_HOW = "frame load event (cross-origin: the page cannot see when the vendor finished rendering)"


async def one(pw, slug: str) -> dict:
    src = f"{DOC}?n={random.getrandbits(48):x}"
    url = f"{BASE}/v/{slug}?src={urllib.parse.quote(src, safe='')}"
    with tempfile.TemporaryDirectory() as profile:
        ctx = await pw.chromium.launch_persistent_context(profile, channel="chrome", headless=False, args=chrome_args(), viewport={"width": 1280, "height": 800})
        try:
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        except Exception as e:
            # Chrome started and gave no page: it is still there, and is closed like any other run's.
            left = await close_context(ctx, profile)
            return {"engine": slug, **machine_load(), "error": f"{type(e).__name__}: {e}"[:300], **({"cleanup": left} if left else {})}
        sizes: list[int] = []

        async def finished(req):
            try:
                s = await req.sizes()
                sizes.append(s["responseHeadersSize"] + s["responseBodySize"])
            except Exception:
                sizes.append(0)

        ctx.on("requestfinished", lambda r: asyncio.ensure_future(finished(r)))
        out: dict = {"engine": slug, **machine_load()}
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
            out["chrome"] = (await asyncio.wait_for(cdp.send("Browser.getVersion"), 30)).get("product")
            await cdp.send("Performance.enable")
            m = {x["name"]: x["value"] for x in (await asyncio.wait_for(cdp.send("Performance.getMetrics"), 60))["metrics"]}
            out["heapBytes"] = int(m.get("JSHeapUsedSize", 0))
            out["rendererRss"] = renderer_rss(profile)
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {e}"[:300]
        out["bytes"] = sum(sizes)
        out["requests"] = len(sizes)
        left = await close_context(ctx, profile)
        if left:
            out["cleanup"] = left
            print(f"{slug}: {left}", file=sys.stderr, flush=True)
        return out


async def main():
    engines = ALL if ARGS.engines == "all" else ARGS.engines.split(",")
    runs = ARGS.runs
    out_path = ARGS.results
    res: dict[str, list] = {e: [] for e in engines}
    stopped = None
    async with async_playwright() as pw:
        for r in range(runs):
            for e in engines:
                try:
                    x = await one(pw, e)
                except Exception as ex:
                    # A Chrome that would not start, or gave no page: this run failed, and the runs
                    # already made are still written (one() only catches what happens after setup).
                    x = {"engine": e, **machine_load(), "error": f"{type(ex).__name__}: {ex}"[:300]}
                res[e].append(x)
                print(json.dumps(x), file=sys.stderr, flush=True)
                if x.get("cleanup"):
                    stopped = x["cleanup"]
                    break
            if stopped:
                # A Chrome that would not end is still using the machine: what was measured so far is
                # written, and nothing more is measured beside it.
                print(f"stopping: {stopped}", file=sys.stderr, flush=True)
                break
    # A run that rendered but lost a later reading keeps its time (measure_lib.engine_summary).
    summary = {e: engine_summary(xs) for e, xs in res.items() if xs}  # engines a stopped run never reached keep their entry
    raw = [x for xs in res.values() for x in xs]
    meta = {"measuredAt": datetime.date.today().isoformat(), "environment": environment(runs, raw)}
    print(json.dumps({"engines": summary, "raw": res}, indent=1))
    # A stopped run's runs go beside the day's file: the entries it did not reach keep theirs.
    write_raw(stopped_path(ARGS.raw) if stopped else ARGS.raw, {**meta, "document": DOCS[DOC_ID][1], **({"stopped": stopped} if stopped else {})}, raw)
    if out_path:
        write_results(out_path, summary, meta)
    if ARGS.samples:
        write_sample(ARGS.samples, summary, meta)


def environment(runs: int, raw: list[dict]) -> str:
    where = where_note(f"from {platform.system()} {platform.machine()}")
    return f"{chrome_note(raw)} (installed, headed) via Playwright, fresh profile per run (cold cache), {runs_note(runs, raw)}, median; {where}; {load_note(raw)}"


def write_sample(path: str, summary: dict, meta: dict) -> None:
    """Merge this run into results/samples.json under samples.<doc>.browser."""
    try:
        out = json.load(open(path))
    except (OSError, ValueError):
        out = {}
    document = f"{DOCS[DOC_ID][1]} with a never-seen ?n= per run"
    old = {k: out.get(k) for k in ("measuredAt", "environment")}
    doc = samples_shell(out, DOC_ID, document)["samples"][DOC_ID]
    doc["document"] = document
    framed = {e: ({**s, "how": FRAME_HOW} if e in FRAME and s["renderedMs"] is not None else s) for e, s in summary.items()}
    # Every browser row of every document in the file was published under the old heading: each
    # keeps it, the rows of this run get this run's, and then the heading can change.
    for other in out["samples"].values():
        stamp_rows(other.setdefault("browser", {}), {}, old, meta)
    stamp_rows(doc["browser"], framed, old, meta)
    out.update(meta)
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}", file=sys.stderr)


def write_results(path: str, summary: dict, meta: dict) -> None:
    prev = read_results(path)
    framed = {e: ({**s, "how": FRAME_HOW} if e in FRAME and s["renderedMs"] is not None else s) for e, s in summary.items()}
    # Engines not measured in this run keep the date and environment they were published under.
    engines = stamp_rows(dict(prev.get("engines", {})), framed, {k: prev.get(k) for k in ("measuredAt", "environment")}, meta)
    out = {
        **meta,
        "document": f"{DOCS[DOC_ID][1]} with a never-seen ?n= per run",
        "engines": dict(sorted(engines.items())),
    }
    with open(path, "w") as f:
        f.write(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path}", file=sys.stderr)


asyncio.run(main())
