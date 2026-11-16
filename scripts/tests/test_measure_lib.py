"""uv run --with pytest pytest scripts/tests"""
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
