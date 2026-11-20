"""uv run --with pytest pytest scripts/tests"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import measure_lib as lib


def test_pkill_pattern_is_delimited_so_it_is_not_read_as_an_option():
    assert lib.pkill_args("/tmp/p")[:3] == ["pkill", "-f", "--"]
    assert subprocess.run(["pkill", "-f", "--user-data-dir=/nonexistent-odv-test"], capture_output=True).returncode == 2
    assert lib.end_chrome("/nonexistent-odv-test") is None  # ran, matched nothing


def test_end_chrome_reports_a_pkill_that_could_not_run(monkeypatch):
    monkeypatch.setattr(lib.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 3, b"", b"boom"))
    assert "pkill exited 3" in lib.end_chrome("/tmp/p")


PS = [
    (10, 1, 5, "/chrome --user-data-dir=/tmp/p"),
    (11, 10, 7, "/chrome --type=zygote --user-data-dir=/tmp/p"),
    (12, 11, 100, "/chrome --type=renderer"),  # Linux: forked from the zygote
    (13, 10, 40, "/chrome --type=renderer"),  # macOS: a direct child
    (14, 10, 9, "/chrome --type=gpu-process"),
    (20, 1, 5, "/chrome --user-data-dir=/tmp/other"),
    (21, 20, 999, "/chrome --type=renderer"),
]


def test_renderers_below_the_zygote_are_counted():
    assert lib.renderer_rss_of(PS, "/tmp/p") == 140
    assert lib.renderer_rss_of(PS, "/tmp/other") == 999
    assert lib.renderer_rss_of(PS, "/tmp/none") == 0


def test_a_rendered_run_without_a_metric_does_not_break_the_summary():
    """renderer_rss failed after renderedMs was set: that run has an error and no rendererRss."""
    xs = [{"renderedMs": 100, "bytes": 5, "requests": 1, "heapBytes": 9, "error": "TimeoutError"},
          {"renderedMs": 300, "bytes": 7, "requests": 3, "heapBytes": 11, "rendererRss": 50}]
    s = lib.engine_summary(xs)
    assert s["renderedMs"] == 200 and s["rendererRss"] == 50 and s["heapBytes"] == 10
    assert s["how"] == "data-od-rendered"
    assert s["incomplete"] == "TimeoutError"
    none = lib.engine_summary([{"renderedMs": 100}])
    assert none["rendererRss"] is None and none["incomplete"] is None
    failed = lib.engine_summary([{"error": "not rendered within 240s"}])
    assert failed["renderedMs"] is None and failed["how"] == "not rendered within 240s"


def test_the_main_table_holds_one_document_only():
    lib.check_results_document("showcase", "results/browser.json")  # the published table's document
    lib.check_results_document("lorem-500", None)  # no --results: nothing to mix
    with pytest.raises(SystemExit) as e:
        lib.check_results_document("lorem-500", "results/browser.json")
    assert "--samples" in str(e.value)


def test_measure_options_are_parsed_before_anything_runs():
    a = lib.measure_args(["all", "3", "--doc", "redline", "--samples", "results/samples.json"])
    assert (a.engines, a.runs, a.doc, a.samples, a.results) == ("all", 3, "redline", "results/samples.json", None)
    for bad in (["all", "3", "--samples", "--doc", "redline"], ["all", "3", "--doc"], ["all", "0"], ["all", "3", "--doc", "nope"]):
        with pytest.raises(SystemExit):
            lib.measure_args(bad)
    s = lib.server_args(["wordcraft,folio", "5", "--doc", "lorem-500"])
    assert (s.engines, s.runs, s.doc, s.samples) == ("wordcraft,folio", 5, "lorem-500", None)


def test_a_transfer_that_curl_says_failed_is_not_a_success():
    ok = lib.classify(returncode=0, code=200, size=9, total=0.5, body=b"<html>x</html>\n", limit_s=180)
    assert ok == (200, None)
    # 18 = partial file, 56 = receive failure: HTTP 200 headers, no complete body.
    for rc in (18, 56):
        code, err = lib.classify(returncode=rc, code=200, size=9, total=0.5, body=b"<html>", limit_s=180)
        assert code == 0 and f"curl exited {rc}" in err and "HTTP 200" in err
    code, err = lib.classify(returncode=28, code=200, size=9, total=180, body=b"", limit_s=180)
    assert code == 0 and "within 180 s" in err
    code, err = lib.classify(returncode=0, code=200, size=6, total=144, body=b"<html>", limit_s=180)
    assert code == 0 and "stopped partway" in err


def test_a_failed_answer_keeps_its_status_and_first_line_even_when_blank():
    assert lib.classify(returncode=0, code=500, size=1, total=0.1, body=b"\n", limit_s=180) == (500, "empty body")
    assert lib.classify(returncode=0, code=500, size=0, total=0.1, body=b"", limit_s=180) == (500, "empty body")
    assert lib.classify(returncode=0, code=422, size=20, total=0.1, body=b"\n upstream 404\nmore", limit_s=180) == (422, "upstream 404")


def test_a_new_samples_file_has_the_whole_shape_the_landing_reads():
    out = lib.samples_shell({}, "redline", "redline.docx (80,450 B)")
    assert out["measuredAt"] is None and out["environment"] == ""
    assert out["samples"]["redline"] == {"document": "redline.docx (80,450 B)", "browser": {}, "server": {}}
    # An existing file keeps what it has.
    kept = lib.samples_shell({"measuredAt": "2026-11-15", "environment": "Chrome", "samples": {"redline": {"document": "d", "browser": {"folio": 1}, "server": {}}}}, "redline", "x")
    assert kept["measuredAt"] == "2026-11-15" and kept["samples"]["redline"]["browser"] == {"folio": 1} and kept["samples"]["redline"]["document"] == "d"


def test_server_entry_keeps_the_error_of_a_failed_run_beside_the_median():
    e = lib.server_entry([{"code": 200, "totalMs": 100, "render": 10.0, "bytes": 5, "pages": 3}, {"code": 0, "totalMs": 9, "bytes": 1, "error": "curl exited 18"}])
    assert e["code"] == 200 and e["totalMs"] == 100 and e["runs"] == [100, None] and e["error"] == "curl exited 18"
    assert lib.server_entry([{"code": 500, "totalMs": 5, "bytes": 0, "error": "empty body"}])["code"] == 500


def test_a_rejected_lighthouse_report_carries_no_scores():
    s = lib.summarize({"finalDisplayedUrl": "https://x/cdn-cgi/challenge-platform", "categories": {"performance": {"score": 1}}})
    assert "Cloudflare challenge" in s["error"] and "performance" not in s


def test_a_challenge_score_does_not_enter_the_median_and_each_form_factor_has_its_error():
    xs = [{"desktop": {"performance": 40}}, {"desktop": lib.summarize({"finalUrl": "https://x/challenge", "categories": {"performance": {"score": 1}}}), "mobile": {"performance": 32}}]
    e = lib.page_entry(xs, limit_s=240)
    assert e["desktop"]["performance"] == 40 and e["desktop"]["performanceRuns"] == [40, None]
    assert e["mobile"]["performance"] == 32 and "no mobile result within 240 s" in e["mobile"]["error"]


def test_a_labelled_population_keeps_its_own_provenance():
    result = {"measuredAt": "2026-11-10", "environment": "old", "base": "https://x", "pages": {}}
    meta = {"measuredAt": "2026-11-16", "environment": "new", "base": "https://x"}
    out = lib.merge_pagespeed(result, {"r/wordcraft": {}}, "lorem-500", meta)
    assert out["measuredAt"] == "2026-11-10" and out["docsMeta"]["lorem-500"] == meta


def test_a_partial_pagespeed_rerun_does_not_redate_the_pages_it_did_not_measure():
    old = {"measuredAt": "2026-11-10", "environment": "Lighthouse 13.5", "base": "https://x",
           "pages": {"e/folio": {"desktop": {}}, "e/plate": {"desktop": {}}},
           "docs": {"lorem-500": {"e/folio": {"desktop": {}}, "e/plate": {"desktop": {}}}},
           "docsMeta": {"lorem-500": {"measuredAt": "2026-11-12", "environment": "Lighthouse 13.5b", "base": "https://x"}}}
    meta = {"measuredAt": "2026-11-16", "environment": "Lighthouse 13.6", "base": "https://x"}
    out = lib.merge_pagespeed(old, {"e/plate": {"mobile": {}}}, None, meta)
    assert out["pages"]["e/plate"]["measuredAt"] == "2026-11-16" and out["pages"]["e/plate"]["environment"] == "Lighthouse 13.6"
    assert out["pages"]["e/folio"]["measuredAt"] == "2026-11-10" and out["pages"]["e/folio"]["environment"] == "Lighthouse 13.5"
    out = lib.merge_pagespeed(out, {"e/plate": {"mobile": {}}}, "lorem-500", meta)
    rows = out["docs"]["lorem-500"]
    assert rows["e/plate"]["measuredAt"] == "2026-11-16"
    assert rows["e/folio"]["measuredAt"] == "2026-11-12" and rows["e/folio"]["environment"] == "Lighthouse 13.5b"


def test_end_chrome_reports_a_chrome_that_survives_the_signal(monkeypatch):
    calls = []

    def run(args, **k):
        calls.append(args[0])
        return subprocess.CompletedProcess(args, 0, b"123\n", b"")  # pkill: signalled; pgrep: still there

    monkeypatch.setattr(lib.subprocess, "run", run)
    monkeypatch.setattr(lib.time, "sleep", lambda s: None)
    left = lib.end_chrome("/tmp/p", wait_s=0.3)
    assert "still running" in left and "pgrep" in calls


def test_end_chrome_is_quiet_once_the_process_is_gone(monkeypatch):
    seen = {"n": 0}

    def run(args, **k):
        if args[0] == "pkill":
            return subprocess.CompletedProcess(args, 0, b"", b"")
        seen["n"] += 1
        return subprocess.CompletedProcess(args, 0 if seen["n"] < 2 else 1, b"", b"")  # gone on the second look

    monkeypatch.setattr(lib.subprocess, "run", run)
    monkeypatch.setattr(lib.time, "sleep", lambda s: None)
    assert lib.end_chrome("/tmp/p", wait_s=5) is None


def test_every_run_can_say_how_busy_the_machine_was():
    m = lib.machine_load()
    assert m["cores"] >= 1 and m["load1"] >= 0
    assert lib.load_note([{"load1": 2.0, "cores": 12}, {"load1": 9.5, "cores": 12}, {"load1": 3.0, "cores": 12}]) == "machine load (1-minute average) median 3.0, highest 9.5, on 12 cores"
    assert lib.load_note([{"engine": "folio"}]) == ""


def test_the_heading_says_how_many_runs_were_really_made():
    full = [{"engine": e, "sample": "redline"} for e in ("a", "b") for _ in range(3)]
    assert lib.runs_note(3, full) == "3 runs"
    assert lib.runs_note(3, full[:4]) == "1 to 3 runs (3 asked; the measuring stopped early)"
    assert lib.runs_note(3, full[:3]) == "3 runs"
    assert lib.runs_note(3, [full[0], full[3]]) == "1 runs (3 asked; the measuring stopped early)"


def test_pagespeed_options_are_parsed_before_anything_runs():
    a = lib.pagespeed_args(["https://x.example", "e/folio,e/plate", "3", "--query", "open=a.docx", "--label", "lorem-500", "--out", "o.json"])
    assert (a.base, a.pages, a.runs, a.query, a.label, a.out) == ("https://x.example", "e/folio,e/plate", 3, "open=a.docx", "lorem-500", "o.json")
    for bad in ([], ["https://x.example"], ["https://x.example", "e/folio", "0"], ["https://x.example", "e/folio", "3", "--out"]):
        with pytest.raises(SystemExit):
            lib.pagespeed_args(bad)


def test_a_partial_run_stamps_its_rows_and_leaves_the_others_under_their_own_date():
    rows = {"folio": {"renderedMs": 1}, "plate": {"renderedMs": 2, "measuredAt": "2026-11-01", "environment": "older still"}}
    old = {"measuredAt": "2026-11-09", "environment": "3 runs"}
    meta = {"measuredAt": "2026-11-16", "environment": "5 runs"}
    out = lib.stamp_rows(rows, {"docen": {"renderedMs": 3}, "folio": {"renderedMs": 9}}, old, meta)
    assert out["folio"] == {"renderedMs": 9, **meta}
    assert out["docen"] == {"renderedMs": 3, **meta}
    assert out["plate"]["measuredAt"] == "2026-11-01"  # already stamped: kept
    kept = lib.stamp_rows({"apryse": {"renderedMs": 5}}, {}, old, meta)
    assert kept["apryse"] == {"renderedMs": 5, **old}
    assert lib.stamp_rows({"apryse": {"renderedMs": 5}}, {}, {"measuredAt": None, "environment": ""}, meta)["apryse"] == {"renderedMs": 5}


def test_client_options_are_parsed_before_anything_runs(tmp_path):
    a = lib.client_args(["all", "showcase,lorem-500", "3", "--out", "o.json", "--raw", "r.json"])
    assert (a.engines, a.docs, a.runs, a.out, a.raw) == ("all", "showcase,lorem-500", 3, "o.json", "r.json")
    for bad in ([], ["all"], ["all", "showcase", "0"], ["all", "nope", "3"], ["all", "showcase", "3", "--out"]):
        with pytest.raises(SystemExit):
            lib.client_args(bad)
    lib.write_raw(str(tmp_path / "raw" / "x.json"), {"measuredAt": "2026-11-16"}, [{"engine": "folio"}])
    assert json.loads((tmp_path / "raw" / "x.json").read_text()) == {"measuredAt": "2026-11-16", "raw": [{"engine": "folio"}]}
    lib.write_raw(None, {}, [])


def test_the_first_request_and_the_warm_ones_make_one_row():
    first = {"code": 200, "totalMs": 2231, "init": 235.4, "render": 1103.2, "bytes": 58818}
    warm = [{"code": 200, "totalMs": t, "init": 0, "render": r, "bytes": 58818} for t, r in ((700, 320), (622, 302), (600, 290))]
    row = lib.first_warm_entry(first, warm)
    assert row == {"firstMs": 2231, "firstInitMs": 235, "firstRenderMs": 1103, "firstCold": True, "warmMs": 622, "warmRenderMs": 302, "bytes": 58818, "warmRuns": [700, 622, 600], "warmColdRuns": 0}


def test_a_first_request_that_found_the_engine_loaded_is_not_called_cold_and_failures_are_kept():
    warmish = lib.first_warm_entry({"code": 200, "totalMs": 500, "init": 0, "render": 300, "bytes": 1}, [{"code": 200, "totalMs": 480, "render": 290, "bytes": 1}])
    assert warmish["firstCold"] is False
    bad = lib.first_warm_entry({"code": 0, "totalMs": 180000, "error": "no answer within 180 s"}, [{"code": 200, "totalMs": 400, "render": 100, "bytes": 5}, {"code": 500, "totalMs": 90, "error": "HTTP 500: boom"}])
    assert bad["firstMs"] is None and bad["firstCold"] is False and bad["warmMs"] == 400 and bad["warmRuns"] == [400, None]
    assert bad["error"] == "no answer within 180 s"


def test_the_heading_names_the_chrome_version_the_runs_recorded():
    assert lib.chrome_note([{"chrome": "Chrome/157.0.8103.79"}, {"chrome": "Chrome/157.0.8103.79"}, {"engine": "x"}]) == "Google Chrome 157.0.8103.79"
    assert lib.chrome_note([{"chrome": "Chrome/157.0.1.2"}, {"chrome": "Chrome/158.0.0.1"}]) == "Google Chrome 157.0.1.2 and 158.0.0.1"
    assert lib.chrome_note([{"engine": "x"}]) == "Google Chrome"
    assert lib.chrome_note([{"chrome": "HeadlessChrome/141.0.7390.66"}]) == "Google Chrome headless 141.0.7390.66"


def test_pagespeed_refusing_an_address_is_told_apart_from_a_page_that_never_loaded():
    said = "PageSpeed Insights\nUnable to resolve https://x.example/r/a?src=https://h/f.docx. Try checking the URL for validity.\nAnalyze"
    assert lib.psi_refusal(said).startswith("PageSpeed refused the address: Unable to resolve https://x.example")
    assert lib.psi_refusal("Performance\n77\nFirst Contentful Paint") is None


def test_a_report_of_a_page_whose_engine_failed_has_no_score():
    report = {"lighthouseVersion": "13", "categories": {"performance": {"score": 1}},
              "audits": {"errors-in-console": {"details": {"items": [
                  {"description": "Failed to load resource: 404"},
                  {"description": "[open-docs] WordCraft failed to start TypeError: Failed to fetch"}]}}}}
    got = lib.summarize(report)
    assert "performance" not in got and "WordCraft failed to start" in got["error"]
    report["audits"]["errors-in-console"]["details"]["items"].pop()
    assert lib.summarize(report)["performance"] == 100  # another site's 404 is not the engine failing


def test_a_page_whose_engine_failed_in_most_analyses_publishes_no_score():
    failed = {"error": lib.ENGINE_FAILED + ": [open-docs] X failed to start"}
    ok = {"performance": 86, "lcpMs": 200}
    xs = [{"desktop": failed, "mobile": failed}, {"desktop": ok, "mobile": failed}, {"desktop": failed, "mobile": failed}]
    e = lib.page_entry(xs, 240)
    assert e["desktop"]["performance"] is None and e["desktop"]["performanceRuns"] == [None, None, None]
    assert e["desktop"]["error"].startswith(lib.ENGINE_FAILED)
    mostly_fine = lib.page_entry([{"desktop": ok}, {"desktop": ok}, {"desktop": failed}], 240)
    assert mostly_fine["desktop"]["performance"] == 86


def test_a_partial_rerun_keeps_the_heading_of_the_run_that_measured_the_table():
    """Two analyses of one page must not head a table whose other rows had five (the 500-page caption once said so)."""
    five = {"measuredAt": "2026-11-16", "environment": "5 analyses", "base": "b"}
    two = {"measuredAt": "2026-11-16", "environment": "2 analyses", "base": "b"}
    out = lib.merge_pagespeed({"pages": {}}, {"r/folio": {}, "r/eigenpal": {}}, "lorem-500", five)
    out = lib.merge_pagespeed(out, {"r/eigenpal": {}}, "lorem-500", two)
    assert out["docsMeta"]["lorem-500"]["environment"] == "5 analyses"
    assert out["docs"]["lorem-500"]["r/eigenpal"]["environment"] == "2 analyses"
    assert out["docs"]["lorem-500"]["r/folio"]["environment"] == "5 analyses"
    # A run of every page of the table does head it.
    out = lib.merge_pagespeed(out, {"r/folio": {}, "r/eigenpal": {}}, "lorem-500", two)
    assert out["docsMeta"]["lorem-500"]["environment"] == "2 analyses"
    # The default table follows the same rule.
    root = lib.merge_pagespeed({"pages": {}}, {"v/a": {}, "v/b": {}}, None, five)
    root = lib.merge_pagespeed(root, {"v/a": {}}, None, two)
    assert root["environment"] == "5 analyses" and root["pages"]["v/a"]["environment"] == "2 analyses"


def test_a_default_table_rerun_does_not_redate_a_legacy_labelled_population():
    """A file from before docsMeta: its 500-page rows were published under the root heading of that day."""
    result = {"measuredAt": "2026-11-10", "environment": "old", "base": "b",
              "pages": {"v/a": {"desktop": {}}}, "docs": {"lorem-500": {"v/a": {"desktop": {}}, "v/b": {"desktop": {}}}}}
    lib.merge_pagespeed(result, {"v/a": {"desktop": {}}}, None, {"measuredAt": "2026-11-16", "environment": "new", "base": "b"})
    assert result["measuredAt"] == "2026-11-16"
    assert result["docsMeta"]["lorem-500"]["measuredAt"] == "2026-11-10"
    lib.merge_pagespeed(result, {"v/a": {"desktop": {}}}, "lorem-500", {"measuredAt": "2026-11-17", "environment": "newer", "base": "b"})
    assert result["docs"]["lorem-500"]["v/b"]["measuredAt"] == "2026-11-10"


def test_end_chrome_reports_a_pgrep_that_could_not_run(monkeypatch):
    """pgrep exits 1 for no match and 2 or 3 for an error: an error is not proof that Chrome went."""

    def run(args, **k):
        if args[0] == "pkill":
            return subprocess.CompletedProcess(args, 0, b"", b"")
        return subprocess.CompletedProcess(args, 3, b"", b"cannot read the process table")

    monkeypatch.setattr(lib.subprocess, "run", run)
    monkeypatch.setattr(lib.time, "sleep", lambda s: None)
    left = lib.end_chrome("/tmp/p", wait_s=5)
    assert "pgrep exited 3" in left and "cannot read the process table" in left


def test_a_warm_request_that_reached_an_unloaded_process_is_not_a_warm_one():
    """Val Town runs several processes: a later request can land on one that has not loaded the engine yet."""
    first = {"code": 200, "totalMs": 2000, "init": 400, "render": 900, "bytes": 10}
    warm = [{"code": 200, "totalMs": t, "init": i, "render": r, "bytes": 10} for t, i, r in ((1383, 568, 500), (578, 0, 280), (452, 0, 270), (480, 0, 272), (700, 163, 300))]
    row = lib.first_warm_entry(first, warm)
    assert row["warmMs"] == 480 and row["warmRenderMs"] == 272
    assert row["warmColdRuns"] == 2 and row["warmRuns"] == [1383, 578, 452, 480, 700]
    # Every warm request cold: there is no warm figure, and that is said by the count.
    none = lib.first_warm_entry(first, [{"code": 200, "totalMs": 900, "init": 300, "render": 400, "bytes": 10}])
    assert none["warmMs"] is None and none["warmColdRuns"] == 1


def test_a_run_that_failed_keeps_its_reason_beside_the_runs_that_rendered():
    row = lib.engine_summary([{"renderedMs": 500, "bytes": 1}, {"error": "not rendered within 240s"}, {"renderedMs": 520, "bytes": 1}])
    assert row["renderedMs"] == 510 and row["how"] == "data-od-rendered"
    assert row["failed"] == "not rendered within 240s"
    assert lib.engine_summary([{"renderedMs": 500}])["failed"] is None


@pytest.mark.parametrize("parse", [lib.measure_args, lib.server_args])
def test_invalid_measure_options_are_refused_by_both_parsers(parse):
    for args in (["all", "3", "--doc"], ["all", "0"], ["all", "3", "--doc", "nope"]):
        with pytest.raises(SystemExit):
            parse(args)


def test_an_init_of_a_millisecond_or_two_is_an_engine_already_loaded():
    """WordCraft's route reports 1 to 2 ms of init when it only awaited a module that was there."""
    first = {"code": 200, "totalMs": 557, "init": 267, "render": 129, "bytes": 10}
    warm = [{"code": 200, "totalMs": t, "init": i, "render": 20, "bytes": 10} for t, i in ((512, 192), (178, 2), (152, 2), (332, 0), (188, 1))]
    row = lib.first_warm_entry(first, warm)
    assert row["warmColdRuns"] == 1 and row["warmMs"] == 183
    assert lib.first_warm_entry({"code": 200, "totalMs": 180, "init": 2, "render": 20, "bytes": 1}, warm)["firstCold"] is False


def test_a_malformed_report_is_summarised_not_thrown():
    """A thrown summary was swallowed by the caller, and the analysis then read as 'no result within 240 s'."""
    for audits in (None, [], {"errors-in-console": None}, {"errors-in-console": {"details": {"items": None}}},
                   {"errors-in-console": {"details": {"items": {"a": 1}}}}, {"errors-in-console": {"details": {"items": ["text", 3, None]}}}):
        out = lib.summarize({"lighthouseVersion": "13", "audits": audits, "categories": {"performance": {"score": 0.5}}})
        assert out.get("performance") == 50 and "error" not in out, audits


def test_only_this_sites_own_console_line_marks_an_engine_failure():
    report = lambda text: {"audits": {"errors-in-console": {"details": {"items": [{"description": text}]}}}, "categories": {"performance": {"score": 1}}}  # noqa: E731 - a one-line fixture
    assert lib.summarize(report("[open-docs-viewer] TypeError: Failed to fetch"))["error"].startswith(lib.ENGINE_FAILED)
    assert lib.summarize(report("  [open-docs] WordCraft failed to start"))["error"].startswith(lib.ENGINE_FAILED)
    for other in ("[open-docs-evil] something", "[open-docsx] y", "a library said [open-docs] in passing"):
        assert lib.summarize(report(other)).get("performance") == 100, other


def test_end_chrome_looks_for_the_process_even_when_pkill_says_it_matched_nothing(monkeypatch):
    """On procps, pkill exits 1 both for "no match" and for "matched, could not signal": pgrep tells them apart."""

    def run(args, **k):
        if args[0] == "pkill":
            return subprocess.CompletedProcess(args, 1, b"", b"")
        return subprocess.CompletedProcess(args, 0, b"123\n", b"")  # still there

    monkeypatch.setattr(lib.subprocess, "run", run)
    monkeypatch.setattr(lib.time, "sleep", lambda s: None)
    assert "still running" in lib.end_chrome("/tmp/p", wait_s=0.2)


def test_the_readme_generator_runs_isolated():
    """The scripts are run with `python -I`, which leaves their folder off the import path: each must add it itself."""
    root = Path(__file__).resolve().parents[2]
    done = subprocess.run([sys.executable, "-I", str(root / "scripts" / "readme_tables.py"), "--check"], capture_output=True, text=True, cwd=root)
    assert "ModuleNotFoundError" not in done.stderr and done.returncode in (0, 1), done.stderr[-300:]


def test_end_chrome_reports_a_tool_that_cannot_be_started(monkeypatch):
    def run(args, **k):
        raise FileNotFoundError(2, "No such file or directory", args[0])

    monkeypatch.setattr(lib.subprocess, "run", run)
    assert "may still be running" in lib.end_chrome("/tmp/p", wait_s=0.1)


def test_a_context_that_will_not_close_has_its_chrome_ended(monkeypatch):
    import asyncio

    class Ctx:
        def __init__(self, ok):
            self.ok = ok

        async def close(self):
            if not self.ok:
                raise RuntimeError("target closed")

    ended = []
    monkeypatch.setattr(lib, "end_chrome", lambda profile: ended.append(profile) or "that Chrome is still running")
    assert asyncio.run(lib.close_context(Ctx(True), "/tmp/p")) is None and ended == []
    assert asyncio.run(lib.close_context(Ctx(False), "/tmp/p")) == "that Chrome is still running" and ended == ["/tmp/p"]


def test_a_stopped_run_writes_beside_the_days_file_not_over_it():
    import datetime

    now = datetime.datetime(2026, 11, 17, 5, 6, 7, tzinfo=datetime.timezone.utc)
    assert lib.stopped_path("results/raw/2026-11-17-browser-showcase.json", now) == "results/raw/2026-11-17-browser-showcase-stopped-050607Z.json"
    assert lib.stopped_path(None) is None


def test_a_results_file_that_cannot_be_parsed_is_not_silently_replaced(tmp_path):
    """Read as empty, a corrupt file lost every engine the run did not measure."""
    bad = tmp_path / "browser.json"
    bad.write_text("{ not json")
    with pytest.raises(SystemExit) as stop:
        lib.read_results(str(bad))
    assert "browser.json" in str(stop.value)
    assert lib.read_results(str(tmp_path / "absent.json")) == {"engines": {}}
    folder = tmp_path / "a-folder.json"
    folder.mkdir()  # there, and not readable as a file: not the same as absent
    with pytest.raises(SystemExit):
        lib.read_results(str(folder))
    ok = tmp_path / "ok.json"
    ok.write_text('{"engines": {"a": 1}}')
    assert lib.read_results(str(ok)) == {"engines": {"a": 1}}


def test_chrome_args_come_from_the_environment_and_default_to_none():
    """An explicit mapping makes the result independent of the process environment."""
    assert lib.chrome_args({}) == []
    assert lib.chrome_args({"OD_CHROME_ARGS": "--no-sandbox  --disable-dev-shm-usage"}) == ["--no-sandbox", "--disable-dev-shm-usage"]


def test_chrome_args_keep_a_quoted_value_whole_and_read_the_process_environment(monkeypatch):
    """Shell quoting applies, and a call without a mapping reads os.environ (what the launchers do)."""
    assert lib.chrome_args({"OD_CHROME_ARGS": '--user-agent="Benchmark Browser" --no-sandbox'}) == ["--user-agent=Benchmark Browser", "--no-sandbox"]
    monkeypatch.setenv("OD_CHROME_ARGS", "--no-sandbox")
    assert lib.chrome_args() == ["--no-sandbox"]
    monkeypatch.delenv("OD_CHROME_ARGS")
    assert lib.chrome_args() == []


def test_where_note_names_the_chrome_flags_the_description_left_out():
    """A published environment line always shows the start-up flags, said by the operator or not."""
    assert lib.where_note("Linux x86_64", {}) == "Linux x86_64"
    assert lib.where_note("Linux x86_64", {"MEASURE_WHERE": "a laptop"}) == "a laptop"
    assert lib.where_note("Linux x86_64", {"OD_CHROME_ARGS": "--no-sandbox"}) == "Linux x86_64; Chrome started with --no-sandbox"
    both = {"MEASURE_WHERE": "a job, Chrome with --no-sandbox", "OD_CHROME_ARGS": "--no-sandbox --disable-gpu"}
    assert lib.where_note("x", both) == "a job, Chrome with --no-sandbox; Chrome started with --disable-gpu"


def test_an_analysis_pagespeed_served_from_its_cache_is_not_counted_twice():
    """Five requests in three minutes came back as three analyses (2026-11-20): a copy has the first one's time."""
    seen: dict = {}
    first = {"page": "e/univer", "desktop": {"performance": 93, "fetchTime": "2026-11-20T05:53:01Z"}, "mobile": {"performance": 91, "fetchTime": "2026-11-20T05:53:02Z"}}
    assert lib.repeated_analysis(first, seen) == []
    copy = {"page": "e/univer", "desktop": {"performance": 93, "fetchTime": "2026-11-20T05:53:01Z"}, "mobile": {"performance": 88, "fetchTime": "2026-11-20T05:54:40Z"}}
    again = lib.repeated_analysis(copy, seen)
    assert again == ["desktop"]
    kept = lib.without_repeats(copy, again)
    assert "desktop" not in kept and kept["mobile"]["performance"] == 88 and kept["error"] == lib.PSI_REPEAT and kept["repeated"] == ["desktop"]
    # The same time on another page is another analysis, and a report without a time is never called a copy.
    assert lib.repeated_analysis({"page": "e/plate", "desktop": {"performance": 93, "fetchTime": "2026-11-20T05:53:01Z"}}, seen) == []
    assert lib.repeated_analysis({"page": "e/univer", "desktop": {"performance": 93}}, seen) == []
    assert lib.summarize({"lighthouseVersion": "13", "fetchTime": "2026-11-20T05:53:01Z", "categories": {}, "audits": {}})["fetchTime"] == "2026-11-20T05:53:01Z"
    e = lib.page_entry([first, kept], limit_s=240)
    assert e["desktop"]["performanceRuns"] == [93, None] and e["mobile"]["performanceRuns"] == [91, 88]


# --- review of pull request 32 (CodeRabbit, 2026-11-20) ---


def _psi(page, d=None, m=None):
    x = {"page": page}
    if d:
        x["desktop"] = {"performance": 90, "fetchTime": d}
    if m:
        x["mobile"] = {"performance": 80, "fetchTime": m}
    return x


def test_a_fresh_form_factor_is_kept_while_the_other_is_asked_again():
    """D0 and M0 are counted. An attempt returns D0 (a copy) with a fresh M1; the next returns a
    fresh D1 with M1, which is now a copy of the attempt before. Both fresh analyses are published."""
    seen: dict = {}
    assert lib.repeated_analysis(_psi("e/plate", "D0", "M0"), seen) == []
    kept: dict = {}
    first = _psi("e/plate", "D0", "M1")
    assert lib.still_repeated(kept, first, lib.repeated_analysis(first, seen)) == ["desktop"]
    second = _psi("e/plate", "D1", "M1")
    missing = lib.still_repeated(kept, second, lib.repeated_analysis(second, seen))
    assert missing == []
    out = lib.with_kept(second, kept, missing)
    assert out["desktop"]["fetchTime"] == "D1" and out["mobile"]["fetchTime"] == "M1" and "error" not in out


def test_a_fresh_form_factor_survives_a_retry_that_fails():
    seen: dict = {}
    lib.repeated_analysis(_psi("e/plate", "D0", "M0"), seen)
    kept: dict = {}
    first = _psi("e/plate", "D0", "M1")
    lib.still_repeated(kept, first, lib.repeated_analysis(first, seen))
    failed = {"page": "e/plate", "error": "PageSpeed gave no result within 240 s"}
    missing = lib.still_repeated(kept, failed, lib.repeated_analysis(failed, seen))
    out = lib.with_kept(failed, kept, missing)
    assert out["mobile"]["fetchTime"] == "M1" and "desktop" not in out and out["error"].startswith("PageSpeed gave no result")


def test_a_form_factor_that_stays_a_copy_is_left_out_and_said_so():
    seen: dict = {}
    lib.repeated_analysis(_psi("e/plate", "D0", "M0"), seen)
    kept: dict = {}
    x = _psi("e/plate", "D0", "M1")
    missing = lib.still_repeated(kept, x, lib.repeated_analysis(x, seen))
    out = lib.with_kept(x, kept, missing)
    assert "desktop" not in out and out["repeated"] == ["desktop"] and out["mobile"]["fetchTime"] == "M1"


def test_an_uncollected_heap_stays_out_of_the_median_and_is_counted():
    s = lib.engine_summary([
        {"renderedMs": 1, "heapBytes": 100},
        {"renderedMs": 1, "heapBytes": 900, "heapBytesBeforeGc": 900, "heapNotCollected": "TimeoutError"},
        {"renderedMs": 1, "heapBytes": 300},
    ])
    assert s["heapBytes"] == 200 and s["heapNotCollected"] == 1
    # Every run uncollected: the figure is shown, and the row says what it is.
    all_un = lib.engine_summary([{"renderedMs": 1, "heapBytes": 900, "heapNotCollected": "x"}])
    assert all_un["heapBytes"] == 900 and all_un["heapNotCollected"] == 1
    assert lib.engine_summary([{"renderedMs": 1, "heapBytes": 5}])["heapNotCollected"] == 0


def _quiet(loads, env):
    """quiet_host over a scripted list of load readings (the last one repeats), on a fake clock."""
    t, it = [0.0], iter(loads)
    last = [loads[-1]]

    def load():
        last[0] = next(it, last[0])
        return last[0]

    async def sleep(s):
        t[0] += s

    return lib.asyncio.run(lib.quiet_host(env, load=load, sleep=sleep, now=lambda: t[0])), t[0]


def test_a_run_waits_for_a_quiet_host_and_gives_up_with_the_reason():
    assert _quiet([200], {}) == (None, 0.0)  # no limit given: one's own machine, no wait
    assert _quiet([30], {"OD_MAX_LOAD": "48"}) == (None, 0.0)
    why, waited = _quiet([90, 90, 70, 40], {"OD_MAX_LOAD": "48"})
    assert why is None and waited == 30.0
    why, waited = _quiet([90], {"OD_MAX_LOAD": "48", "OD_LOAD_WAIT_S": "60"})
    assert "busy" in why and "48" in why and waited == 60.0


def test_the_heap_is_read_after_a_collection_and_says_when_it_could_not_be():
    class Cdp:
        def __init__(self, fail):
            self.fail, self.sent = fail, []

        async def send(self, method):
            self.sent.append(method)
            if self.fail and method == "HeapProfiler.collectGarbage":
                raise TimeoutError("no answer")
            return {"metrics": [{"name": "JSHeapUsedSize", "value": 700.0}]}

    ok = Cdp(False)
    assert lib.asyncio.run(lib.collected_heap(ok, 1281)) == {"heapBytesBeforeGc": 1281, "heapBytes": 700}
    assert ok.sent == ["HeapProfiler.collectGarbage", "Performance.getMetrics"]
    bad = lib.asyncio.run(lib.collected_heap(Cdp(True), 1281))
    assert bad["heapBytes"] == 1281 and bad["heapNotCollected"].startswith("TimeoutError")


# --- second review round (CodeRabbit, CodeAnt, Gitar; 2026-11-20) ---


def test_a_retry_that_fails_keeps_the_form_factor_owed_and_says_it_was_a_copy():
    seen: dict = {}
    lib.remember_analyses(_psi("e/plate", "D0", "M0"), seen)
    kept: dict = {}
    first = _psi("e/plate", "D0", "M1")
    missing = lib.still_repeated(kept, first, lib.repeated_analysis(first, seen, remember=False))
    failed = {"page": "e/plate", "error": "PageSpeed gave no result within 240 s"}
    missing = lib.still_repeated(kept, failed, lib.repeated_analysis(failed, seen, remember=False), missing)
    assert missing == ["desktop"]  # still owed: the loop asks again
    out = lib.with_kept(failed, kept, missing)
    assert out["repeated"] == ["desktop"] and out["mobile"]["fetchTime"] == "M1"


def test_only_published_analyses_are_remembered():
    """D0/M0 are counted. A job gets D1 with M0 (a copy), then D2 with M1: D1 and M1 are published.
    D2 was never published, so the next job may count it; D1 may not be counted twice."""
    seen: dict = {}
    lib.remember_analyses(_psi("e/plate", "D0", "M0"), seen)
    kept: dict = {}
    a = _psi("e/plate", "D1", "M0")
    missing = lib.still_repeated(kept, a, lib.repeated_analysis(a, seen, remember=False))
    b = _psi("e/plate", "D2", "M1")
    missing = lib.still_repeated(kept, b, lib.repeated_analysis(b, seen, remember=False), missing)
    out = lib.with_kept(b, kept, missing)
    lib.remember_analyses(out, seen)
    assert (out["desktop"]["fetchTime"], out["mobile"]["fetchTime"]) == ("D1", "M1")
    assert lib.repeated_analysis(_psi("e/plate", "D2"), seen, remember=False) == []
    assert lib.repeated_analysis(_psi("e/plate", "D1", "M1"), seen, remember=False) == ["desktop", "mobile"]


def test_the_first_fresh_report_counts_even_with_an_error_and_a_report_without_a_time_is_kept():
    kept: dict = {}
    bad = {"page": "e/plate", "desktop": {"fetchTime": "D1", "error": "the engine failed to start"}}
    # A fresh report with an error is a result: it is not asked for again.
    assert lib.still_repeated(kept, bad, ["mobile"]) == ["mobile"]
    good = _psi("e/plate", "D2", "M1")
    assert lib.still_repeated(kept, good, [], ["mobile"]) == []
    assert kept["desktop"] == bad["desktop"] and kept["mobile"]["fetchTime"] == "M1"
    # A report that carries no time cannot be a copy: it is kept like any fresh one.
    kept = {}
    lib.still_repeated(kept, {"page": "e/plate", "desktop": {"performance": 90}}, ["mobile"])
    assert kept == {"desktop": {"performance": 90}}


def test_a_run_without_a_heap_reading_does_not_hide_the_uncollected_one():
    s = lib.engine_summary([{"renderedMs": 1}, {"renderedMs": 1, "heapBytes": 900, "heapNotCollected": "x"}])
    assert s["heapBytes"] == 900 and s["heapNotCollected"] == 1
    s = lib.engine_summary([{"renderedMs": 1}, {"renderedMs": 1, "heapBytes": 900, "heapNotCollected": "x"}, {"renderedMs": 1, "heapBytes": 100}])
    assert s["heapBytes"] == 100
    assert lib.heap_median([{"heapBytes": 900, "heapNotCollected": "x"}, {}]) == (900, 1)
    assert lib.heap_median([{}]) == (None, 0)


def test_a_page_named_twice_is_analysed_once_per_round():
    assert lib.page_list("e/plate,e/folio,e/plate, ,e/folio") == ["e/plate", "e/folio"]
