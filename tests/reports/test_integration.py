"""Disposable synthetic merges exercise topology/provenance, not GitHub approval."""

import copy
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from scripts.reports.integration import expected_tree, validate_node, verify_live_checks

ROOT = Path(__file__).resolve().parents[2]


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / 'artifacts/integration-tests'
        scratch.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=scratch)
        self.repo = Path(self.temporary.name)
        self.git('init', '-q', '--initial-branch=main')
        self.git('config', 'user.name', 'Synthetic Integration Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
        self.git('config', 'core.hooksPath', str(self.repo / '.git/empty-test-hooks'))
        (self.repo / 'source.txt').write_text('original\n')
        self.git('add', 'source.txt')
        self.git('commit', '-qm', 'synthetic baseline')
        self.base = self.git('rev-parse', 'HEAD').strip()
        self.git('checkout', '-qb', 'feat/consumer-contract')
        (self.repo / 'source.txt').write_text('checked head\n')
        self.git('add', 'source.txt')
        self.git('commit', '-qm', 'synthetic authored head')
        self.head = self.git('rev-parse', 'HEAD').strip()
        self.git('checkout', '-q', 'main')
        self.git('merge', '--no-ff', '-qm', 'Merge pull request #17 from example/consumer-contract', self.head)
        self.merge = self.git('rev-parse', 'HEAD').strip()
        self.tree = self.git('rev-parse', 'HEAD^{tree}').strip()
        self.provenance = {'number':17,'merged':True,'merged_at':'2026-10-01T00:00:00Z','merged_by':{'login':'synthetic'},'merge_commit_sha':self.merge,'base':{'ref':'main','repo':{'full_name':'example/frontend'}},'head':{'sha':self.head,'repo':{'full_name':'example/frontend'}},'html_url':'https://example.invalid/synthetic-pr'}
        self.checks = {'repository':'example/frontend','base_sha':self.base,'head_sha':self.head,'tree_sha':self.tree,'runs':[{'candidate':kind,'sha':sha,'conclusion':'success','status':'completed','url':'https://example.invalid/synthetic-run','checked_at_utc':'2026-10-01T00:00:00Z'} for kind,sha in [('head',self.head),('integration',self.merge)]]}

    def tearDown(self):
        self.temporary.cleanup()

    def git(self,*args):
        return subprocess.run(['git','-C',str(self.repo),*args],capture_output=True,text=True,check=True).stdout

    def verify(self,provenance=None,checks=None):
        return validate_node(self.repo,self.merge,self.base,self.head,provenance or self.provenance,'example/frontend',checks or self.checks)

    def test_retained_head_and_exact_automatic_tree_accepted(self):
        self.assertEqual(expected_tree(self.repo,self.base,self.head),self.tree)
        self.assertEqual(self.verify()['result'],'VERIFIED_GENERATED_INTEGRATION')

    def test_wrong_parent_order_or_linear_squash_rejected(self):
        with self.assertRaises(ValueError):
            validate_node(self.repo,self.merge,self.head,self.base,self.provenance,'example/frontend',self.checks)
        with self.assertRaises(ValueError):
            validate_node(self.repo,self.head,self.base,self.head,self.provenance,'example/frontend',self.checks)

    def test_extra_unreported_merge_tree_rejected(self):
        (self.repo/'extra.txt').write_text('unreported resolution\n')
        self.git('add','extra.txt')
        tree=self.git('write-tree').strip()
        self.merge=self.git('commit-tree',tree,'-p',self.base,'-p',self.head,'-m','Merge pull request #17 from example/consumer-contract').strip()
        self.provenance['merge_commit_sha']=self.merge
        with self.assertRaisesRegex(ValueError,'unreported'):
            self.verify()

    def test_missing_foreign_unmerged_or_wrong_head_provenance_rejected(self):
        for mutation in ('unmerged','wrong_sha','foreign','wrong_head','wrong_number'):
            row=copy.deepcopy(self.provenance)
            if mutation=='unmerged':row['merged']=False
            elif mutation=='wrong_sha':row['merge_commit_sha']=self.head
            elif mutation=='foreign':row['head']['repo']['full_name']='other/frontend'
            elif mutation=='wrong_head':row['head']['sha']=self.base
            else:row['number']=99
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):self.verify(provenance=row)

    def test_failed_missing_stale_skipped_or_pending_checks_rejected(self):
        for mutation in ('missing','failed','skipped','pending','wrong_tree','wrong_sha'):
            row=copy.deepcopy(self.checks)
            if mutation=='missing':row['runs'].pop()
            elif mutation=='failed':row['runs'][0]['conclusion']='failure'
            elif mutation=='skipped':row['runs'][0]['conclusion']='skipped'
            elif mutation=='pending':row['runs'][0]['status']='in_progress'
            elif mutation=='wrong_tree':row['tree_sha']='a'*40
            else:row['runs'][0]['sha']=self.base
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):self.verify(checks=row)

    def test_reported_generated_merge_rejected(self):
        self.git('commit','--amend','-qm','Merge pull request #17 from example/consumer-contract\n\nReport-ID: 20261001-000000-synthetic')
        self.merge=self.git('rev-parse','HEAD').strip()
        self.provenance['merge_commit_sha']=self.merge
        with self.assertRaisesRegex(ValueError,'masquerade'):self.verify()

    def test_conflicting_automatic_merge_rejected(self):
        self.git('checkout','-qb','conflicting-base',self.base)
        (self.repo/'source.txt').write_text('conflicting base\n')
        self.git('add','source.txt');self.git('commit','-qm','synthetic base advancement')
        base=self.git('rev-parse','HEAD').strip()
        with self.assertRaisesRegex(ValueError,'conflicts'):expected_tree(self.repo,base,self.head)

    def test_claimed_pass_cannot_override_live_actions_failure(self):
        self.checks['runs'][0]['run_id']=123
        run={'event':'push','path':'.github/workflows/reported_integration.yaml','head_sha':self.head,'status':'completed','conclusion':'failure','html_url':self.checks['runs'][0]['url']}
        with patch('scripts.reports.integration.fetch_json',return_value=run),self.assertRaisesRegex(ValueError,'Live Actions'):
            verify_live_checks(self.repo,'example/frontend',self.checks)

    def test_missing_terminal_job_cannot_claim_successful_live_run(self):
        self.checks['runs'][0]['run_id']=123
        run={'event':'push','path':'.github/workflows/reported_integration.yaml','head_sha':self.head,'status':'completed','conclusion':'success','html_url':self.checks['runs'][0]['url']}
        jobs={'total_count':1,'jobs':[{'name':'Reported verification','status':'completed','conclusion':'success'}]}
        with patch('scripts.reports.integration.fetch_json',side_effect=[run,jobs]),self.assertRaisesRegex(ValueError,'reported verification job'):
            verify_live_checks(self.repo,'example/frontend',self.checks)
