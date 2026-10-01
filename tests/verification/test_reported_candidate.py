"""Real disposable Git changes prove inherited application build reuse fails closed."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.verification.reported_candidate import ADOPTION, adapter_snapshots, preserved_application

ROOT=Path(__file__).resolve().parents[2]


class ReportedCandidateTests(unittest.TestCase):
    def setUp(self):
        scratch=ROOT/'artifacts/reported-candidate-tests';scratch.mkdir(parents=True,exist_ok=True)
        self.temporary=tempfile.TemporaryDirectory(dir=scratch)
        self.repo=Path(self.temporary.name)/'repo'
        subprocess.run(['git','clone','--shared','--quiet','--no-checkout',str(ROOT),str(self.repo)],check=True)
        self.git('checkout','--detach','--quiet',ADOPTION)
        self.git('config','user.name','Synthetic Gate Test');self.git('config','user.email','test@example.invalid');self.git('config','commit.gpgsign','false');self.git('config','core.hooksPath',str(self.repo/'.git/empty-test-hooks'))

    def tearDown(self):self.temporary.cleanup()

    def git(self,*args):return subprocess.run(['git','-C',str(self.repo),*args],capture_output=True,text=True,check=True).stdout

    def changed(self,path,data):
        target=self.repo/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(data)
        self.git('add',path);self.git('commit','-qm','test(verification): synthetic input mutation')
        return self.git('rev-parse','HEAD').strip()

    def test_actual_baseline_is_exact_unchanged_input(self):
        self.assertEqual(preserved_application(self.repo,ADOPTION)['application'],'UNCHANGED')

    def test_retained_artifact_source_cannot_enter_either_adapter_build(self):
        artifacts=self.repo/'artifacts';artifacts.mkdir()
        (artifacts/'poison.astro').write_text('deliberately invalid retained source fixture\n')
        output=artifacts/'isolated-builds';output.mkdir()
        profiles=adapter_snapshots(self.repo,ADOPTION,output,{})
        self.assertEqual({adapter for _,adapter,_,_ in profiles},{'node','netlify'})
        self.assertEqual(len({path for _,_,path,_ in profiles}),2)
        for _,_,path,environment in profiles:
            self.assertNotEqual(path,self.repo)
            self.assertFalse((path/'artifacts/poison.astro').exists())
            self.assertEqual(Path(environment['TMPDIR']),path/'artifacts/tmp')
            self.assertTrue((path/'src/pages/index.astro').is_file())

    def test_published_page_mutation_cannot_reuse_baseline_build(self):
        sha=self.changed('src/pages/policies.md','incorrect replacement content\n')
        with self.assertRaisesRegex(ValueError,'Application bytes changed'):preserved_application(self.repo,sha)

    def test_altered_production_command_cannot_reuse_baseline_build(self):
        p=self.repo/'package.json';data=json.loads(p.read_text());data['scripts']['prod']='node incorrect.mjs'
        sha=self.changed('package.json',json.dumps(data))
        with self.assertRaisesRegex(ValueError,'runtime manifest or commands'):preserved_application(self.repo,sha)

    def test_changed_locked_package_cannot_reuse_baseline_build(self):
        p=self.repo/'package-lock.json';data=json.loads(p.read_text());data['packages']['node_modules/astro']['version']='0.0.0'
        sha=self.changed('package-lock.json',json.dumps(data))
        with self.assertRaisesRegex(ValueError,'inherited locked package'):preserved_application(self.repo,sha)

    def test_new_runtime_dependency_cannot_reuse_baseline_build(self):
        p=self.repo/'package-lock.json';data=json.loads(p.read_text());data['packages']['node_modules/synthetic-runtime']={'version':'1.0.0'}
        sha=self.changed('package-lock.json',json.dumps(data))
        with self.assertRaisesRegex(ValueError,'New runtime lock entries'):preserved_application(self.repo,sha)

    def test_only_run_outputs_may_be_added_to_typecheck_exclusions(self):
        data=json.loads((self.repo/'tsconfig.json').read_text())
        data['exclude']=['${configDir}/dist','${configDir}/artifacts']
        sha=self.changed('tsconfig.json',json.dumps(data))
        self.assertEqual(preserved_application(self.repo,sha)['typecheck_configuration'],'RUN_OUTPUT_EXCLUSION_ONLY')

    def test_application_source_exclusion_cannot_weaken_typechecking(self):
        data=json.loads((self.repo/'tsconfig.json').read_text());data['exclude']=['src']
        sha=self.changed('tsconfig.json',json.dumps(data))
        with self.assertRaisesRegex(ValueError,'Typecheck configuration changed'):preserved_application(self.repo,sha)
