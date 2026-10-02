"""Synthetic disposable histories test admission binding, never application claims."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.verification import admission as tool

ROOT = Path(__file__).resolve().parents[2]


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / "artifacts/admission-tests"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=scratch)
        self.repo = Path(self.temporary.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Isolated Tool Test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.hooksPath", str(self.repo / ".git/empty-test-hooks"))
        (self.repo / "configs/development").mkdir(parents=True)
        (self.repo / "configs/development/toolchain.json").write_text('{"node":"24.21.0","npm":"11.19.0"}')
        (self.repo / "reports/commits").mkdir(parents=True)
        (self.repo / "docs").mkdir()
        (self.repo / "docs/change.md").write_text("original\n")
        (self.repo / "package.json").write_text(json.dumps({"name": "synthetic-test", "scripts": {key: "test fixture" for key in ("dev", "start", "build", "preview", "prod", "local")}}))
        (self.repo / "package-lock.json").write_text("{}")
        self.git("add", "configs", "docs", "package.json", "package-lock.json")
        self.git("commit", "-qm", "isolated baseline")
        (self.repo / "docs/change.md").write_text("staged\n")
        self.git("add", "docs/change.md")
        self.prepared = tool.preparation(self.repo, "synthetic-admission")
        self.out = self.repo / self.prepared["output"]

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], capture_output=True, check=True).stdout

    def synthetic_receipt(self):
        def observed(name, command, *args, **kwargs):
            return {"gate": name, "command": command, "result": "PASS", "exit_code": 0, "duration_seconds": 0.1, "timed_out": False, "log": "synthetic-only"}
        with patch.object(tool, "run_gate", observed):
            return tool.execute(self.repo, self.out)

    def staged_report(self):
        self.synthetic_receipt()
        _, _, _, frozen, receipt = tool.checked_results(self.repo, self.out)
        data = json.loads((ROOT / "tests/reports/fixtures/illustrative-report.json").read_text())
        data.update(record_kind="commit", report_id=frozen["report_id"], prepared_at_utc=json.loads((self.out / "preparation.json").read_text())["prepared_at_utc"], parent_sha=frozen["parent_sha"], candidate_sha256=frozen["candidate_sha256"], checks=tool.summaries(self.repo, self.out, receipt))
        (self.out / "regenerated").mkdir()
        for extension in ("json", "tex", "pdf"):
            name = f"{frozen['report_id']}.{extension}"
            content = json.dumps(data).encode() if extension == "json" else b"synthetic triplet binding only; not a generated report"
            (self.out / "regenerated" / name).write_bytes(content)
            (self.repo / "reports/commits" / name).write_bytes(content)
            self.git("add", "reports/commits/" + name)

    def test_staged_mutation_invalidates_completed_receipt(self):
        self.synthetic_receipt()
        (self.repo / "docs/change.md").write_text("changed after execution\n")
        self.git("add", "docs/change.md")
        with self.assertRaises(ValueError):
            tool.checked_results(self.repo, self.out)

    def test_snapshot_worktree_mutation_invalidates_receipt(self):
        self.synthetic_receipt()
        (self.out / "candidate/docs/change.md").write_text("changed after export\n")
        with self.assertRaises(ValueError):
            tool.checked_results(self.repo, self.out)

    def test_missing_failed_or_tampered_requirements_rejected(self):
        self.synthetic_receipt()
        path = self.out / "results.json"
        original = json.loads(path.read_text())
        for receipt in (dict(original, result="FAIL"), dict(original, required=[]), dict(original, results=[]), dict(original, parent_sha="a" * 40)):
            path.write_text(json.dumps(receipt))
            with self.assertRaises(ValueError):
                tool.checked_results(self.repo, self.out)

    def test_triplet_and_exactly_one_trailer_binding(self):
        self.staged_report()
        message = self.out / "commit-message.txt"
        rid = self.prepared["report_id"]
        message.write_text(f"test(reports): bind synthetic evidence\n\nReport-ID: {rid}\n")
        self.assertEqual(tool.check(self.repo, self.out, message)["result"], "ADMITTED")
        for text in ("missing trailer", f"subject\n\nReport-ID: {rid}\nReport-ID: {rid}\n", "subject\n\nReport-ID: 20261001-000000-wrong\n"):
            message.write_text(text)
            with self.assertRaises(ValueError):
                tool.check(self.repo, self.out, message)

    def test_tampered_or_missing_staged_pdf_rejected(self):
        self.staged_report()
        name = f"reports/commits/{self.prepared['report_id']}.pdf"
        (self.repo / name).write_bytes(b"tampered")
        self.git("add", name)
        with self.assertRaises(ValueError):
            tool.check(self.repo, self.out)
        self.git("rm", "-f", name)
        with self.assertRaises(ValueError):
            tool.check(self.repo, self.out)

    def test_failed_toolchain_cannot_create_successful_receipt(self):
        with patch.object(tool, "run_gate", lambda name, command, *a, **k: {"gate": name, "command": command, "result": "FAIL", "exit_code": 7, "duration_seconds": 0.1, "timed_out": False, "log": "synthetic"}):
            self.assertEqual(tool.execute(self.repo, self.out)["result"], "FAIL")

    def test_application_content_and_lock_trigger_application_gates(self):
        snapshot = self.out / "candidate"
        self.assertFalse(tool.runtime_scope(snapshot))
        (snapshot / "src/pages").mkdir(parents=True)
        (snapshot / "src/pages/help.mdx").write_text("published content\n")
        subprocess.run(["git", "-C", str(snapshot), "add", "src/pages/help.mdx"], check=True)
        self.assertTrue(tool.runtime_scope(snapshot))

    def test_empty_verification_suite_fails(self):
        folder = self.repo / "empty"
        (folder / "scripts/verification").mkdir(parents=True)
        (folder / "tests/verification").mkdir(parents=True)
        script = folder / "scripts/verification/tests.py"
        script.write_bytes((ROOT / "scripts/verification/tests.py").read_bytes())
        result = subprocess.run(["python3", "-B", str(script)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"No verification tests collected", result.stderr)
