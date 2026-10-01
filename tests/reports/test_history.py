"""Synthetic records test original-tree binding; they never claim rendered PDF evidence."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.reports.candidate import fingerprint
from scripts.reports.history import report_identity

ROOT=Path(__file__).resolve().parents[2]
RID='20261001-000000-synthetic-original-identity'


class HistoryTests(unittest.TestCase):
    def setUp(self):
        scratch=ROOT/'artifacts/history-tests';scratch.mkdir(parents=True,exist_ok=True)
        self.temporary=tempfile.TemporaryDirectory(dir=scratch);self.repo=Path(self.temporary.name)
        self.git('init','-q');self.git('config','user.name','Synthetic Report Test');self.git('config','user.email','test@example.invalid');self.git('config','commit.gpgsign','false');self.git('config','core.hooksPath',str(self.repo/'.git/empty-test-hooks'))
        (self.repo/'source.txt').write_text('baseline\n');self.git('add','source.txt');self.git('commit','-qm','synthetic baseline')
        (self.repo/'source.txt').write_text('staged candidate\n');self.git('add','source.txt')
        identity=fingerprint(self.repo,RID)
        self.data=json.loads((ROOT/'tests/reports/fixtures/illustrative-report.json').read_text())
        self.data.update(record_kind='commit',report_id=RID,parent_sha=identity['parent_sha'],candidate_sha256=identity['candidate_sha256'],checks=[{'gate':'Synthetic identity','command':'unit fixture only','result':'PASS','duration_seconds':0.1,'exit_code':0,'evidence_ref':'artifacts/synthetic-only','required':True}])
        (self.repo/'reports/commits').mkdir(parents=True)
        for ext in ('tex','pdf'):(self.repo/f'reports/commits/{RID}.{ext}').write_bytes(b'synthetic identity fixture, not a rendered document')

    def tearDown(self):self.temporary.cleanup()

    def git(self,*args):return subprocess.run(['git','-C',str(self.repo),*args],capture_output=True,text=True,check=True).stdout

    def authored(self,trailer=None):
        (self.repo/f'reports/commits/{RID}.json').write_text(json.dumps(self.data))
        self.git('add',f'reports/commits/{RID}.json',f'reports/commits/{RID}.tex',f'reports/commits/{RID}.pdf')
        self.git('commit','-qm','test(reports): synthetic identity\n\n'+(trailer if trailer is not None else f'Report-ID: {RID}\n'))
        return self.git('rev-parse','HEAD').strip()

    def test_original_parent_and_payload_accepted(self):
        sha=self.authored();self.assertEqual(report_identity(self.repo,sha)['candidate_sha256'],self.data['candidate_sha256'])

    def test_wrong_parent_and_payload_rejected(self):
        self.data['parent_sha']='a'*40
        with self.assertRaises(ValueError):report_identity(self.repo,self.authored())

    def test_changed_source_after_preparation_rejected(self):
        (self.repo/'source.txt').write_text('different payload\n');self.git('add','source.txt')
        with self.assertRaises(ValueError):report_identity(self.repo,self.authored())

    def test_missing_and_duplicate_trailers_rejected(self):
        sha=self.authored('Report-ID: '+RID+'\nReport-ID: '+RID+'\n')
        with self.assertRaises(ValueError):report_identity(self.repo,sha)
        self.git('commit','--amend','-qm','test(reports): missing report trailer')
        with self.assertRaises(ValueError):report_identity(self.repo,self.git('rev-parse','HEAD').strip())

    def test_missing_or_executable_original_triplet_rejected(self):
        self.authored();self.git('rm',f'reports/commits/{RID}.pdf');self.git('commit','--amend','--no-edit','-q')
        with self.assertRaises(ValueError):report_identity(self.repo,self.git('rev-parse','HEAD').strip())

    def test_record_id_different_from_trailer_rejected(self):
        self.data['report_id']='20261001-000000-other-identity'
        with self.assertRaises(ValueError):report_identity(self.repo,self.authored())
