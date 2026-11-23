"""The documented `all` runs measure every engine and route the README tables print (outside review, 2026-11-23)."""
import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def all_of(script: str) -> list[str]:
    tree = ast.parse((ROOT / "scripts" / script).read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "ALL" for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError(f"{script} has no ALL")


def server_routes() -> set[str]:
    src = (ROOT / "server/results.ts").read_text()
    block = src[src.index("export const SERVER_ROUTES"):]
    block = block[: block.index("\n];")]
    return set(re.findall(r'"slug": "([^"]+)"', block))


def test_browser_all_covers_every_engine_in_the_browser_table():
    engines = set(json.loads((ROOT / "results/browser.json").read_text())["engines"])
    assert engines - set(all_of("measure.py")) == set()


def test_server_all_covers_every_server_route():
    routes = server_routes()
    assert len(routes) >= 12
    assert routes - set(all_of("measure_server.py")) == set()
    assert routes - set(all_of("measure_server_client.py")) == set()
