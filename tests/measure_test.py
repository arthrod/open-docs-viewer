"""Result preservation and CLI validation without launching Chrome."""
import ast
import asyncio
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'measure.py'
module = ast.parse(SCRIPT.read_text(), filename=str(SCRIPT))
module.body.pop()  # Exercise main explicitly, without the script's asyncio.run.
namespace = {}
playwright = types.ModuleType('playwright.async_api')
playwright.async_playwright = lambda: None
with patch.dict(sys.modules, {'playwright': types.ModuleType('playwright'), 'playwright.async_api': playwright}):
    exec(compile(module, str(SCRIPT), 'exec'), namespace)


class ResultsTest(unittest.TestCase):
    def test_failed_engine_preserves_previous_and_success_updates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'results.json'
            old = {'renderedMs': 10, 'how': 'previous'}
            path.write_text(json.dumps({'engines': {'plate': old, 'folio': old}}))
            namespace['write_results'](str(path), {
                'plate': {'renderedMs': None},
                'google-viewer': {'renderedMs': 20, 'how': 'data-od-rendered'},
                'new-failure': {'renderedMs': None},
            }, 3)
            engines = json.loads(path.read_text())['engines']
            self.assertEqual(engines['plate'], old)
            self.assertEqual(engines['folio'], old)
            self.assertNotIn('new-failure', engines)
            self.assertEqual(engines['google-viewer']['how'], namespace['FRAME_HOW'])

    def test_corrupt_json_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'results.json'
            path.write_text('{broken')
            with self.assertRaisesRegex(SystemExit, 'Cannot parse results file'):
                namespace['write_results'](str(path), {}, 3)
            self.assertEqual(path.read_text(), '{broken')

    def test_missing_file_is_created(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'results.json'
            namespace['write_results'](str(path), {'plate': {'renderedMs': 20}}, 3)
            self.assertEqual(json.loads(path.read_text())['engines']['plate']['renderedMs'], 20)

    def test_missing_results_path_exits_before_browser(self):
        for args in (['--results'], ['--results', '--other']):
            with self.subTest(args=args), patch.object(sys, 'argv', ['measure.py', 'all', '3', *args]):
                with self.assertRaisesRegex(SystemExit, '--results requires a path'):
                    asyncio.run(namespace['main']())


if __name__ == '__main__':
    unittest.main()
