"""Regression cases for engineering change reports."""

import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.reports import record as rt
from scripts.reports import render as renderer

R = Path(__file__).resolve().parents[2]

class RecordTests(unittest.TestCase):

    def setUp(self):
        self.d = json.loads((R / 'tests/reports/fixtures/illustrative-report.json').read_text())

    def real(self):
        d = copy.deepcopy(self.d)
        d.update(record_kind='commit', parent_sha='a' * 40, candidate_sha256='b' * 64)
        d['checks'] = [dict(gate='unit', command='isolated synthetic test command', result='PASS', duration_seconds=1.0, exit_code=0, evidence_ref='synthetic record only', required=True)]
        return d

    def reject(self, f):
        with self.assertRaises(ValueError):
            f()

    def test_example_structure(self):
        rt.validate(self.d)

    def test_example_not_admissible(self):
        self.reject(lambda: rt.validate(self.d, True))

    def test_synthetic_real_structure(self):
        rt.validate(self.real(), True)

    def test_example_no_invented_parent(self):
        self.d['parent_sha'] = 'a' * 40
        self.reject(lambda: rt.validate(self.d))

    def test_missing_field(self):
        del self.d['risk']
        self.reject(lambda: rt.validate(self.d))

    def test_unknown_field(self):
        self.d['perfect'] = True
        self.reject(lambda: rt.validate(self.d))

    def test_path_traversal(self):
        self.d['report_id'] = 'BIA-../../BAD'
        self.reject(lambda: rt.validate(self.d))

    def test_future_ci(self):
        self.d['remote_status'] = 'PASS'
        self.reject(lambda: rt.validate(self.d))

    def test_required_nonpass(self):
        d = self.real()
        d['checks'][0].update(result='NOT_RUN', exit_code=None, duration_seconds=None)
        self.reject(lambda: rt.validate(d))

    def test_pass_missing_duration(self):
        d = self.real()
        d['checks'][0]['duration_seconds'] = None
        self.reject(lambda: rt.validate(d))

    def test_no_required_gate(self):
        d = self.real()
        d['checks'][0]['required'] = False
        self.reject(lambda: rt.validate(d))

    def test_zero_digest(self):
        d = self.real()
        d['candidate_sha256'] = '0' * 64
        self.reject(lambda: rt.validate(d))

    def test_failure_zero_exit(self):
        self.d['checks'][0].update(result='FAIL', duration_seconds=1, exit_code=0)
        self.reject(lambda: rt.validate(self.d))

    def test_not_run_fake_duration(self):
        self.d['checks'][0]['duration_seconds'] = 0
        self.reject(lambda: rt.validate(self.d))

    def test_duplicate_gate(self):
        self.d['checks'][1]['gate'] = self.d['checks'][0]['gate']
        self.reject(lambda: rt.validate(self.d))

    def test_backlog_metadata_rejected(self):
        self.d['task_ids'] = ['internal-planning-reference']
        self.reject(lambda: rt.validate(self.d))

    def test_invalid_gate_type(self):
        self.d['checks'][0]['gate'] = []
        self.reject(lambda: rt.validate(self.d))

    def test_invalid_result_type(self):
        self.d['checks'][0]['result'] = []
        self.reject(lambda: rt.validate(self.d))

    def test_authoring_state_rejected(self):
        self.d['backlog_status'] = 'completed'
        self.reject(lambda: rt.validate(self.d))

    def test_invalid_date(self):
        self.d['prepared_at_utc'] = '2026-02-30T00:00:00Z'
        self.reject(lambda: rt.validate(self.d))

    def test_nonfinite_duration(self):
        d = self.real()
        d['checks'][0]['duration_seconds'] = float('nan')
        self.reject(lambda: rt.validate(d))

    def test_excessive_text(self):
        self.d['why'] = 'x' * 601
        self.reject(lambda: rt.validate(self.d))

    def test_control_character(self):
        self.d['why'] = 'x\x00y'
        self.reject(lambda: rt.validate(self.d))

    def test_tex_escape(self):
        s = renderer.escape('\\input{secret} & $x_1$ # 10% ~ ^')
        self.assertNotIn('\\input{secret}', s)
        for x in ['\\textbackslash{}', '\\{', '\\&', '\\$', '\\_', '\\%', '\\#']:
            self.assertIn(x, s)

    def test_marker_not_reinterpreted(self):
        self.d['why'] = 'Text @@TITLE@@ and \\input{secret}'
        s = renderer.render_tex(self.d)
        self.assertIn('Text @@TITLE@@', s)
        self.assertNotIn('\\input{secret}', s)

    def test_duplicate_json_key(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / 'x.json'
            p.write_text('{"x":1,"x":2}')
            self.reject(lambda: rt.load(p))

    def test_nan_json(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / 'x.json'
            p.write_text('{"x":NaN}')
            self.reject(lambda: rt.load(p))
