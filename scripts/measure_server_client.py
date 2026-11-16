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
  heapBytes   JSHeapUsedSize (Chrome DevTools Protocol), 1.5 s after load: no
              engine script runs on these pages (Docxodus's paginator excepted),
              so this is close to an empty page's heap
  rendererRss resident memory of every renderer process of that Chrome (`ps`),
              same moment: the DOM, decoded pictures and Chrome's spare renderer
  domNodes    DOM nodes alive in the page
  bytes       response headers + bodies of every finished request

    uv run --with playwright python -I scripts/measure_server_client.py all showcase,redline,lorem-500 3 --out results/server-client.json
"""
import asyncio, datetime, json, os, platform, random, statistics, subprocess, sys, tempfile, time, urllib.parse

from playwright.async_api import async_playwright

BASE = os.environ.get("ODV_BASE", "https://viewers.benchmarks.law")
FIXTURES = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main"
ALL = ["docxodus", "folio", "eigenpal", "plate", "docen", "wordcraft", "superdoc"]
TIMEOUT_S = int(os.environ.get("ODV_TIMEOUT_S", "360"))
KEYS = ("loadMs", "paintMs", "heapBytes", "rendererRss", "domNodes", "bytes", "requests")


def renderer_rss(profile: str) -> int:
    out = subprocess.run(["ps", "-axo", "pid=,ppid=,rss=,command="], capture_output=True, text=True).stdout
    rows = [l.split(None, 3) for l in out.splitlines()]
    rows = [(int(r[0]), int(r[1]), int(r[2]) * 1024, r[3]) for r in rows if len(r) == 4]
    roots = {pid for pid, _, _, cmd in rows if f"--user-data-dir={profile}" in cmd and "--type=" not in cmd}
    return sum(rss for _, ppid, rss, cmd in rows if ppid in roots and "--type=renderer" in cmd)


async def one(pw, slug: str, doc: str) -> dict:
    src = f"{FIXTURES}/{doc}.docx?n={random.getrandbits(48):x}"
    url = f"{BASE}/r/{slug}?src={urllib.parse.quote(src, safe='')}"
    out: dict = {"engine": slug, "doc": doc}
    with tempfile.TemporaryDirectory() as profile:
        ctx = await pw.chromium.launch_persistent_context(profile, channel="chrome", headless=False, viewport={"width": 1280, "height": 800})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        sizes: list[int] = []
        status: list[int] = []

        async def finished(req):
            try:
                s = await req.sizes()
                sizes.append(s["responseHeadersSize"] + s["responseBodySize"])
            except Exception:
                sizes.append(0)

        ctx.on("requestfinished", lambda r: asyncio.ensure_future(finished(r)))
        page.on("response", lambda r: status.append(r.status) if r.url.startswith(f"{BASE}/r/") else None)
        try:
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
                await cdp.send("Performance.enable")
                m = {x["name"]: x["value"] for x in (await asyncio.wait_for(cdp.send("Performance.getMetrics"), 60))["metrics"]}
                out["heapBytes"] = int(m.get("JSHeapUsedSize", 0))
                out["domNodes"] = int(m.get("Nodes", 0))
                out["rendererRss"] = renderer_rss(profile)
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {e}"[:300]
        out["bytes"] = sum(sizes)
        out["requests"] = len(sizes)
        try:
            await asyncio.wait_for(ctx.close(), 20)
        except Exception:
            subprocess.run(["pkill", "-f", f"--user-data-dir={profile}"])
    return out


async def main():
    engines = ALL if sys.argv[1] == "all" else sys.argv[1].split(",")
    docs = sys.argv[2].split(",")
    runs = int(sys.argv[3])
    path = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    raw = []
    async with async_playwright() as pw:
        for _ in range(runs):
            for d in docs:
                for e in engines:
                    x = await one(pw, e, d)
                    raw.append(x)
                    print(json.dumps(x), file=sys.stderr, flush=True)
    try:
        result = json.load(open(path)) if path else {}
    except (OSError, ValueError):
        result = {}
    where = os.environ.get("MEASURE_WHERE") or f"from {platform.system()} {platform.machine()}"
    result["measuredAt"] = datetime.date.today().isoformat()
    result["environment"] = f"Google Chrome (installed, headed) via Playwright, fresh profile per run (cold cache), {runs} runs, median; {where}"
    for d in docs:
        for e in engines:
            xs = [x for x in raw if x["engine"] == e and x["doc"] == d]
            ok = [x for x in xs if "loadMs" in x]
            med = lambda k: int(statistics.median(x[k] for x in ok if k in x)) if any(k in x for x in ok) else None
            result.setdefault("docs", {}).setdefault(d, {})[e] = {
                **{k: med(k) for k in KEYS},
                "runs": [x.get("loadMs") for x in xs],
                "error": next((x["error"] for x in xs if "error" in x), None),
            }
    text = json.dumps(result, indent=1) + "\n"
    if path:
        open(path, "w").write(text)
    else:
        print(text)


asyncio.run(main())
