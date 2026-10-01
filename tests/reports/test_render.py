"""Regression cases for engineering change reports."""

import json
import tempfile
import unittest
from pathlib import Path

from scripts.reports import render as renderer

R = Path(__file__).resolve().parents[2]

class RenderTests(unittest.TestCase):

    def test_nested_evidence_paths_wrap(self):
        data = json.loads((R / 'tests/reports/fixtures/illustrative-report.json').read_text())
        data['checks'][0]['evidence_ref'] = 'artifacts/admission/report-tools/report-tests.log'
        with tempfile.TemporaryDirectory() as directory:
            result = renderer.build(data, Path(directory))
            self.assertEqual(result['pages'], 1)

    def setUp(self):
        self.d = json.loads((R / 'tests/reports/fixtures/illustrative-report.json').read_text())

    def test_one_page_and_repeatable_bytes(self):
        with tempfile.TemporaryDirectory() as t:
            a = Path(t) / 'a'
            b = Path(t) / 'b'
            ra = renderer.build(self.d, a)
            renderer.build(self.d, b)
            self.assertEqual(ra['pages'], 1)
            for ext in ('tex', 'pdf'):
                self.assertEqual((a / f'illustrative-engineering-change.{ext}').read_bytes(), (b / f'illustrative-engineering-change.{ext}').read_bytes())

    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / 'illustrative-engineering-change.pdf'
            p.write_bytes(b'preserve')
            with self.assertRaises(ValueError):
                renderer.build(self.d, Path(t))
            self.assertEqual(p.read_bytes(), b'preserve')

    def test_overflow_rejected(self):
        self.d['why'] = 'W' * 590
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(ValueError):
                renderer.build(self.d, Path(t))
