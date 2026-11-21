"""The README's measured tables are written from the result files (scripts/readme_tables.py)."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import readme_tables as rt  # noqa: E402 - sys.path is set above so the sibling module imports

ROOT = Path(__file__).resolve().parents[2]


def test_the_readme_in_the_repository_matches_its_data():
    files = {n: json.loads((ROOT / "results" / f"{n}.json").read_text()) for n in ("browser", "server", "samples", "server-client", "lighthouse")}
    readme = (ROOT / "README.md").read_text()
    assert rt.render(readme, files) == readme, "run scripts/readme_tables.py"


def test_browser_rows_frames_failures_and_other_dates():
    data = {"measuredAt": "2026-11-16", "environment": "test", "document": "showcase.docx", "engines": {
        "folio": {"renderedMs": 1124, "runs": [2279, 1081, 1124], "bytes": 2 << 20, "requests": 78, "heapBytes": 21 << 20, "rendererRss": 365 << 20, "measuredAt": "2026-11-10"},
        "google-viewer": {"renderedMs": 808, "runs": [808, None], "bytes": 1 << 20, "requests": 27, "heapBytes": 2 << 20, "rendererRss": None},
        "plate": {"renderedMs": None, "runs": [None], "how": "not rendered within 240s"},
    }}
    out = rt.browser_block(data)
    assert "| folio (measured 2026-11-10) | 1.12 s | 2.28 s, 1.08 s, 1.12 s | 2.0 MB | 78 | 21 MB | 365 MB |" in out
    assert "| Google viewer | 808 ms (frame load) | 808 ms, failed | 1.0 MB | 27 | n/a | n/a |" in out
    assert "| Plate | **failed**: not rendered within 240s | failed | | | | |" in out


def test_server_rows_say_when_a_first_request_was_not_one():
    data = {"measuredAt": "2026-11-16", "environment": "curl", "engines": {
        "folio": {"firstMs": 1556, "firstInitMs": 449, "firstRenderMs": 337, "firstCold": True, "warmMs": 459, "warmRenderMs": 157, "bytes": 207736, "warmRuns": [470, 459, None], "error": "HTTP 500: x"},
        "plate": {"firstMs": 400, "firstInitMs": 0, "firstRenderMs": 130, "firstCold": False, "warmMs": 448, "warmRenderMs": 133, "bytes": 31000},
    }}
    out = rt.server_block(data)
    assert "| folio **A request failed**: HTTP 500: x | 1.56 s | 449 ms · 337 ms | 459 ms | 157 ms | 470 ms, 459 ms, failed | 203 KB |" in out
    assert "| Plate | 400 ms (already loaded: not a first request) | 0 ms · 130 ms | 448 ms | 133 ms | n/a | 30 KB |" in out


def test_sample_rows_and_their_server_cells():
    b = {"renderedMs": 1700, "runs": [1700], "bytes": 22 << 20, "requests": 20, "heapBytes": 3 << 20, "rendererRss": 649 << 20}
    data = {"measuredAt": "2026-11-16", "environment": "test", "samples": {"redline": {"document": "redline.docx", "browser": {"wordcraft": b, "folio": b, "apryse": b, "word-online": b, "eigenpal": b},
            "server": {"wordcraft": {"code": 200, "totalMs": 287, "renderMs": 25, "bytes": 3426, "pages": 3, "runs": [287]},
                       "eigenpal": {"code": 500, "totalMs": None, "renderMs": None, "bytes": None, "pages": None, "runs": [None], "error": '"socket hang up"'}}}}}
    out = rt.samples_block(data)
    assert "| WordCraft | 1.70 s | 1.70 s | 3.0 MB | 649 MB | 22 MB | 287 ms (25 ms laying out), 3 KB + a page image per page viewed, 3 pages |" in out
    assert out.count("not measured on this file yet") == 1 and "| folio |" in out  # folio has a route, and no figure here
    # An engine with no server route says why in its cell (server/no-server.json).
    assert "| Apryse WebViewer | 1.70 s | 1.70 s | 3.0 MB | 649 MB | 22 MB | no server route: Apryse renders on a server with a native SDK |" in out
    assert "| Word Online viewer | 1.70 s (frame load) | 1.70 s | n/a | 649 MB | 22 MB | rendered on Microsoft's servers |" in out
    assert '**failed**: "socket hang up"' in out


def test_server_client_and_lighthouse_blocks_and_missing_markers():
    client = {"measuredAt": "2026-11-16", "environment": "test", "docs": {"showcase": {
        "docen": {"loadMs": 1287, "paintMs": 940, "heapBytes": 722936, "rendererRss": 266 << 20, "domNodes": 36966, "bytes": 1138933, "runs": [1287, None], "error": None},
        "eigenpal": {"loadMs": None, "runs": [None], "error": "HTTP 500"}}}}
    browser = {"engines": {"word-online": {"renderedMs": 769, "runs": [769], "bytes": 1 << 20, "heapBytes": 9, "rendererRss": None}}}
    out = rt.server_client_block(client, browser, {"samples": {}})
    assert "| docen | 1.29 s | 1.29 s, failed | 940 ms | 706 KB | 266 MB | 36,966 | 1.1 MB |" in out
    assert "| docx-editor.dev | **failed**: HTTP 500 | failed | | | | | |" in out
    assert "| Word Online viewer (rendered on Microsoft's servers; `/v/` frame load) | 769 ms | 769 ms | n/a | n/a | n/a | n/a | 1.0 MB |" in out
    page = {"performance": 100, "accessibility": 90, "bestPractices": 100, "seo": 91, "fcpMs": 261, "lcpMs": 521, "tbtMs": 0, "cls": 0, "speedIndexMs": 809, "performanceRuns": [100, 100], "error": None}
    lh = rt.lighthouse_block({"measuredAt": "2026-11-16", "environment": "PSI", "pages": {"v/docxodus": {"desktop": page, "mobile": page}, "r/docxodus": {"desktop": page}}})
    assert lh.count("| Docxodus |") == 2 and "| Docxodus | 100 · n/a |" in lh
    with pytest.raises(SystemExit):
        rt.put("no markers", "browser", "x")


def test_a_sample_with_only_a_server_result_still_has_its_row():
    data = {"measuredAt": "2026-11-16", "environment": "test", "samples": {"redline": {
        "browser": {}, "server": {"folio": {"code": 200, "totalMs": 800, "renderMs": 300, "bytes": 2 << 20, "runs": [800]}}}}}
    out = rt.samples_block(data)
    assert "| folio | not measured | n/a | n/a | n/a | n/a | 800 ms (300 ms rendering), 2.0 MB |" in out


def test_a_lighthouse_row_says_why_a_form_factor_or_an_analysis_has_no_result():
    page = {"performance": 66, "accessibility": 96, "bestPractices": 100, "seo": 90, "fcpMs": 230, "lcpMs": 1072, "tbtMs": 828, "cls": 0.006, "speedIndexMs": 2292, "performanceRuns": [66, 66], "error": None}
    none = {k: None for k in page} | {"performanceRuns": [None, None], "error": "PageSpeed gave no result within 240 s | really"}
    some = {**page, "performanceRuns": [66, None], "error": "PAGE_HUNG: it stopped"}
    line = rt.lighthouse_line("folio", {"desktop": some, "mobile": none}, {})
    assert line.endswith("| 66/fail · fail/fail (desktop: PAGE_HUNG: it stopped; mobile: PageSpeed gave no result within 240 s \\| really) |")
    assert rt.lighthouse_line("folio", {"desktop": page, "mobile": page}, {}).endswith("| 66/66 · 66/66 |")


def test_a_browser_row_says_why_a_run_failed_beside_the_median_of_the_others():
    data = {"measuredAt": "2026-11-16", "environment": "test", "engines": {"folio": {"renderedMs": 510, "runs": [500, None, 520], "bytes": 1 << 20, "requests": 9, "heapBytes": 5 << 20, "rendererRss": 90 << 20, "failed": "not rendered within 240s"}}}
    assert "| 500 ms, failed, 520 ms (failed: not rendered within 240s) |" in rt.browser_block(data)


def test_a_sample_table_with_two_equal_groups_of_rows_is_headed_the_same_every_time():
    """`max(set(...))` chose between tied headings by set order, which differs between Python processes."""
    a, b = "env A", "env B"
    row = lambda env: {"renderedMs": 100, "runs": [100], "measuredAt": "2026-11-17", "environment": env}  # noqa: E731 - a one-line fixture
    engines = list(rt.NAMES)[:4]
    data = {"measuredAt": "2026-11-17", "environment": a, "samples": {"redline": {"browser": {e: row(b if i < 2 else a) for i, e in enumerate(engines)}, "server": {}}}}
    block = rt.samples_block(data)
    assert f"{b}." in block.split("| Engine")[0], "the heading is the first of the tied groups, in the file's order"


def test_a_lighthouse_row_with_no_score_at_all_lists_every_analysis_and_both_reasons():
    none = lambda why: {"performance": None, "performanceRuns": [None, None], "error": why}  # noqa: E731 - a one-line fixture
    line = rt.lighthouse_line("X", {"desktop": none("PAGE_HUNG: a"), "mobile": none("NO_FCP: b")}, {})
    assert "**no result**" in line and "fail/fail · fail/fail" in line and "desktop: PAGE_HUNG: a" in line and "mobile: NO_FCP: b" in line


def test_a_browser_row_says_when_a_reading_after_rendering_failed():
    data = {"measuredAt": "2026-11-17", "environment": "e", "engines": {"folio": {"renderedMs": 100, "runs": [100, None], "failed": "not rendered", "incomplete": "TimeoutError: heap"}}}
    line = [l for l in rt.browser_block(data).splitlines() if l.startswith("| folio")][0]
    assert "failed: not rendered" in line and "a later reading failed: TimeoutError: heap" in line


def test_every_engine_without_a_server_route_says_why():
    """No table cell is left at a bare "no server route": each such engine has a reason on file."""
    without = [e for e in rt.NAMES if e not in rt.SERVER and e not in rt.FRAMES]
    assert sorted(without) == sorted(e for e in rt.NO_SERVER if e in rt.NAMES)
    for e in without:
        r = rt.NO_SERVER[e]
        assert r["status"] in rt.NO_SERVER_KIND and len(r["why"]) > 40 and r["cell"].startswith(("no server route: ", "not built"))
    block = rt.no_server_block(rt.NO_SERVER)
    # OpenDoc and BetterOffice were "possible, not built" until 2026-11-21: with a route, neither is in the list.
    assert "opendoc" in rt.SERVER and "betteroffice" in rt.SERVER and "| OpenDoc |" not in block and "| BetterOffice |" not in block
    assert "| react-docx | needs a browser | " in block
    assert "| OnlyOffice (CryptPad build) | needs a browser | " in block


def test_a_heap_that_was_not_collected_first_is_said_in_the_table():
    import readme_tables as rt

    assert rt.heap({"heapBytes": 5 * 1048576, "heapNotCollected": 2}) == "5.0 MB (not collected first in 2 runs)"
    assert rt.heap({"heapBytes": 5 * 1048576, "heapNotCollected": 0}) == "5.0 MB"


def test_the_server_client_table_says_an_uncollected_heap_too():
    import inspect

    import readme_tables as rt

    assert "heap(r)" in inspect.getsource(rt.server_client_block)
