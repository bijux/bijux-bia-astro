"""Git edge cases and staged/worktree separation at execution time."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.reports.candidate import fingerprint
from scripts.verification.staged import export

ROOT = Path(__file__).resolve().parents[2]
RID = "20261001-000000-staged-execution"


class StagedTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / "artifacts/staged-tests"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=scratch)
        self.repo = Path(self.temporary.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Isolated Tool Test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.hooksPath", str(self.repo / ".git/empty-test-hooks"))
        (self.repo / "logic.mjs").write_text("process.exit(0);\n")
        self.git("add", "logic.mjs")
        self.git("commit", "-qm", "isolated source")

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], capture_output=True, check=True).stdout

    def output(self):
        return self.repo / "artifacts/frozen"

    def test_passing_worktree_cannot_hide_failing_index(self):
        file = self.repo / "logic.mjs"
        file.write_text("process.exit(7);\n")
        self.git("add", "logic.mjs")
        file.write_text("process.exit(0);\n")
        before = self.git("status", "--porcelain", "-z")
        identity = fingerprint(self.repo, RID)
        export(self.repo, RID, self.output())
        result = subprocess.run(["node", "logic.mjs"], cwd=self.output() / "candidate")
        self.assertEqual(result.returncode, 7)
        self.assertEqual(file.read_text(), "process.exit(0);\n")
        self.assertEqual(fingerprint(self.repo, RID), identity)
        after = self.git("status", "--porcelain", "-z")
        self.assertIn(before, after)

    def test_add_delete_rename_modes_unicode_and_internal_symlink(self):
        self.git("mv", "logic.mjs", "café space.mjs")
        (self.repo / "new.txt").write_text("new")
        (self.repo / "entry.mjs").symlink_to("café space.mjs")
        self.git("add", "new.txt", "entry.mjs")
        self.git("update-index", "--chmod=+x", "café space.mjs")
        frozen = export(self.repo, RID, self.output())
        snap = self.output() / "candidate"
        self.assertFalse((snap / "logic.mjs").exists())
        self.assertEqual((snap / "new.txt").read_text(), "new")
        self.assertEqual(os.readlink(snap / "entry.mjs"), "café space.mjs")
        self.assertEqual((snap / "café space.mjs").stat().st_mode & 0o777, 0o755)
        self.assertEqual(frozen["candidate_sha256"], fingerprint(snap, RID)["candidate_sha256"])

    def test_symlink_escape_rejected_before_writes(self):
        for target in ("../../user-file", "/etc/hosts"):
            link = self.repo / "escape"
            link.symlink_to(target)
            self.git("add", "escape")
            with self.assertRaises(ValueError):
                export(self.repo, RID, self.output())
            self.assertFalse(self.output().exists())
            link.unlink()

    def test_conflicting_index_rejected(self):
        blob = self.git("rev-parse", "HEAD:logic.mjs").decode().strip()
        self.git("update-index", "--force-remove", "logic.mjs")
        subprocess.run(["git", "-C", str(self.repo), "update-index", "--index-info"], input=f"100644 {blob} 1\tlogic.mjs\n100644 {blob} 2\tlogic.mjs\n".encode(), check=True)
        with self.assertRaises(ValueError):
            export(self.repo, RID, self.output())
        self.assertFalse(self.output().exists())

    def test_submodule_not_silently_omitted(self):
        sha = self.git("rev-parse", "HEAD").decode().strip()
        self.git("update-index", "--add", "--cacheinfo", f"160000,{sha},module")
        with self.assertRaises(ValueError):
            export(self.repo, RID, self.output())

    def test_output_cannot_overwrite_or_escape_artifacts(self):
        with self.assertRaises(ValueError):
            export(self.repo, RID, self.repo / "user")
        export(self.repo, RID, self.output())
        with self.assertRaises(ValueError):
            export(self.repo, RID, self.output())
