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
import asyncio, datetime, json, os, sys, urllib.parse

from playwright.async_api import async_playwright

# These scripts are run with `python -I`, which leaves the script's folder off the import path.
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from measure_lib import merge_pagespeed, page_entry, pagespeed_args, summarize, psi_refusal

# Parsed before any browser starts.
ARGS = pagespeed_args(sys.argv[1:])
BASE = ARGS.base.rstrip("/")
PAGES = ARGS.pages.split(",")
RUNS = ARGS.runs
OUT = ARGS.out
# --query "src=<url>" is appended to every page; with --label NAME the medians go under docs.NAME
# (the same pages opening another document) and the default table is left alone.
QUERY = ARGS.query
LABEL = ARGS.label
PARALLEL = int(os.environ.get("PSI_PARALLEL", "4"))
LIMIT_S = 240


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


async def one(browser, page_path: str) -> dict:
    out: dict = {"page": page_path}
    got: dict[str, dict] = {}
    ctx = None

    async def body(r):
        if "batchexecute" not in r.url:
            return
        try:
            for l in reports(await r.text()):
                got[l.get("configSettings", {}).get("formFactor", "?")] = summarize(l)
        except Exception:
            pass

    try:
        # Inside the handler: a Chrome that died between jobs fails here, and that must be this
        # job's error record, not an exception that loses every finished job's results.
        ctx = await browser.new_context(viewport={"width": 1300, "height": 900}, locale="en-US")
        page = await ctx.new_page()
        page.on("response", lambda r: asyncio.ensure_future(body(r)))
        await page.goto("https://pagespeed.web.dev/analysis?url=" + urllib.parse.quote(f"{BASE}/{page_path}" + (f"?{QUERY}" if QUERY else ""), safe=""), timeout=60000)
        refused = None
        for i in range(LIMIT_S):
            await page.wait_for_timeout(1000)
            if "mobile" in got and "desktop" in got:
                break
            if i % 5 == 4 and not got:
                try:
                    refused = psi_refusal(await asyncio.wait_for(page.inner_text("body"), 10))
                except Exception:
                    refused = None
                if refused:
                    break
        if refused and not got:
            out["error"] = refused
        elif not got:
            out["error"] = f"PageSpeed gave no result within {LIMIT_S} s: the page never finished loading for it"
        out.update(got)
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {e}"[:200]
    finally:
        if ctx:
            try:
                # Bounded: a context that never closes would hold this job, and with it the whole run.
                await asyncio.wait_for(ctx.close(), 20)
            except Exception as e:
                # The browser is gone or stuck; the other jobs go on. Kept in the raw file: a context
                # that would not close explains a later job that found no browser.
                out["cleanupError"] = f"{type(e).__name__}: {e}"[:200]
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
    meta = {
        "measuredAt": datetime.date.today().isoformat(),
        "environment": f"PageSpeed Insights (pagespeed.web.dev), Lighthouse {version} on Google's servers, {RUNS} analyses per page and form factor, median of those that gave a result",
        "base": BASE,
    }
    # A rejected report has no numbers (summarize), each form factor has its own error (page_entry),
    # and a --label run is dated on its own, not under the default table's date (merge_pagespeed).
    entries = {p: page_entry([x for x in raw if x["page"] == p], LIMIT_S) for p in PAGES}
    merge_pagespeed(result, entries, LABEL, meta)
    if ARGS.raw:
        # Every analysis, beside the medians: a page whose analyses disagree can be read run by run.
        os.makedirs(os.path.dirname(ARGS.raw) or ".", exist_ok=True)
        with open(ARGS.raw, "w") as f:
            f.write(json.dumps({**meta, "query": QUERY, "raw": raw}, indent=1) + "\n")
    text = json.dumps(result, indent=1) + "\n"
    if OUT:
        os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
        open(OUT, "w").write(text)
    else:
        print(text)


asyncio.run(main())
