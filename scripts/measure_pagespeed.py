"""PageSpeed Insights (https://pagespeed.web.dev) on pages of one of the two sites.

    uv run --with playwright python -I scripts/measure_pagespeed.py https://viewers.benchmarks.law v/docxodus,r/docxodus 3 --out results/lighthouse.json
    uv run --with playwright python -I scripts/measure_pagespeed.py https://editors.benchmarks.law e/superdoc,e/plate 3 --out docs/lighthouse/latest.json
    ... v/docxodus,r/docxodus 3 --query "src=<docx url>" --label lorem-500 --out results/lighthouse.json   (the same pages on another document)
    ... e/superdoc 3 --query "open=lorem-500.docx" --label lorem-500 --out docs/lighthouse/latest.json     (an editor opening a Menu sample)

Google runs Lighthouse on its own machines, once emulating a phone (slow 4G,
4x CPU slowdown) and once a desktop, so the figures do not depend on the
computer that asks. The keyless API has a shared daily quota that is usually
spent, so this opens the site itself in the installed Chrome and reads the
Lighthouse result it loads. Up to PSI_PARALLEL (default 4) analyses at a time.
Each page is analysed RUNS times; every figure kept is the median.

What Lighthouse measures is the page LOAD. A viewer page (`/v/`) loads its
document by itself; an editor page (`/e/`) opens on a blank document.

Per page and form factor: the four category scores (0-100), First Contentful
Paint, Largest Contentful Paint, Total Blocking Time, Cumulative Layout
Shift, Speed Index.
"""
import asyncio, datetime, json, os, statistics, sys, urllib.parse

from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip("/")
PAGES = sys.argv[2].split(",")
RUNS = int(sys.argv[3])
OUT = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
# --query "src=<url>" is appended to every page; with --label NAME the medians go under docs.NAME
# (the same pages opening another document) and the default table is left alone.
QUERY = sys.argv[sys.argv.index("--query") + 1] if "--query" in sys.argv else ""
LABEL = sys.argv[sys.argv.index("--label") + 1] if "--label" in sys.argv else None
PARALLEL = int(os.environ.get("PSI_PARALLEL", "4"))
LIMIT_S = 240
CATS = {"performance": "performance", "accessibility": "accessibility", "best-practices": "bestPractices", "seo": "seo"}
AUDITS = {"first-contentful-paint": "fcpMs", "largest-contentful-paint": "lcpMs", "total-blocking-time": "tbtMs", "cumulative-layout-shift": "cls", "speed-index": "speedIndexMs"}
KEYS = [*CATS.values(), *AUDITS.values()]


def reports(text: str) -> list[dict]:
    """The Lighthouse results inside one of the site's batchexecute answers."""
    found: list[dict] = []

    def walk(x):
        if isinstance(x, str):
            if "lighthouseVersion" in x[:20000] or x[:1] in "[{":
                try:
                    walk(json.loads(x))
                except ValueError:
                    pass
        elif isinstance(x, dict):
            if "lighthouseVersion" in x and "categories" in x:
                found.append(x)
            else:
                for v in x.values():
                    walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    for line in text.splitlines():
        if line.startswith("[["):
            walk(line)
    return found


def summarize(l: dict) -> dict:
    out: dict = {"version": l.get("lighthouseVersion")}
    if l.get("runtimeError"):
        out["error"] = f"{l['runtimeError'].get('code')}: {l['runtimeError'].get('message', '')}"[:200]
    final = l.get("finalDisplayedUrl") or l.get("finalUrl") or ""
    if "challenge" in final or "Just a moment" in json.dumps(l.get("audits", {}).get("document-title", {})):
        out["error"] = "the page Google got was a Cloudflare challenge"
    for k, name in CATS.items():
        s = l.get("categories", {}).get(k, {}).get("score")
        if s is not None:
            out[name] = round(s * 100)
    for k, name in AUDITS.items():
        v = l.get("audits", {}).get(k, {}).get("numericValue")
        if v is not None:
            out[name] = round(v, 3) if name == "cls" else round(v)
    return out


async def one(browser, page_path: str) -> dict:
    out: dict = {"page": page_path}
    ctx = await browser.new_context(viewport={"width": 1300, "height": 900})
    page = await ctx.new_page()
    got: dict[str, dict] = {}

    async def body(r):
        if "batchexecute" not in r.url:
            return
        try:
            for l in reports(await r.text()):
                got[l.get("configSettings", {}).get("formFactor", "?")] = summarize(l)
        except Exception:
            pass

    page.on("response", lambda r: asyncio.ensure_future(body(r)))
    try:
        await page.goto("https://pagespeed.web.dev/analysis?url=" + urllib.parse.quote(f"{BASE}/{page_path}" + (f"?{QUERY}" if QUERY else ""), safe=""), timeout=60000)
        for _ in range(LIMIT_S):
            await page.wait_for_timeout(1000)
            if "mobile" in got and "desktop" in got:
                break
        if not got:
            out["error"] = f"PageSpeed gave no result within {LIMIT_S} s: the page never finished loading for it"
        out.update(got)
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {e}"[:200]
    await ctx.close()
    return out


async def main():
    raw: list[dict] = []
    sem = asyncio.Semaphore(PARALLEL)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=False)

        async def job(p):
            async with sem:
                x = await one(browser, p)
                raw.append(x)
                print(json.dumps(x), file=sys.stderr, flush=True)

        for _ in range(RUNS):  # one run of every page, then the next: the runs of a page are spread in time
            await asyncio.gather(*(job(p) for p in PAGES))
        await browser.close()
    try:
        result = json.load(open(OUT)) if OUT else {}
    except (OSError, ValueError):
        result = {}
    version = next((x[f]["version"] for x in raw for f in ("desktop", "mobile") if f in x and x[f].get("version")), "")
    result.update({} if LABEL and "measuredAt" in result else {
        "measuredAt": datetime.date.today().isoformat(),
        "environment": f"PageSpeed Insights (pagespeed.web.dev), Lighthouse {version} on Google's servers, {RUNS} analyses per page, median",
        "base": BASE,
    })
    for p in PAGES:
        xs = [x for x in raw if x["page"] == p]
        entry: dict = {}
        for f in ("desktop", "mobile"):
            fs = [x[f] for x in xs if f in x]
            med = lambda k: (lambda v: None if not v else (round(statistics.median(v), 3) if k == "cls" else int(statistics.median(v))))([y[k] for y in fs if k in y])
            entry[f] = {
                **{k: med(k) for k in KEYS},
                "performanceRuns": [x.get(f, {}).get("performance") for x in xs],
                "error": next((y["error"] for y in fs if "error" in y), None) or next((x["error"] for x in xs if "error" in x and f not in x), None),
            }
        (result.setdefault("docs", {}).setdefault(LABEL, {}) if LABEL else result.setdefault("pages", {}))[p] = entry
    text = json.dumps(result, indent=1) + "\n"
    if OUT:
        os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
        open(OUT, "w").write(text)
    else:
        print(text)


asyncio.run(main())
