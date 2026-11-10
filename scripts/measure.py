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
"""
import asyncio, json, random, statistics, sys, tempfile, time, urllib.parse

from playwright.async_api import async_playwright

BASE = "https://open-docs-viewer.val.run"
DOC = "https://huggingface.co/datasets/arthrod/open-docs-fixtures/resolve/main/showcase.docx"
TIMEOUT_S = 120


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
    engines = sys.argv[1].split(",")
    runs = int(sys.argv[2])
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


asyncio.run(main())
