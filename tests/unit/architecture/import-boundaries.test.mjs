import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundaryIssues } from '../../../scripts/verification/import-boundaries.mjs';
test('the architecture gate rejects a cycle, API presentation imports and browser-only Node dependencies', () => {
    const graph = new Map([
        ['src/api/client.mjs', { targets: ['src/features/images/viewers.mjs'], specifiers: [] }],
        ['src/features/images/viewers.mjs', { targets: ['src/api/client.mjs'], specifiers: ['node:fs'] }],
    ]);
    const issues = boundaryIssues(graph, ['src/features/images/viewers.mjs']);
    assert(issues.some(issue => issue.includes('Runtime import cycle')));
    assert(issues.some(issue => issue.includes('API imports presentation')));
    assert(issues.some(issue => issue.includes('browser imports node:fs')));
});
