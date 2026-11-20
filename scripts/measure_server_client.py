"""Measure what a server-rendered page (/r/<engine>) costs the BROWSER, in real Google Chrome.

scripts/measure_server.py times the route with plain HTTP. This one opens the
same route the way a visitor does and reads the client side: one fresh Chrome
(installed, headed, temporary profile: cold cache) per run, a never-seen ?n=
on the document URL.

Per run:
  loadMs      navigation start → end of the page's load event: the server's
              render, the download, and the browser parsing, laying out and
              decoding every picture of what it was sent
  paintMs     navigation start → first contentful paint
  heapBytes   JSHeapUsedSize (Chrome DevTools Protocol), 1.5 s after load and
              after a forced garbage collection, as scripts/measure.py reads it
              (heapBytesBeforeGc is the reading before it): no engine script
              runs on these pages (Docxodus's paginator excepted), so this is
              close to an empty page's heap
  rendererRss resident memory of every renderer process of that Chrome (`ps`),
              same moment: the DOM, decoded pictures and Chrome's spare renderer
  domNodes    DOM nodes alive in the page
  bytes       response headers + bodies of every finished request

A page whose end did not arrive (the server's answer was cut off; Chrome still
fires the load event on what arrived) is recorded as an error, not as a load
time. The end is known by the server's own Browser/Server control, which it
writes straight before the closing body tag.

WordCraft's page loads its first two page images with the page and every other
one as it nears the viewport, so its figures are for opening the document, not
for having scrolled through all of it.

    uv run --with playwright python -I scripts/measure_server_client.py all showcase,redline,lorem-500 3 --out results/server-client.json
"""
import asyncio, datetime, json, os, platform, random, statistics, sys, tempfile, time, urllib.parse

from playwright.async_api import async_playwright

# These scripts are run with `python -I`, which leaves the script's folder off the import path.
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from measure_lib import quiet_host, chrome_args, chrome_note, client_args, end_chrome, load_note, machine_load, renderer_rss, runs_note, stamp_rows, write_raw, where_note

# Parsed before any browser starts.
ARGS = client_args(sys.argv[1:])

BASE = os.environ.get("ODV_BASE", "https://viewers.benchmarks.law")
FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main"
ALL = ["docxodus", "folio", "eigenpal", "plate", "docen", "wordcraft", "superdoc"]
TIMEOUT_S = int(os.environ.get("ODV_TIMEOUT_S", "360"))
KEYS = ("loadMs", "paintMs", "heapBytes", "rendererRss", "domNodes", "bytes", "requests")


# Every picture that is not lazy has arrived (a page without pictures passes).
EAGER_IMAGES_OK = """() => [...document.querySelectorAll('img:not([loading="lazy"])')].every(i => i.complete && i.naturalWidth > 0)"""


# The server puts its Browser/Server control straight before the page's closing body tag
# (server/navbar.ts): when that control is in the DOM, everything before it arrived. Read from
# the DOM, not from Chrome's copy of the response: on a GitHub runner Chrome could not hand back
# folio's 30 MB page, and a page that had arrived whole was recorded as cut off (2026-11-17).
TAIL_ARRIVED = "() => !!document.querySelector('nav[data-odv-toggle]')"


async def whole(page) -> bool:
    """Whether the page's HTML arrived to its end."""
    try:
        return bool(await asyncio.wait_for(page.evaluate(TAIL_ARRIVED), 60))
    except Exception:
        return False


async def one(pw, slug: str, doc: str) -> dict:
    src = f"{FIXTURES}/{doc}.docx?n={random.getrandbits(48):x}"
    url = f"{BASE}/r/{slug}?src={urllib.parse.quote(src, safe='')}"
    out: dict = {"engine": slug, "doc": doc, **machine_load()}
    with tempfile.TemporaryDirectory() as profile:
        ctx = None
        sizes: list[int] = []
        status: list[int] = []

        async def finished(req):
            try:
                s = await req.sizes()
                sizes.append(s["responseHeadersSize"] + s["responseBodySize"])
            except Exception:
                sizes.append(0)

        try:
            # Inside the handler: a Chrome that fails to start is this run's error, not the end of the script.
            ctx = await pw.chromium.launch_persistent_context(profile, channel="chrome", headless=False, args=chrome_args(), viewport={"width": 1280, "height": 800})
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            ctx.on("requestfinished", lambda r: asyncio.ensure_future(finished(r)))
            page.on("response", lambda r: status.append(r.status) if r.url.startswith(f"{BASE}/r/") else None)
            await page.goto(url, wait_until="commit", timeout=TIMEOUT_S * 1000)
            deadline = time.monotonic() + TIMEOUT_S
            got = None
            while time.monotonic() < deadline:
                try:
                    got = await asyncio.wait_for(page.evaluate(
                        """() => { const n = performance.getEntriesByType('navigation')[0];
                          const p = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
                          return n && n.loadEventEnd > 0 ? {load: Math.round(n.loadEventEnd), paint: p ? Math.round(p.startTime) : null, title: document.title} : null }"""
                    ), 5)
                except Exception:
                    got = None  # the main thread is busy with a very large page: ask again
                if got:
                    break
                await asyncio.sleep(0.1)
            if status and status[0] != 200:
                out["error"] = f"HTTP {status[0]}"
            elif not got:
                out["error"] = f"no load event within {TIMEOUT_S} s"
            elif not await whole(page):
                out["error"] = "the page stopped partway: its end did not arrive"
            elif not await asyncio.wait_for(page.evaluate(EAGER_IMAGES_OK), 30):
                # The load event fires whether or not a picture arrived; a page whose first pages are
                # missing did not load the document. Pictures marked lazy are not required.
                out["error"] = "a page image that loads with the page failed"
            elif "Just a moment" in got["title"] or "Attention Required" in got["title"]:
                out["error"] = "blocked: " + got["title"]
            else:
                out["loadMs"] = got["load"]
                await asyncio.sleep(1.5)
                try:  # first paint can come just after the load event
                    paint = await asyncio.wait_for(page.evaluate("() => performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime ?? null"), 30)
                except Exception:
                    paint = got["paint"]
                if paint is not None:
                    out["paintMs"] = round(paint)
                cdp = await ctx.new_cdp_session(page)
                out["chrome"] = (await asyncio.wait_for(cdp.send("Browser.getVersion"), 30)).get("product")
                await cdp.send("Performance.enable")
                m = {x["name"]: x["value"] for x in (await asyncio.wait_for(cdp.send("Performance.getMetrics"), 60))["metrics"]}
                out["domNodes"] = int(m.get("Nodes", 0))
                out["rendererRss"] = renderer_rss(profile)
                # The heap after a forced collection, as scripts/measure.py reads it: both land
                # under "JS heap". The reading before it is kept beside it.
                out["heapBytesBeforeGc"] = int(m.get("JSHeapUsedSize", 0))
                try:
                    await asyncio.wait_for(cdp.send("HeapProfiler.collectGarbage"), 120)
                    m = {x["name"]: x["value"] for x in (await asyncio.wait_for(cdp.send("Performance.getMetrics"), 60))["metrics"]}
                    out["heapBytes"] = int(m.get("JSHeapUsedSize", 0))
                except Exception as e:
                    out["heapBytes"] = out["heapBytesBeforeGc"]
                    out["heapNotCollected"] = f"{type(e).__name__}: {e}"[:160]  # the figure is then the uncollected one
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {e}"[:300]
        out["bytes"] = sum(sizes)
        out["requests"] = len(sizes)
        try:
            if ctx:
                await asyncio.wait_for(ctx.close(), 20)
        except Exception:
            left = end_chrome(profile)
            if left:
                out["cleanup"] = left
                print(f"{slug}/{doc}: {left}", file=sys.stderr, flush=True)
    return out


STOPPED: list[str] = []  # why the run loop ended early, when it did


async def main():
    engines = ALL if ARGS.engines == "all" else ARGS.engines.split(",")
    docs = ARGS.docs.split(",")
    runs = ARGS.runs
    path = ARGS.out
    raw = []
    stopped = None
    async with async_playwright() as pw:
        for _ in range(runs):
            for d in docs:
                for e in engines:
                    busy = await quiet_host()
                    if busy:
                        stopped = busy
                        break
                    x = await one(pw, e, d)
                    raw.append(x)
                    print(json.dumps(x), file=sys.stderr, flush=True)
                    if x.get("cleanup"):
                        stopped = x["cleanup"]
                        break
                if stopped:
                    break
            if stopped:
                # A Chrome that would not end is still using the machine: what was measured so far is
                # written, and nothing more is measured beside it.
                print(f"stopping: {stopped}", file=sys.stderr, flush=True)
                STOPPED.append(stopped)
                break
    try:
        result = json.load(open(path)) if path else {}
    except (OSError, ValueError):
        result = {}
    where = where_note(f"from {platform.system()} {platform.machine()}")
    meta = {
        "measuredAt": datetime.date.today().isoformat(),
        "environment": f"{chrome_note(raw)} (installed, headed) via Playwright, fresh profile per run (cold cache), {runs_note(runs, raw)}, median; {where}; {load_note(raw)}",
    }
    write_raw(ARGS.raw, meta, raw)
    # Rows not measured in this run keep the date and environment they were published under.
    old = {k: result.get(k) for k in ("measuredAt", "environment")}
    for rows in result.get("docs", {}).values():
        stamp_rows(rows, {}, old, meta)
    result.update(meta)
    for d in docs:
        for e in engines:
            xs = [x for x in raw if x["engine"] == e and x["doc"] == d]
            if not xs:
                continue  # a stopped run never reached it: its entry stays as it was
            ok = [x for x in xs if "loadMs" in x]
            collected = [x for x in ok if "heapBytes" in x and not x.get("heapNotCollected")]
            med = lambda k: int(statistics.median(x[k] for x in ok if k in x)) if any(k in x for x in ok) else None
            result.setdefault("docs", {}).setdefault(d, {})[e] = {
                **{k: med(k) for k in KEYS},
                # As in measure_lib.engine_summary: an uncollected heap stays out of the median.
                **({"heapBytes": int(statistics.median(x["heapBytes"] for x in collected))} if collected else {}),
                "heapNotCollected": sum(1 for x in ok if x.get("heapNotCollected")),
                "runs": [x.get("loadMs") for x in xs],
                "error": next((x["error"] for x in xs if "error" in x), None),
                **meta,
            }
    text = json.dumps(result, indent=1) + "\n"
    if path:
        open(path, "w").write(text)
    else:
        print(text)


asyncio.run(main())
if STOPPED:
    sys.exit(4)  # stopped before the end: what was measured is written, and the caller is told
