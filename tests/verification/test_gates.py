"""Failure, timeout and missing-process controls for evidence collection."""

import sys
import tempfile
import unittest
from pathlib import Path

from scripts.verification.gates import require_pass, run_gate

ROOT = Path(__file__).resolve().parents[2]


class GateTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / "artifacts/gate-tests"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=scratch)
        self.output = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_real_failed_child_is_not_pass(self):
        result = run_gate("negative", [sys.executable, "-c", "raise SystemExit(7)"], self.output, self.output)
        self.assertEqual(result["exit_code"], 7)
        with self.assertRaises(ValueError):
            require_pass([result], ["negative"])

    def test_completed_child_has_observed_identity_timing_and_log(self):
        result = run_gate("control", [sys.executable, "-c", "print('known-good')"], self.output, self.output)
        require_pass([result], ["control"])
        self.assertIn("known-good", (self.output / result["log"]).read_text())
        self.assertGreater(result["duration_seconds"], 0)

    def test_missing_executable_blocks(self):
        result = run_gate("missing", [str(self.output / "absent")], self.output, self.output)
        self.assertEqual(result["result"], "BLOCKED")
        with self.assertRaises(ValueError):
            require_pass([result], ["missing"])

    def test_timeout_terminates_and_never_passes(self):
        result = run_gate("timeout", [sys.executable, "-c", "import time; time.sleep(30)"], self.output, self.output, timeout=0.1)
        self.assertTrue(result["timed_out"])
        with self.assertRaises(ValueError):
            require_pass([result], ["timeout"])

    def test_missing_duplicate_cancelled_or_unexecuted_results_reject(self):
        good = run_gate("control", [sys.executable, "-c", "pass"], self.output, self.output)
        for results, names in (([], ["control"]), ([good, good], ["control", "other"]), ([dict(good, result="NOT_RUN")], ["control"]), ([dict(good, exit_code=-15)], ["control"]), ([dict(good, duration_seconds=None)], ["control"])):
            with self.assertRaises(ValueError):
                require_pass(results, names)

    def test_log_cannot_be_overwritten(self):
        run_gate("control", [sys.executable, "-c", "pass"], self.output, self.output)
        with self.assertRaises(FileExistsError):
            run_gate("control", [sys.executable, "-c", "pass"], self.output, self.output)
