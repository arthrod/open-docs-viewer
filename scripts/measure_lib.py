"""The parts of the measurement scripts that are plain logic: no browser, no network.

Kept apart so they can be tested (`uv run --with pytest pytest scripts/tests`):
how runs become a published row, how a partial re-run is merged into what is
already published, what counts as a failed transfer, which processes are a
Chrome's renderers, and how a Chrome that will not close is ended.
"""
import argparse
import json
import os
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


def end_chrome(profile: str, wait_s: float = 5.0) -> str | None:
    """End the Chrome started on `profile` and see that it went. Returns what went wrong, or None.

    pkill exiting 1 means nothing matched: it was already gone. After a
    delivered signal the process is looked for until it is gone or `wait_s`
    has passed; one that is still there is reported, so the caller can stop
    instead of measuring the next page beside a leftover browser.
    """
    p = subprocess.run(pkill_args(profile), capture_output=True)
    if p.returncode == 1:
        return None
    if p.returncode != 0:
        return f"pkill exited {p.returncode}: {(p.stderr or b'').decode(errors='replace').strip()[:120]}; that Chrome may still be running"
    deadline = time.monotonic() + wait_s
    while True:
        if subprocess.run(["pgrep", "-f", "--", f"--user-data-dir={profile}"], capture_output=True).returncode != 0:
            return None
        if time.monotonic() >= deadline:
            return f"that Chrome is still running {wait_s:g} s after pkill"
        time.sleep(0.2)


def median(xs: list[dict], key: str) -> int | None:
    """Median of `key` over the runs that have it; None when none does."""
    vs = [x[key] for x in xs if x.get(key) is not None]
    return int(statistics.median(vs)) if vs else None


DOC_IDS = ("showcase", "redline", "lorem-500")


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
    is kept as `incomplete`.
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
    med = lambda k: (lambda v: round(statistics.median(v)) if v else None)([x[k] for x in ok if x.get(k) is not None])  # noqa: E731
    entry = {"code": 200 if ok else bad["code"], "totalMs": med("totalMs"), "renderMs": med("render"), "bytes": med("bytes"),
             "pages": med("pages"), "runs": [x["totalMs"] if x["code"] == 200 else None for x in xs]}
    if bad:
        entry["error"] = bad.get("error", f"HTTP {bad['code']}")
    return entry


def summarize(l: dict) -> dict:
    """One Lighthouse report. A report Lighthouse or we rejected keeps its reason and none of its numbers."""
    out: dict = {"version": l.get("lighthouseVersion")}
    if l.get("runtimeError"):
        out["error"] = f"{l['runtimeError'].get('code')}: {l['runtimeError'].get('message', '')}"[:200]
    final = l.get("finalDisplayedUrl") or l.get("finalUrl") or ""
    if "challenge" in final or "Just a moment" in json.dumps(l.get("audits", {}).get("document-title", {})):
        out["error"] = "the page Google got was a Cloudflare challenge"
    if "error" in out:
        return out
    for k, name in LH_CATS.items():
        s = l.get("categories", {}).get(k, {}).get("score")
        if s is not None:
            out[name] = round(s * 100)
    for k, name in LH_AUDITS.items():
        v = l.get("audits", {}).get(k, {}).get("numericValue")
        if v is not None:
            out[name] = round(v, 3) if name == "cls" else round(v)
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
    and `base`, and entries kept from before get the heading they were
    published under.
    """
    if label:
        rows = result.setdefault("docs", {}).setdefault(label, {})
        old = result.get("docsMeta", {}).get(label) or {k: result[k] for k in PROVENANCE if k in result}
        result.setdefault("docsMeta", {})[label] = dict(meta)
        for k, v in meta.items():
            result.setdefault(k, v)
    else:
        rows = result.setdefault("pages", {})
        old = {k: result[k] for k in PROVENANCE if k in result}
        result.update(meta)
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


def write_raw(path: str | None, meta: dict, raw: list[dict]) -> None:
    """Every run of a measurement, in a file of its own beside the medians."""
    if not path:
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        f.write(json.dumps({**meta, "raw": raw}, indent=1) + "\n")


def first_warm_entry(first: dict, warm: list[dict]) -> dict:
    """One /r/ route's row of the landing's server table: its first request after a deploy, then the warm ones.

    `firstCold` is False when the first request found the engine already
    loaded (its init time is 0): then it was not a first request, and the
    figure is a warm one that must not be read as a cold start.
    """
    ok = [x for x in warm if x["code"] == 200]
    med = lambda k: (lambda v: round(statistics.median(v)) if v else None)([x[k] for x in ok if x.get(k) is not None])  # noqa: E731
    good = first["code"] == 200
    entry = {
        "firstMs": first["totalMs"] if good else None,
        "firstInitMs": round(first["init"]) if good and first.get("init") is not None else None,
        "firstRenderMs": round(first["render"]) if good and first.get("render") is not None else None,
        "firstCold": bool(good and (first.get("init") or 0) > 0),
        "warmMs": med("totalMs"),
        "warmRenderMs": med("render"),
        "bytes": med("bytes"),
        "warmRuns": [x["totalMs"] if x["code"] == 200 else None for x in warm],
    }
    bad = next((x for x in [first, *warm] if x["code"] != 200), None)
    if bad:
        entry["error"] = bad.get("error", f"HTTP {bad['code']}")
    return entry


def chrome_note(raw: list[dict]) -> str:
    """The browser the runs were made in, with its version when the runs recorded it."""
    versions = sorted({str(r["chrome"]).replace("Chrome/", "").replace("HeadlessChrome/", "") for r in raw if r.get("chrome")})
    return "Google Chrome " + " and ".join(versions) if versions else "Google Chrome"
