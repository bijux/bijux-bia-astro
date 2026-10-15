import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectImports } from '../../../scripts/verification/import-boundaries.mjs';
test('application imports resolve without runtime cycles or ownership violations', async () => {
    const report = await inspectImports();
    assert(report.files > 0);
    assert.deepEqual(report.issues, []);
});
