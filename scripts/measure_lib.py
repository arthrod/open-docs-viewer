"""The parts of the measurement scripts that are plain logic: no browser, no network.

Kept apart so they can be tested (`uv run --with pytest pytest scripts/tests`):
how runs become a published row, how a partial re-run is merged into what is
already published, what counts as a failed transfer, which processes are a
Chrome's renderers, and how a Chrome that will not close is ended.
"""
import argparse
import json
import statistics
import subprocess

LH_CATS = {"performance": "performance", "accessibility": "accessibility", "best-practices": "bestPractices", "seo": "seo"}
LH_AUDITS = {"first-contentful-paint": "fcpMs", "largest-contentful-paint": "lcpMs", "total-blocking-time": "tbtMs", "cumulative-layout-shift": "cls", "speed-index": "speedIndexMs"}
LH_KEYS = [*LH_CATS.values(), *LH_AUDITS.values()]
PROVENANCE = ("measuredAt", "environment", "base")


def pkill_args(profile: str) -> list[str]:
    """`--` first: the pattern starts with `--user-data-dir=`, which pkill otherwise reads as an option and exits 2."""
    return ["pkill", "-f", "--", f"--user-data-dir={profile}"]


def end_chrome(profile: str) -> str | None:
    """End the Chrome started on `profile`. Returns what went wrong, or None (1 = nothing matched: already gone)."""
    p = subprocess.run(pkill_args(profile), capture_output=True)
    if p.returncode in (0, 1):
        return None
    return f"pkill exited {p.returncode}: {(p.stderr or b'').decode(errors='replace').strip()[:120]}; that Chrome may still be running"


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
    return p.parse_args(argv)


def server_args(argv: list[str]) -> argparse.Namespace:
    """scripts/measure_server.py's command line."""
    p = argparse.ArgumentParser(description="Time the /r/ routes with plain HTTP.")
    p.add_argument("engines", help='comma-separated slugs, or "all"')
    p.add_argument("runs", type=_runs)
    p.add_argument("--doc", choices=DOC_IDS, default=None, help="default: the val's own default document (the rich sample)")
    p.add_argument("--samples", metavar="PATH", help="merge into samples.<doc>.server of this file")
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
    """Put a run's entries into the results file, with the provenance of the population they belong to.

    The default table (`pages`) is described by the file's own date and
    environment; a labelled population (`docs.<label>`, the same pages on
    another document) by `docsMeta.<label>`. Neither relabels the other.
    """
    if label:
        result.setdefault("docsMeta", {})[label] = dict(meta)
        result.setdefault("docs", {}).setdefault(label, {}).update(entries)
        for k, v in meta.items():
            result.setdefault(k, v)
    else:
        result.update(meta)
        result.setdefault("pages", {}).update(entries)
    return result
