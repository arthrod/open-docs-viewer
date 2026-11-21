"""Write the measured tables of README.md from the result files, or check that they match.

    python3 scripts/readme_tables.py            # rewrite the blocks in README.md
    python3 scripts/readme_tables.py --check    # exit 1 if README.md is not what the files say

The blocks are the text between `<!-- NAME:start -->` and `<!-- NAME:end -->`
for NAME in browser, server, samples, server-client, lighthouse and no-server. They are
never edited by hand: a table typed beside its data goes stale.
"""
import json
import math
import re
import sys

ROOT = __file__.rsplit("/", 2)[0]
NAMES = {
    "canvas-editor": "canvas-editor", "docxodus": "Docxodus", "superdoc": "SuperDoc", "plate": "Plate", "docen": "docen",
    "eigenpal": "docx-editor.dev", "folio": "folio", "wordcraft": "WordCraft", "word-online": "Word Online viewer",
    "google-viewer": "Google viewer", "apryse": "Apryse WebViewer", "nutrient": "Nutrient",
    "react-docx": "react-docx", "univer": "Univer", "opendoc": "OpenDoc", "betteroffice": "BetterOffice",
    "onlyoffice": "OnlyOffice (CryptPad build)",
}
# Cross-origin frames: only the frame's load is timed, and the heap read is this page's, not theirs.
FRAMES = {"word-online": "Microsoft", "google-viewer": "Google"}
# Routes with a server render, in the order the landing lists them.
SERVER = ("docxodus", "folio", "eigenpal", "plate", "docen", "wordcraft", "superdoc")
# Routes whose page images are separate requests, made as each page nears the viewport.
IMAGES = {"wordcraft"}
# Why an engine has no server route: the file the landing page reads too.
NO_SERVER = json.load(open(f"{ROOT}/server/no-server.json"))
NO_SERVER_KIND = {"needs-a-browser": "needs a browser", "needs-native": "needs native code", "not-built": "possible, not built"}
DOCS = (("showcase", "Rich sample (`showcase.docx`)"), ("redline", "Redline (`redline.docx`)"), ("lorem-500", "500 pages (`lorem-500.docx`)"))


def rnd(x: float) -> int:
    """Round half up, as the landing page's Math.round does: Python's round() sends 84.5 to 84."""
    return math.floor(x + 0.5)


def num(x) -> str:
    """A number as JavaScript prints it: 0.0 is "0"."""
    return str(int(x)) if isinstance(x, float) and x.is_integer() else str(x)


def ms(n) -> str:
    """A duration."""
    if n is None:
        return "n/a"
    return f"{rnd(n)} ms" if n < 1000 else f"{n / 1000:.2f} s" if n < 10000 else f"{n / 1000:.1f} s"


def heap(r: dict) -> str:
    """A row's JS heap, and how many of its runs could not collect garbage first (the figure is then the earlier reading)."""
    n = r.get("heapNotCollected") or 0
    return mb(r.get("heapBytes")) + (f" (not collected first in {n} run{'s' if n != 1 else ''})" if n else "")


def mb(n) -> str:
    """A size in bytes."""
    if n is None:
        return "n/a"
    return f"{rnd(n / 1024)} KB" if n < 1048576 else f"{n / 1048576:.1f} MB" if n < 10485760 else f"{rnd(n / 1048576)} MB"


def cell(text) -> str:
    """Text safe inside a Markdown table cell: one line, no column separator."""
    return str(text).splitlines()[0].replace("|", "\\|")[:160] if str(text) else ""


def each(runs, failed=None, incomplete=None) -> str:
    """Every run's time, in the order they were made; why a failed one failed, and what a run that rendered then lost."""
    text = ", ".join("failed" if t is None else ms(t) for t in runs or []) or "n/a"
    why = ([f"failed: {cell(failed)}"] if failed and any(t is None for t in runs or []) else []) + ([f"a later reading failed: {cell(incomplete)}"] if incomplete else [])
    return f"{text} ({'; '.join(why)})" if why else text


def dated(name: str, row: dict, head: dict) -> str:
    """The row's name, with its own date when it was measured apart from its table, and its environment when that differs."""
    when, where = row.get("measuredAt") or head.get("measuredAt"), row.get("environment") or head.get("environment")
    if where != head.get("environment"):
        return f"{name} (measured {when}: {str(where).replace('|', chr(92) + '|')})"
    return f"{name} (measured {when})" if when != head.get("measuredAt") else name


def said(head: dict, more: str = "") -> str:
    """The line above a table: when and how it was measured."""
    return f"Measured {head.get('measuredAt')}: {head.get('environment')}.{more}"


def browser_block(data: dict) -> str:
    """The main table: every engine's /v/ page on the rich sample (results/browser.json)."""
    out = [said(data, f" Document: {data.get('document', '')}."), "",
           "| Engine | Cold render (`/v/`) | Each run | Downloaded | Requests | JS heap | Renderer memory |",
           "| --- | ---: | --- | ---: | ---: | ---: | ---: |"]
    for e in NAMES:
        r = data["engines"].get(e)
        if not r:
            continue
        name = dated(NAMES[e], r, data)
        if r.get("renderedMs") is None:
            out.append(f"| {name} | **failed**: {cell(r.get('how') or 'no answer')} | {each(r.get('runs'))} | | | | |")
            continue
        frame = e in FRAMES
        out.append(f"| {name} | {ms(r['renderedMs'])}{' (frame load)' if frame else ''} | {each(r.get('runs'), r.get('failed'), r.get('incomplete'))} | {mb(r.get('bytes'))} | "
                   f"{r.get('requests') if r.get('requests') is not None else 'n/a'} | {'n/a' if frame else heap(r)} | {mb(r.get('rendererRss'))} |")
    return "\n".join(out)


def server_block(data: dict) -> str:
    """The /r/ routes with plain HTTP: the first request after a deploy, then the warm ones (results/server.json)."""
    out = [said(data, f" Document: {data.get('document', '')}." if data.get("document") else ""), "",
           "| Engine (`/r/`) | First request | of which init · render | Warm (median) | of which render | Each warm request | Sent |",
           "| --- | ---: | ---: | ---: | ---: | --- | ---: |"]
    for e in SERVER:
        r = data["engines"].get(e)
        if not r:
            continue
        first = ms(r.get("firstMs")) + (" (already loaded: not a first request)" if r.get("firstCold") is False and r.get("firstMs") is not None else "")
        note = f" **A request failed**: {cell(r['error'])}" if r.get("error") else ""
        sent = mb(r.get("bytes")) + (" + a page image per page viewed" if e in IMAGES else "")
        cold = r.get("warmColdRuns") or 0
        runs = (each(r.get("warmRuns")) if r.get("warmRuns") else "n/a") + (f" ({cold} reached a process that had not loaded the engine: not in the median)" if cold else "")
        out.append(f"| {dated(NAMES[e], r, data)}{note} | {first} | {ms(r.get('firstInitMs'))} · {ms(r.get('firstRenderMs'))} | {ms(r.get('warmMs'))} | "
                   f"{ms(r.get('warmRenderMs'))} | {runs} | {sent} |")
    return "\n".join(out)


def server_cell(e: str, x: dict | None) -> str:
    """One /r/ route on one sample, in a sentence."""
    if x is None:
        return "not measured on this file yet" if e in SERVER else NO_SERVER.get(e, {}).get("cell", "no server route")
    if x.get("totalMs") is None:
        status = x.get("code")
        return f"**failed**: {cell(x.get('error') or f'HTTP {status}')}"
    what = "laying out" if e in IMAGES else "rendering"
    sent = mb(x.get("bytes")) + (" + a page image per page viewed" if e in IMAGES else "")
    failed = sum(1 for t in x.get("runs") or [] if t is None)
    return (f"{ms(x['totalMs'])} ({ms(x.get('renderMs'))} {what}), {sent}" + (f", {x['pages']} pages" if x.get("pages") else "")
            + (f"; {failed} of {len(x['runs'])} runs failed: {cell(x.get('error', ''))}" if failed else ""))


def samples_block(data: dict) -> str:
    """The other documents: the /v/ page and the /r/ route side by side (results/samples.json)."""
    stamped = any(x.get("environment") for d in data["samples"].values() for x in d.get("server", {}).values())
    out = ["Server routes: timed with curl, as their own rows say in the file." if stamped else "Server routes: timed with curl.", ""]
    for doc, title in DOCS[1:]:
        d = data["samples"].get(doc)
        if not d:
            continue
        # Each document is its own pass, with its own load: its table is headed by the run most of
        # its rows come from, and a row from another run says so.
        stamps = [(r.get("measuredAt"), r.get("environment")) for r in d.get("browser", {}).values() if r.get("environment")]
        head = dict(zip(("measuredAt", "environment"), max(dict.fromkeys(stamps), key=stamps.count))) if stamps else data
        out += [f"**{title}**", "", said(head), "", "| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |",
                "| --- | ---: | --- | ---: | ---: | ---: | --- |"]
        for e in NAMES:
            r = d.get("browser", {}).get(e)
            frame = e in FRAMES
            if not r:
                # Measured with curl only (measure_server.py --samples before the browser pass): the
                # server cell is a result, and dropping the row would hide it.
                if d.get("server", {}).get(e):
                    out.append(f"| {NAMES[e]} | not measured | n/a | n/a | n/a | n/a | {server_cell(e, d['server'][e])} |")
                continue
            srv = f"rendered on {FRAMES[e]}'s servers" if frame else server_cell(e, d.get("server", {}).get(e))
            name = dated(NAMES[e], r, head)
            if r.get("renderedMs") is None:
                out.append(f"| {name} | **failed**: {cell(r.get('how') or 'no answer')} | {each(r.get('runs'))} | | | | {srv} |")
                continue
            out.append(f"| {name} | {ms(r['renderedMs'])}{' (frame load)' if frame else ''} | {each(r.get('runs'), r.get('failed'), r.get('incomplete'))} | {'n/a' if frame else heap(r)} | "
                       f"{mb(r.get('rendererRss'))} | {mb(r.get('bytes'))} | {srv} |")
        out.append("")
    return "\n".join(out).rstrip()


def server_client_block(client: dict, browser: dict, samples: dict) -> str:
    """What a server-rendered page costs the browser (results/server-client.json), with the two vendor frames beside it."""
    out = [said(client, " Loaded = navigation start to the end of the load event (server render and download included)."), ""]
    for doc, title in DOCS:
        rows = client.get("docs", {}).get(doc)
        if not rows:
            continue
        out += [f"**{title}**", "", "| Engine (`/r/`) | Loaded | Each run | First paint | JS heap | Renderer memory | DOM nodes | Downloaded |",
                "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |"]
        for e in SERVER:
            r = rows.get(e)
            if not r:
                continue
            name = dated(NAMES[e], r, client)
            if r.get("loadMs") is None:
                out.append(f"| {name} | **failed**: {cell(r.get('error') or 'no answer')} | {each(r.get('runs'))} | | | | | |")
                continue
            nodes = f"{r['domNodes']:,}" if r.get("domNodes") is not None else "n/a"
            out.append(f"| {name} | {ms(r['loadMs'])} | {each(r.get('runs'))} | {ms(r.get('paintMs'))} | {heap(r)} | {mb(r.get('rendererRss'))} | {nodes} | {mb(r.get('bytes'))} |")
        for e, who in FRAMES.items():
            r = (browser.get("engines", {}) if doc == "showcase" else samples.get("samples", {}).get(doc, {}).get("browser", {})).get(e)
            if not r:
                continue
            out.append(f"| {NAMES[e]} (rendered on {who}'s servers; `/v/` frame load) | {ms(r.get('renderedMs'))} | {each(r.get('runs'))} | n/a | n/a | {mb(r.get('rendererRss'))} | n/a | {mb(r.get('bytes'))} |")
        out.append("")
    return "\n".join(out).rstrip()


LH_HEAD = [
    "| Page | Performance | LCP | TBT | CLS | FCP | Speed Index | Accessibility | Best practices | SEO | Performance, each analysis |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
]


def lighthouse_line(label: str, r: dict, head: dict, who: str = "PageSpeed") -> str:
    """One page's row: desktop · mobile in each cell. `who` made the analyses."""
    d, m = r.get("desktop") or {}, r.get("mobile") or {}
    label = dated(label, r, head)
    runs = lambda x: "/".join("fail" if v is None else str(v) for v in x.get("performanceRuns") or [])
    if d.get("performance") is None and m.get("performance") is None:
        # Both reasons, and every analysis: desktop and mobile often fail differently.
        reasons = "; ".join(f"{f}: {cell(x['error'])}" for f, x in (("desktop", d), ("mobile", m)) if x.get("error")) or f"{who} gave no score"
        if d.get("error") and d.get("error") == m.get("error"):
            reasons = cell(d["error"])
        listed = f"{runs(d)} · {runs(m)}" if d.get("performanceRuns") or m.get("performanceRuns") else ""
        return f"| {label} | **no result**: {reasons} | | | | | | | | | {listed} |"
    two = lambda k, f=str: f"{'n/a' if d.get(k) is None else f(d[k])} · {'n/a' if m.get(k) is None else f(m[k])}"
    one = lambda k: d[k] if d.get(k) is not None else "n/a"
    # Why an analysis, or a whole form factor, has no result: said beside the scores, not dropped.
    why = "; ".join(f"{f}: {cell(x['error'])}" for f, x in (("desktop", d), ("mobile", m)) if x.get("error") and any(v is None for v in x.get("performanceRuns") or [None]))
    return (f"| {label} | {two('performance')} | {two('lcpMs', ms)} | {two('tbtMs', ms)} | {two('cls', num)} | {two('fcpMs', ms)} | "
            f"{two('speedIndexMs', ms)} | {one('accessibility')} | {one('bestPractices')} | {one('seo')} | {runs(d)} · {runs(m)}{f' ({why})' if why else ''} |")


def lighthouse_block(data: dict, who: str = "PageSpeed") -> str:
    """Lighthouse: the /v/ pages and the /r/ routes, on the rich sample and on the 500 pages."""
    intro = lambda h: said(h, " Cells read desktop · mobile; accessibility, best practices and SEO are the desktop scores.")
    table = lambda pages, prefix, head: [*LH_HEAD, *[lighthouse_line(NAMES.get(k[2:], k), r, head, who) for k, r in pages.items() if k.startswith(prefix)]]
    out = [intro(data), "", "**Browser pages (`/v/`), rich sample**", "", *table(data["pages"], "v/", data),
           "", "**Server-rendered pages (`/r/`), rich sample**", "", *table(data["pages"], "r/", data)]
    big = data.get("docs", {}).get("lorem-500")
    if big:
        head = data.get("docsMeta", {}).get("lorem-500") or data
        if (head.get("measuredAt"), head.get("environment")) != (data.get("measuredAt"), data.get("environment")):
            out += ["", "The 500-page tables: " + intro(head)]
        out += ["", "**Browser pages (`/v/`), 500 pages (`lorem-500.docx`)**", "", *table(big, "v/", head),
                "", "**Server-rendered pages (`/r/`), 500 pages**", "", *table(big, "r/", head)]
    return "\n".join(out)


def local_block(data: dict) -> str:
    """The same tables from Lighthouse run on our computer (results/lighthouse-local.json)."""
    return lighthouse_block(data, "Lighthouse") if data.get("pages") else "Not measured yet."


def no_server_block(reasons: dict) -> str:
    """Every engine without a server route, and why (server/no-server.json, which the landing page reads too)."""
    out = ["| Engine | Kind | Why there is no server route |", "| --- | --- | --- |"]
    for e, r in reasons.items():
        out.append(f"| {NAMES.get(e, e)} | {NO_SERVER_KIND.get(r.get('status'), r.get('status') or 'n/a')} | {str(r.get('why', '')).replace('|', chr(92) + '|')} |")
    return "\n".join(out)


def put(text: str, name: str, body: str) -> str:
    """`text` with the named block replaced by `body`. The markers must be there."""
    start, end = f"<!-- {name}:start -->", f"<!-- {name}:end -->"
    if start not in text or end not in text:
        raise SystemExit(f"README.md has no {start} … {end} block")
    return re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: f"{start}\n{body}\n{end}", text, flags=re.S)


def render(readme: str, files: dict) -> str:
    """README.md with every block written from the data."""
    for name, body in (
        ("browser", browser_block(files["browser"])),
        ("server", server_block(files["server"])),
        ("samples", samples_block(files["samples"])),
        ("server-client", server_client_block(files["server-client"], files["browser"], files["samples"])),
        ("lighthouse", lighthouse_block(files["lighthouse"])),
        *([("lighthouse-local", local_block(files["lighthouse-local"]))] if "lighthouse-local" in files else []),
        ("no-server", no_server_block(files.get("no-server", NO_SERVER))),
    ):
        readme = put(readme, name, body)
    return readme


def main(argv: list[str]) -> int:
    path = f"{ROOT}/README.md"
    before = open(path).read()
    files = {n: json.load(open(f"{ROOT}/results/{n}.json")) for n in ("browser", "server", "samples", "server-client", "lighthouse", "lighthouse-local")}
    after = render(before, files)
    if "--check" in argv:
        if after != before:
            print("README.md tables do not match the files in results/: run scripts/readme_tables.py", file=sys.stderr)
            return 1
        return 0
    if after != before:
        open(path, "w").write(after)
        print("README.md tables rewritten", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
