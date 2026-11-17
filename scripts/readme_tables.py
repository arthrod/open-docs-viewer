"""Write the measured tables of README.md from the result files, or check that they match.

    python3 scripts/readme_tables.py            # rewrite the blocks in README.md
    python3 scripts/readme_tables.py --check    # exit 1 if README.md is not what the files say

The blocks are the text between `<!-- NAME:start -->` and `<!-- NAME:end -->`
for NAME in browser, server, samples, server-client and lighthouse. They are
never edited by hand: a table typed beside its data goes stale.
"""
import json
import re
import sys

ROOT = __file__.rsplit("/", 2)[0]
NAMES = {
    "canvas-editor": "canvas-editor", "docxodus": "Docxodus", "superdoc": "SuperDoc", "plate": "Plate", "docen": "docen",
    "eigenpal": "docx-editor.dev", "folio": "folio", "wordcraft": "WordCraft", "word-online": "Word Online viewer",
    "google-viewer": "Google viewer", "apryse": "Apryse WebViewer", "nutrient": "Nutrient",
}
# Cross-origin frames: only the frame's load is timed, and the heap read is this page's, not theirs.
FRAMES = {"word-online": "Microsoft", "google-viewer": "Google"}
# Routes with a server render, in the order the landing lists them.
SERVER = ("docxodus", "folio", "eigenpal", "plate", "docen", "wordcraft", "superdoc")
# Routes whose page images are separate requests, made as each page nears the viewport.
IMAGES = {"wordcraft"}
DOCS = (("showcase", "Rich sample (`showcase.docx`)"), ("redline", "Redline (`redline.docx`)"), ("lorem-500", "500 pages (`lorem-500.docx`)"))


def ms(n) -> str:
    """A duration."""
    if n is None:
        return "n/a"
    return f"{round(n)} ms" if n < 1000 else f"{n / 1000:.2f} s" if n < 10000 else f"{n / 1000:.1f} s"


def mb(n) -> str:
    """A size in bytes."""
    if n is None:
        return "n/a"
    return f"{round(n / 1024)} KB" if n < 1048576 else f"{n / 1048576:.1f} MB" if n < 10485760 else f"{round(n / 1048576)} MB"


def cell(text) -> str:
    """Text safe inside a Markdown table cell: one line, no column separator."""
    return str(text).splitlines()[0].replace("|", "\\|")[:160] if str(text) else ""


def each(runs) -> str:
    """Every run's time, in the order they were made."""
    return ", ".join("failed" if t is None else ms(t) for t in runs or []) or "n/a"


def dated(name: str, row: dict, head: dict) -> str:
    """The row's name, with its own date when it was measured apart from its table."""
    return f"{name} (measured {row['measuredAt']})" if row.get("measuredAt") and row["measuredAt"] != head.get("measuredAt") else name


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
        out.append(f"| {name} | {ms(r['renderedMs'])}{' (frame load)' if frame else ''} | {each(r.get('runs'))} | {mb(r.get('bytes'))} | "
                   f"{r.get('requests') if r.get('requests') is not None else 'n/a'} | {'n/a' if frame else mb(r.get('heapBytes'))} | {mb(r.get('rendererRss'))} |")
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
        out.append(f"| {dated(NAMES[e], r, data)}{note} | {first} | {ms(r.get('firstInitMs'))} · {ms(r.get('firstRenderMs'))} | {ms(r.get('warmMs'))} | "
                   f"{ms(r.get('warmRenderMs'))} | {each(r.get('warmRuns')) if r.get('warmRuns') else 'n/a'} | {mb(r.get('bytes'))} |")
    return "\n".join(out)


def server_cell(e: str, x: dict | None) -> str:
    """One /r/ route on one sample, in a sentence."""
    if x is None:
        return "not measured on this file yet" if e in SERVER else "no server route"
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
    out = [said(data, " Server routes: timed with curl, as their own rows say in the file."), ""]
    for doc, title in DOCS[1:]:
        d = data["samples"].get(doc)
        if not d:
            continue
        out += [f"**{title}**", "", "| Engine | Cold render (`/v/`) | Each run | JS heap | Renderer memory | Downloaded | Server render (`/r/`) |",
                "| --- | ---: | --- | ---: | ---: | ---: | --- |"]
        for e in NAMES:
            r = d["browser"].get(e)
            if not r:
                continue
            frame = e in FRAMES
            srv = f"rendered on {FRAMES[e]}'s servers" if frame else server_cell(e, d["server"].get(e))
            name = dated(NAMES[e], r, data)
            if r.get("renderedMs") is None:
                out.append(f"| {name} | **failed**: {cell(r.get('how') or 'no answer')} | {each(r.get('runs'))} | | | | {srv} |")
                continue
            out.append(f"| {name} | {ms(r['renderedMs'])}{' (frame load)' if frame else ''} | {each(r.get('runs'))} | {'n/a' if frame else mb(r.get('heapBytes'))} | "
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
            out.append(f"| {name} | {ms(r['loadMs'])} | {each(r.get('runs'))} | {ms(r.get('paintMs'))} | {mb(r.get('heapBytes'))} | {mb(r.get('rendererRss'))} | {nodes} | {mb(r.get('bytes'))} |")
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


def lighthouse_line(label: str, r: dict, head: dict) -> str:
    """One page's row: desktop · mobile in each cell."""
    d, m = r.get("desktop") or {}, r.get("mobile") or {}
    label = dated(label, r, head)
    if d.get("performance") is None and m.get("performance") is None:
        return f"| {label} | **no result**: {cell(d.get('error') or m.get('error') or 'PageSpeed gave no score')} | | | | | | | | | |"
    two = lambda k, f=str: f"{'n/a' if d.get(k) is None else f(d[k])} · {'n/a' if m.get(k) is None else f(m[k])}"
    runs = lambda x: "/".join("fail" if v is None else str(v) for v in x.get("performanceRuns") or [])
    one = lambda k: d[k] if d.get(k) is not None else "n/a"
    return (f"| {label} | {two('performance')} | {two('lcpMs', ms)} | {two('tbtMs', ms)} | {two('cls')} | {two('fcpMs', ms)} | "
            f"{two('speedIndexMs', ms)} | {one('accessibility')} | {one('bestPractices')} | {one('seo')} | {runs(d)} · {runs(m)} |")


def lighthouse_block(data: dict) -> str:
    """Lighthouse: the /v/ pages and the /r/ routes, on the rich sample and on the 500 pages."""
    intro = lambda h: said(h, " Cells read desktop · mobile; accessibility, best practices and SEO are the desktop scores.")
    table = lambda pages, prefix, head: [*LH_HEAD, *[lighthouse_line(NAMES.get(k[2:], k), r, head) for k, r in pages.items() if k.startswith(prefix)]]
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
    ):
        readme = put(readme, name, body)
    return readme


def main(argv: list[str]) -> int:
    path = f"{ROOT}/README.md"
    before = open(path).read()
    files = {n: json.load(open(f"{ROOT}/results/{n}.json")) for n in ("browser", "server", "samples", "server-client", "lighthouse")}
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
