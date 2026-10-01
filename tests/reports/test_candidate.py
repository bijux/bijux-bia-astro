"""Regression cases for engineering change reports."""

import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.reports import candidate as cd

class CandidateTests(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='bia-isolated-git-')
        self.repo = Path(self.tmp.name)
        self.rid = 'search-navigation-2026-10-01'
        self.git('init', '-q')
        self.git('config', 'user.name', 'Isolated Tool Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
        self.git('config', 'core.hooksPath', str(self.repo / '.git/empty-test-hooks'))
        self.file('app.js', 'export const value = 1;\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'isolated baseline')

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], capture_output=True, check=True, timeout=10).stdout

    def file(self, name, s):
        p = self.repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(s)

    def digest(self):
        return cd.fingerprint(self.repo, self.rid)

    def test_repeatable(self):
        self.assertEqual(self.digest(), self.digest())

    def test_unstaged_does_not_affect(self):
        b = self.digest()
        self.file('app.js', 'unstaged')
        self.assertEqual(b, self.digest())

    def test_staged_changes_affect(self):
        b = self.digest()
        self.file('app.js', 'changed')
        self.git('add', '.')
        self.assertNotEqual(b, self.digest())

    def test_exact_current_triplet_excluded(self):
        b = self.digest()
        for ext in ('json', 'tex', 'pdf'):
            self.file(f'reports/commits/{self.rid}.{ext}', 'test-only placeholder')
        self.git('add', '.')
        self.assertEqual(b, self.digest())

    def test_old_report_included(self):
        b = self.digest()
        self.file('reports/commits/viewer-link-preservation-2026-09-30.json', 'changed')
        self.git('add', '.')
        self.assertNotEqual(b, self.digest())

    def test_template_included(self):
        b = self.digest()
        self.file('reports/templates/report.tex', 'changed')
        self.git('add', '.')
        self.assertNotEqual(b, self.digest())

    def test_other_suffix_included(self):
        b = self.digest()
        self.file(f'reports/commits/{self.rid}.js', 'source')
        self.git('add', '.')
        self.assertNotEqual(b, self.digest())

    def test_parent_changes(self):
        b = self.digest()
        self.git('commit', '--allow-empty', '-qm', 'new parent')
        self.assertNotEqual(b, self.digest())

    def test_mode_bound(self):
        b = self.digest()
        self.git('update-index', '--chmod=+x', 'app.js')
        self.assertNotEqual(b, self.digest())

    def test_deletion_bound(self):
        b = self.digest()
        self.git('rm', 'app.js')
        self.assertNotEqual(b, self.digest())

    def test_unicode_space_path(self):
        b = self.digest()
        self.file('tests/café space.js', 'fixture')
        self.git('add', '.')
        self.assertNotEqual(b, self.digest())

    def test_index_equals_result_commit(self):
        self.file('app.js', 'new payload')
        self.git('add', '.')
        b = self.digest()
        for ext in ('json', 'tex', 'pdf'):
            self.file(f'reports/commits/{self.rid}.{ext}', 'isolated placeholder')
        self.git('add', '.')
        self.git('commit', '-qm', f'isolated candidate\n\nReport-ID: {self.rid}')
        self.assertEqual(b, cd.fingerprint(self.repo, self.rid, 'HEAD'))

    def test_submodule_rejected(self):
        head = self.git('rev-parse', 'HEAD').decode().strip()
        self.git('update-index', '--add', '--cacheinfo', f'160000,{head},module')
        with self.assertRaises(ValueError):
            self.digest()

    def test_bad_id(self):
        with self.assertRaises(ValueError):
            cd.fingerprint(self.repo, '../../BAD')

    def test_root_commit_rejected(self):
        with self.assertRaises(ValueError):
            cd.fingerprint(self.repo, self.rid, 'HEAD')

    def test_option_revision_rejected(self):
        with self.assertRaises(ValueError):
            cd.fingerprint(self.repo, self.rid, '--all')

    def test_amend_uses_existing_parent(self):
        self.file('app.js', 'reported payload')
        self.git('add', 'app.js')
        self.git('commit', '-qm', 'test(reports): bind reported payload')
        before = cd.fingerprint(self.repo, self.rid, 'HEAD')
        self.assertEqual(before, cd.fingerprint(self.repo, self.rid, amend=True))

    def test_amend_root_rejected(self):
        with self.assertRaises(ValueError):
            cd.fingerprint(self.repo, self.rid, amend=True)

    def test_amend_committed_revision_rejected(self):
        with self.assertRaises(ValueError):
            cd.fingerprint(self.repo, self.rid, 'HEAD', amend=True)
