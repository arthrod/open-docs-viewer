"""The parts of the measurement scripts that are plain logic: no browser, no network.

Kept apart so they can be tested (`uv run --with pytest pytest scripts/tests`):
how runs become a published row, how a partial re-run is merged into what is
already published, what counts as a failed transfer, which processes are a
Chrome's renderers, and how a Chrome that will not close is ended.
"""
import argparse
import asyncio
import datetime
import json
import os
import shlex
import re
import statistics
import subprocess
import time

LH_CATS = {"performance": "performance", "accessibility": "accessibility", "best-practices": "bestPractices", "seo": "seo"}
LH_AUDITS = {"first-contentful-paint": "fcpMs", "largest-contentful-paint": "lcpMs", "total-blocking-time": "tbtMs", "cumulative-layout-shift": "cls", "speed-index": "speedIndexMs"}
LH_KEYS = [*LH_CATS.values(), *LH_AUDITS.values()]
PROVENANCE = ("measuredAt", "environment", "base")


def pkill_args(profile: str) -> list[str]:
    """`--` first: the pattern starts with `--user-data-dir=`, which pkill otherwise reads as an option and exits 2."""
    return ["pkill", "-f", "--", f"--user-data-dir={profile}"]


async def close_context(ctx, profile: str, wait_s: float = 20) -> str | None:
    """Close a Playwright context, and end its Chrome if it will not close. Returns what went wrong, or None.

    Used on every way out of a run, the setup failures included: a context
    whose page could not be opened still has a Chrome behind it.
    """
    try:
        await asyncio.wait_for(ctx.close(), wait_s)
        return None
    except Exception:
        return end_chrome(profile)  # a renderer that never yields does not close either


def stopped_path(path: str | None, now: datetime.datetime | None = None) -> str | None:
    """Where a run that was stopped early writes its runs: beside `path`, never over it.

    The medians file keeps the earlier entries of the engines such a run never
    reached; were the day's raw file overwritten, those entries would have no
    runs behind them.
    """
    if not path:
        return path
    stamp = (now or datetime.datetime.now(datetime.timezone.utc)).strftime("%H%M%SZ")
    root, ext = os.path.splitext(path)
    return f"{root}-stopped-{stamp}{ext}"


def end_chrome(profile: str, wait_s: float = 5.0) -> str | None:
    """End the Chrome started on `profile` and see that it went. Returns what went wrong, or None.

    After pkill the process is looked for with pgrep until it is gone (pgrep
    exits 1) or `wait_s` has passed; one that is still there is reported, so
    the caller can stop instead of measuring the next page beside a leftover
    browser. pkill's own exit 1 proves nothing (on procps it is also "matched,
    none could be signalled"), a tool that fails (exit 2 or 3) or cannot be
    started at all is reported the same way: none of them shows that Chrome went.
    """
    try:
        return _end_chrome(profile, wait_s)
    except OSError as e:  # pkill or pgrep could not be started
        return f"{type(e).__name__}: {e}"[:160] + "; that Chrome may still be running"


def _end_chrome(profile: str, wait_s: float) -> str | None:
    p = subprocess.run(pkill_args(profile), capture_output=True)
    # 1 is "nothing matched" on macOS; on procps it can also be "matched, none could be signalled".
    # Either way the process is looked for below, so a Chrome that was not signalled is reported.
    if p.returncode not in (0, 1):
        return f"pkill exited {p.returncode}: {(p.stderr or b'').decode(errors='replace').strip()[:120]}; that Chrome may still be running"
    deadline = time.monotonic() + wait_s
    while True:
        g = subprocess.run(["pgrep", "-f", "--", f"--user-data-dir={profile}"], capture_output=True)
        if g.returncode == 1:
            return None  # nothing matched: it is gone
        if g.returncode != 0:  # 2 or 3: pgrep itself failed, which is not proof that Chrome went
            return f"pgrep exited {g.returncode}: {(g.stderr or b'').decode(errors='replace').strip()[:120]}; that Chrome may still be running"
        if time.monotonic() >= deadline:
            return f"that Chrome is still running {wait_s:g} s after pkill"
        time.sleep(0.2)


def median(xs: list[dict], key: str) -> int | None:
    """Median of `key` over the runs that have it; None when none does."""
    vs = [x[key] for x in xs if x.get(key) is not None]
    return int(statistics.median(vs)) if vs else None


DOC_IDS = ("showcase", "redline", "lorem-500")


def chrome_args(env: dict | None = None) -> list[str]:
    """Extra Chrome start-up flags from OD_CHROME_ARGS, none by default.

    Split as a shell would: flags are separated by spaces, and quotes keep a value with spaces
    whole (`--user-agent="Benchmark Browser"`). A container needs them: Chrome will not start as
    root with its sandbox, and a small /dev/shm crashes it on a large document. A flag can change
    what is measured, so where_note() puts them in the published environment line.
    """
    return shlex.split((os.environ if env is None else env).get("OD_CHROME_ARGS", ""))


def where_note(default: str, env: dict | None = None) -> str:
    """Where a pass was measured: MEASURE_WHERE or `default`, plus any Chrome flag it does not name."""
    env = os.environ if env is None else env
    where = env.get("MEASURE_WHERE") or default
    unsaid = [a for a in chrome_args(env) if a not in where]
    return f"{where}; Chrome started with {' '.join(unsaid)}" if unsaid else where


def renderer_rss_of(rows: list[tuple[int, int, int, str]], profile: str) -> int:
    """RSS of the renderers of the Chrome started on `profile`, from `ps` rows (pid, ppid, rss, command).

    Every renderer below the browser process counts, not only its direct
    children: on Linux Chrome forks renderers from its zygote, whose parent is
    the browser, so a parent-only filter reads 0 there.
    """
    owned = {pid for pid, _, _, cmd in rows if f"--user-data-dir={profile}" in cmd and "--type=" not in cmd}
    while True:
        more = {pid for pid, ppid, _, _ in rows if ppid in owned and pid not in owned}
        if not more:
            break
        owned |= more
    return sum(rss for pid, _, rss, cmd in rows if pid in owned and "--type=renderer" in cmd)


def renderer_rss(profile: str) -> int:
    """RSS (bytes) of the renderer processes of the Chrome using `profile`, read from `ps`."""
    out = subprocess.run(["ps", "-axo", "pid=,ppid=,rss=,command="], capture_output=True, text=True).stdout
    rows = [l.split(None, 3) for l in out.splitlines()]
    return renderer_rss_of([(int(r[0]), int(r[1]), int(r[2]) * 1024, r[3]) for r in rows if len(r) == 4], profile)


def engine_summary(xs: list[dict]) -> dict:
    """One engine's published entry from its cold runs (scripts/measure.py).

    A run that rendered but lost a later reading (heap, renderer memory) keeps
    its time; the missing metric is skipped for the median and the run's error
    is kept as `incomplete`. A run that did not render keeps its reason as
    `failed`, beside the median of the runs that did.
    """
    ok = [x for x in xs if "renderedMs" in x]
    return {
        "renderedMs": median(ok, "renderedMs"),
        "runs": [x.get("renderedMs") for x in xs],
        "bytes": median(ok, "bytes"),
        "requests": median(ok, "requests"),
        "heapBytes": median(ok, "heapBytes"),
        "rendererRss": median(ok, "rendererRss"),
        "how": "data-od-rendered" if ok else (xs[0].get("blocked") or xs[0].get("error")),
        "incomplete": next((x["error"] for x in ok if x.get("error")), None),
        "failed": next((x.get("blocked") or x.get("error") or "no answer" for x in xs if "renderedMs" not in x), None),
    }


def check_results_document(doc_id: str, results_path: str | None) -> None:
    """--results is the main table, measured on the rich sample only.

    Engines not re-measured keep their entry, so writing another document's
    runs there would label every kept entry with that document.
    """
    if results_path and doc_id != "showcase":
        raise SystemExit(f"--results holds the main table, measured on showcase.docx; write --doc {doc_id} with --samples results/samples.json instead")


def _runs(v: str) -> int:
    n = int(v)
    if n < 1:
        raise argparse.ArgumentTypeError("runs must be 1 or more")
    return n


def measure_args(argv: list[str]) -> argparse.Namespace:
    """scripts/measure.py's command line."""
    p = argparse.ArgumentParser(description="Cold browser benchmark of the /v/ pages.")
    p.add_argument("engines", help='comma-separated slugs, or "all"')
    p.add_argument("runs", type=_runs, help="cold runs per engine")
    p.add_argument("--doc", choices=DOC_IDS, default="showcase")
    p.add_argument("--results", metavar="PATH", help="also write the main table (rich sample only)")
    p.add_argument("--samples", metavar="PATH", help="merge into samples.<doc>.browser of this file")
    p.add_argument("--raw", metavar="PATH", help="write every run to this file")
    return p.parse_args(argv)


def server_args(argv: list[str]) -> argparse.Namespace:
    """scripts/measure_server.py's command line."""
    p = argparse.ArgumentParser(description="Time the /r/ routes with plain HTTP.")
    p.add_argument("engines", help='comma-separated slugs, or "all"')
    p.add_argument("runs", type=_runs)
    p.add_argument("--doc", choices=DOC_IDS, default=None, help="default: the val's own default document (the rich sample)")
    p.add_argument("--samples", metavar="PATH", help="merge into samples.<doc>.server of this file")
    p.add_argument("--first-warm", metavar="PATH", dest="first_warm", help="right after a deploy: one first request per route, then RUNS warm ones, into this file (results/server.json)")
    p.add_argument("--raw", metavar="PATH", help="write every run to this file")
    return p.parse_args(argv)


def classify(*, returncode: int, code: int, size: int, total: float, body: bytes, limit_s: int) -> tuple[int, str | None]:
    """What one curl transfer was: (status to record, error or None). Status 0 = no complete answer.

    curl can exit non-zero AFTER printing HTTP 200 (18: partial file, 56:
    receive failure), and a connection closed cleanly partway leaves exit 0
    and a page without its closing </html>: none of those is a success.
    """
    if returncode == 28:
        return 0, f"no complete answer within {limit_s} s (curl timed out after {size:,} B)"
    if returncode != 0:
        return 0, f"the transfer failed: curl exited {returncode} after {size:,} B (headers said HTTP {code})"
    if code == 200:
        if not body.rstrip().endswith(b"</html>"):
            return 0, f"the answer stopped partway: {size:,} B after {total:.0f} s, without the page's closing </html>"
        return 200, None
    lines = body[:200].decode(errors="replace").strip().splitlines()
    return code, (lines[0].strip() if lines else "empty body")


def samples_shell(out: dict, doc_id: str, document: str) -> dict:
    """The whole shape server/samples.ts `SampleResults` reads, for a file that may not exist yet."""
    out.setdefault("measuredAt", None)
    out.setdefault("environment", "")
    doc = out.setdefault("samples", {}).setdefault(doc_id, {})
    doc.setdefault("document", document)
    doc.setdefault("browser", {})
    doc.setdefault("server", {})
    return out


def server_entry(xs: list[dict]) -> dict:
    """One /r/ route on one sample, from its runs: medians of the successful ones, and a failed run's error beside them."""
    ok = [x for x in xs if x["code"] == 200]
    bad = next((x for x in xs if x["code"] != 200), None)
    med = lambda k: (lambda v: round(statistics.median(v)) if v else None)([x[k] for x in ok if x.get(k) is not None])  # noqa: E731 - a two-line formatter, used on the next lines only
    entry = {"code": 200 if ok else bad["code"], "totalMs": med("totalMs"), "renderMs": med("render"), "bytes": med("bytes"),
             "pages": med("pages"), "runs": [x["totalMs"] if x["code"] == 200 else None for x in xs]}
    if bad:
        entry["error"] = bad.get("error", f"HTTP {bad['code']}")
    return entry


PSI_REFUSALS = ("Unable to resolve", "Lighthouse returned error", "Oops! Something went wrong", "Unable to process request")


def psi_refusal(text: str) -> str | None:
    """PageSpeed's own words when it would not analyse the address at all, or None.

    Such an answer carries no report, so waiting for one ends at the time limit; recorded as
    "never finished loading", it blamed the page for what PageSpeed's first fetch decided
    (it gives a slow first byte, such as a 6 s server render, very little time).
    """
    for line in text.splitlines():
        line = " ".join(line.split())
        if any(k in line for k in PSI_REFUSALS):
            return "PageSpeed refused the address: " + line[:160]
    return None


ENGINE_FAILED = "the engine failed on Google's machine, so there is no score"


def summarize(l: dict) -> dict:
    """One Lighthouse report. A report Lighthouse or we rejected keeps its reason and none of its numbers."""
    out: dict = {"version": l.get("lighthouseVersion")}
    if l.get("fetchTime"):
        out["fetchTime"] = l["fetchTime"]  # when Google made this analysis: the same time twice is one analysis (repeated_analysis)
    # A report of an unexpected shape is read as far as it goes: thrown, it was swallowed by the
    # caller and the analysis then counted as "no result within 240 s".
    audits = l.get("audits") if isinstance(l.get("audits"), dict) else {}
    cats = l.get("categories") if isinstance(l.get("categories"), dict) else {}
    part = lambda d, k: d.get(k) if isinstance(d.get(k), dict) else {}  # noqa: E731 - a one-line reader of nested dicts
    if isinstance(l.get("runtimeError"), dict):
        out["error"] = f"{l['runtimeError'].get('code')}: {l['runtimeError'].get('message', '')}"[:200]
    final = l.get("finalDisplayedUrl") or l.get("finalUrl") or ""
    if "challenge" in str(final) or "Just a moment" in json.dumps(audits.get("document-title", {})):
        out["error"] = "the page Google got was a Cloudflare challenge"
    # The page's own console.error when its engine or its document failed ("[open-docs] WordCraft
    # failed to start"): Lighthouse then scores the error box, and scores it well, because an error
    # box paints fast. PageSpeed gave WordCraft 100 for a page showing "failed to start" (2026-11-16).
    items = part(part(audits, "errors-in-console"), "details").get("items")
    logged = [str(i.get("description", "")) for i in (items if isinstance(items, list) else []) if isinstance(i, dict)]
    # Exactly this site's two tags, at the start of the line: not another script's "[open-docs-…]".
    own = [d for d in logged if re.match(r"\s*\[open-docs(-viewer)?\]", d)]
    if own and "error" not in out:  # a rejected report keeps the first reason it was rejected for
        out["error"] = ENGINE_FAILED + ": " + " ".join(own[0].split())[:160]
    if "error" in out:
        return out
    for k, name in LH_CATS.items():
        s = part(cats, k).get("score")
        if isinstance(s, (int, float)):
            out[name] = round(s * 100)
    for k, name in LH_AUDITS.items():
        v = part(audits, k).get("numericValue")
        if isinstance(v, (int, float)):
            out[name] = round(v, 3) if name == "cls" else round(v)
    return out


PSI_REPEAT = "PageSpeed answered with an analysis it had already made (its cache): not counted again"


def repeated_analysis(x: dict, seen: dict) -> list[str]:
    """The form factors of analysis `x` that PageSpeed served from its cache, and remember the fresh ones.

    PageSpeed keeps an analysis for a short while and answers a second request for the same
    address with it. Five requests in three minutes came back as two or three analyses
    (2026-11-20, five pages per round: 18 of 50 were copies), and a median of copies is not a
    median of five. Every Lighthouse report carries the time it was made: one seen before, for
    the same page and form factor, is a copy. `seen` maps (page, form factor) to those times.
    """
    again = []
    for f in ("desktop", "mobile"):
        at = (x.get(f) or {}).get("fetchTime")
        if not at:
            continue
        times = seen.setdefault((x.get("page"), f), set())
        if at in times:
            again.append(f)
        else:
            times.add(at)
    return again


def without_repeats(x: dict, again: list[str]) -> dict:
    """`x` without the form factors that were copies: each is left out, with the reason, not counted twice."""
    if not again:
        return x
    out = {k: v for k, v in x.items() if k not in again}
    out.setdefault("error", PSI_REPEAT)
    out["repeated"] = again
    return out


def page_entry(xs: list[dict], limit_s: int) -> dict:
    """One page's published entry from its analyses: medians per form factor, each with its own error."""
    entry: dict = {}
    for f in ("desktop", "mobile"):
        fs = [x[f] for x in xs if f in x]

        def med(k):
            v = [y[k] for y in fs if y.get(k) is not None]
            return None if not v else (round(statistics.median(v), 3) if k == "cls" else int(statistics.median(v)))

        missing = next((x.get("error") or f"PageSpeed gave no {f} result within {limit_s} s" for x in xs if f not in x), None)
        # The engine failed in most analyses: the few that "passed" most likely scored the same
        # failing page before it logged its error, so they are not published as the engine's score.
        broke = [y["error"] for y in fs if str(y.get("error", "")).startswith(ENGINE_FAILED)]
        scored = [y for y in fs if y.get("performance") is not None]
        if broke and len(broke) >= len(scored):
            entry[f] = {**{k: None for k in LH_KEYS}, "performanceRuns": [None for _ in xs], "error": broke[0]}
            continue
        entry[f] = {
            **{k: med(k) for k in LH_KEYS},
            "performanceRuns": [x.get(f, {}).get("performance") for x in xs],
            "error": next((y["error"] for y in fs if "error" in y), None) or missing,
        }
    return entry


def merge_pagespeed(result: dict, entries: dict, label: str | None, meta: dict) -> dict:
    """Put a run's entries into the results file, each with the provenance of the run that measured it.

    The default table (`pages`) is headed by the file's own date and
    environment; a labelled population (`docs.<label>`, the same pages on
    another document) by `docsMeta.<label>`. A run of some pages only must not
    redate the others: every entry carries its own `measuredAt`, `environment`
    and `base`, entries kept from before get the heading they were published
    under, and the heading itself changes only with a run of every page.
    """
    root = {k: result[k] for k in PROVENANCE if k in result}
    if label:
        rows = result.setdefault("docs", {}).setdefault(label, {})
        old = result.get("docsMeta", {}).get(label) or root
    else:
        rows = result.setdefault("pages", {})
        old = root
        # A labelled population from before docsMeta was published under this heading: it keeps it,
        # or a later run of the default table would redate it.
        for doc in result.get("docs", {}):
            result.setdefault("docsMeta", {}).setdefault(doc, dict(root))
    # The table's heading is the run that measured the whole table. A run of some of its pages
    # (two analyses of one page, once) must not head rows that had five: its own rows say theirs.
    whole = set(rows) <= set(entries)
    if label:
        heads = result.setdefault("docsMeta", {})
        heads[label] = dict(meta) if whole else heads.get(label) or dict(old or meta)
        for k, v in meta.items():
            result.setdefault(k, v)
    elif whole:
        result.update(meta)
    else:
        for k, v in meta.items():
            result.setdefault(k, v)
    for row in rows.values():
        for k, v in old.items():
            row.setdefault(k, v)
    for p, entry in entries.items():
        rows[p] = {**entry, **{k: meta[k] for k in PROVENANCE}}
    return result


def machine_load() -> dict:
    """How busy the machine is right now: the 1-minute load average and the core count.

    A timing taken while other work holds the processors is slower than the
    engine is; every run records this so a reader can tell.
    """
    return {"load1": round(os.getloadavg()[0], 2), "cores": os.cpu_count() or 1}


def load_note(runs: list[dict]) -> str:
    """One phrase for the environment line: the load the runs were taken under."""
    loads = sorted(r["load1"] for r in runs if isinstance(r.get("load1"), (int, float)))
    if not loads:
        return ""
    cores = next((r["cores"] for r in runs if r.get("cores")), None)
    return f"machine load (1-minute average) median {statistics.median(loads):.1f}, highest {loads[-1]:.1f}" + (f", on {cores} cores" if cores else "")


def runs_note(asked: int, raw: list[dict], key: str = "engine") -> str:
    """"3 runs" when every engine got the runs asked for; otherwise what was actually made."""
    per: dict = {}
    for r in raw:
        k = (r.get(key), r.get("sample") or r.get("doc"))
        per[k] = per.get(k, 0) + 1
    counts = sorted(set(per.values()))
    if not counts or counts == [asked]:
        return f"{asked} runs"
    return f"{counts[0]} to {counts[-1]} runs ({asked} asked; the measuring stopped early)" if len(counts) > 1 else f"{counts[0]} runs ({asked} asked; the measuring stopped early)"


def pagespeed_args(argv: list[str]) -> argparse.Namespace:
    """scripts/measure_pagespeed.py's command line."""
    p = argparse.ArgumentParser(description="PageSpeed Insights on pages of one site, several analyses each.")
    p.add_argument("base", help="the site, e.g. https://viewers.benchmarks.law")
    p.add_argument("pages", help="comma-separated paths under it, e.g. v/docxodus,r/docxodus")
    p.add_argument("runs", type=_positive, help="analyses per page and form factor")
    p.add_argument("--out", metavar="PATH", help="merge the medians into this results file")
    p.add_argument("--query", default="", help='appended to every page, e.g. "src=<docx url>"')
    p.add_argument("--label", help="with --query: file the medians under docs.<label>, leaving the default table alone")
    p.add_argument("--raw", metavar="PATH", help="write every analysis to this file")
    return p.parse_args(argv)


def _positive(v: str) -> int:
    """A count of at least one."""
    n = int(v)
    if n < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return n


def client_args(argv: list[str]) -> argparse.Namespace:
    """scripts/measure_server_client.py's command line."""
    p = argparse.ArgumentParser(description="What a server-rendered page (/r/) costs the browser.")
    p.add_argument("engines", help='comma-separated slugs, or "all"')
    p.add_argument("docs", help="comma-separated documents: " + ", ".join(DOC_IDS))
    p.add_argument("runs", type=_positive, help="cold runs per engine and document")
    p.add_argument("--out", metavar="PATH", help="merge the medians into this results file")
    p.add_argument("--raw", metavar="PATH", help="write every run to this file")
    a = p.parse_args(argv)
    unknown = [d for d in a.docs.split(",") if d not in DOC_IDS]
    if unknown:
        p.error(f"unknown document: {', '.join(unknown)}")
    return a


def stamp_rows(rows: dict, entries: dict, old: dict, meta: dict) -> dict:
    """Put a run's entries into `rows`, each with the date and environment of the run that measured it.

    A run of some engines only must not redate the others: rows kept from
    before get the heading they were published under (`old`; nothing when the
    file had none), and the file's heading can then be set to this run's.
    """
    for row in rows.values():
        if isinstance(row, dict):
            for k, v in old.items():
                if v:
                    row.setdefault(k, v)
    for name, entry in entries.items():
        rows[name] = {**entry, **meta}
    return rows


def read_results(path: str) -> dict:
    """The results file a run merges into: empty when there is none, and a stop when it cannot be read or parsed.

    Read as empty, a corrupt file was replaced by this run's engines alone, and
    every engine the run did not measure lost its published entry.
    """
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"engines": {}}
    except (OSError, ValueError) as e:
        # Unreadable is not absent: treated as empty, the file would be rewritten without the others.
        raise SystemExit(f"cannot read {path}: {e}; fix or remove it before measuring into it")


def write_raw(path: str | None, meta: dict, raw: list[dict]) -> None:
    """Every run of a measurement, in a file of its own beside the medians."""
    if not path:
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        f.write(json.dumps({**meta, "raw": raw}, indent=1) + "\n")


# An engine being loaded takes 100 ms or more (the least measured: 114 ms); a route that only
# awaited a module already there reports 0 to 2 ms. Between the two, this is the line.
COLD_INIT_MS = 10


def first_warm_entry(first: dict, warm: list[dict]) -> dict:
    """One /r/ route's row of the landing's server table: its first request after a deploy, then the warm ones.

    `firstCold` is False when the first request found the engine already
    loaded (its init time is 0): then it was not a first request, and the
    figure is a warm one that must not be read as a cold start.
    `warmColdRuns` counts the warm requests left out of the warm medians.
    """
    ok = [x for x in warm if x["code"] == 200]
    # Several processes serve the site: a later request can land on one that has not loaded the
    # engine (its init time is not 0). That is another first request, not a warm one: it is listed
    # with the others and counted, and the warm medians stand on the requests that found it loaded.
    cold = [x for x in ok if (x.get("init") or 0) >= COLD_INIT_MS]
    settled = [x for x in ok if (x.get("init") or 0) < COLD_INIT_MS]

    def med(k: str, xs: list[dict] = settled) -> int | None:
        v = [x[k] for x in xs if x.get(k) is not None]
        return round(statistics.median(v)) if v else None

    good = first["code"] == 200
    entry = {
        "firstMs": first["totalMs"] if good else None,
        "firstInitMs": round(first["init"]) if good and first.get("init") is not None else None,
        "firstRenderMs": round(first["render"]) if good and first.get("render") is not None else None,
        "firstCold": bool(good and (first.get("init") or 0) >= COLD_INIT_MS),
        "warmMs": med("totalMs"),
        "warmRenderMs": med("render"),
        "bytes": med("bytes", ok),
        "warmRuns": [x["totalMs"] if x["code"] == 200 else None for x in warm],
        "warmColdRuns": len(cold),
    }
    bad = next((x for x in [first, *warm] if x["code"] != 200), None)
    if bad:
        entry["error"] = bad.get("error", f"HTTP {bad['code']}")
    return entry


def chrome_note(raw: list[dict]) -> str:
    """The browser the runs were made in, with its version when the runs recorded it."""
    versions = sorted({str(r["chrome"]).replace("HeadlessChrome/", "headless ").replace("Chrome/", "") for r in raw if r.get("chrome")})
    return "Google Chrome " + " and ".join(versions) if versions else "Google Chrome"
