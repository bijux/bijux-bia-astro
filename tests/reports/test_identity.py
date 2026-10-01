"""Preparation timestamps, archive preservation and fresh identity boundaries."""

import copy
import json
import unittest
from pathlib import Path

from scripts.reports.archive import lookup
from scripts.reports.candidate import fingerprint
from scripts.reports.identity import legacy_archives, validate_id
from scripts.reports.record import validate

ROOT = Path(__file__).resolve().parents[2]


class IdentityTests(unittest.TestCase):
    def test_calendar_and_slug_rejections(self):
        for value in (
            "20260230-000000-search", "20261301-000000-search",
            "20261001-240000-search", "20261001-000060-search",
            "261001-000000-search", "20261001-000000-../search",
            "20261001-000000-search_unsafe", "20261001-000000-Search",
            "20261001-000000-search--state", "20261001-000000-search\n",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_id(value)

    def test_preparation_agreement(self):
        validate_id("20260228-235959-search", "2026-02-28T23:59:59Z")
        with self.assertRaises(ValueError):
            validate_id("20260228-235959-search", "2026-03-01T00:00:00Z")

    def test_leap_calendar(self):
        validate_id("20280229-000000-search")
        with self.assertRaises(ValueError):
            validate_id("20270229-000000-search")

    def test_record_timestamp_agreement(self):
        data = json.loads((ROOT / "tests/reports/fixtures/illustrative-report.json").read_text())
        data["report_id"] = "20261001-000001-illustrative-engineering-change"
        with self.assertRaises(ValueError):
            validate(data)

    def test_filename_sort_is_chronological(self):
        identities = ["20270101-000000-search", "20261231-235959-search", "20261001-001500-viewer"]
        self.assertEqual(sorted(identities), [identities[2], identities[1], identities[0]])

    def test_archives_match_original_bytes_and_trees(self):
        for report_id in legacy_archives(ROOT):
            with self.subTest(report_id=report_id):
                self.assertEqual(lookup(ROOT, report_id)["report_id"], report_id)

    def test_legacy_identity_cannot_author_new_candidate(self):
        for report_id, entry in legacy_archives(ROOT).items():
            with self.assertRaises(ValueError):
                fingerprint(ROOT, report_id)
            with self.assertRaises(ValueError):
                fingerprint(ROOT, report_id, "808857d90a142ab0dc10c873ec44a2e24a344a76")
            data = json.loads((ROOT / f"reports/commits/{entry['archive_stem']}.json").read_text())
            with self.assertRaises(ValueError):
                validate(copy.deepcopy(data), require_commit=True)
