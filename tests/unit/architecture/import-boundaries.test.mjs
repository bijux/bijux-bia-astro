import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundaryIssues } from '../../../scripts/verification/import-boundaries.mjs';
test('the architecture gate rejects a cycle, API presentation imports and browser-only Node dependencies', () => {
    const graph = new Map([
        ['src/server/host.mjs', { targets: ['scripts/deployment/manifest.mjs'], specifiers: [] }],
        ['src/api/client.mjs', { targets: ['src/features/images/viewers.mjs'], specifiers: [] }],
        ['src/features/images/viewers.mjs', { targets: ['src/api/client.mjs'], specifiers: ['node:fs'] }],
    ]);
    const issues = boundaryIssues(graph, ['src/features/images/viewers.mjs']);
    assert(issues.some(issue => issue.includes('Runtime import cycle')));
    assert(issues.some(issue => issue.includes('production runtime imports build tool')));
    assert(issues.some(issue => issue.includes('API imports presentation')));
    assert(issues.some(issue => issue.includes('browser imports node:fs')));
});

test('browser dependencies reject both spellings of Node built-ins, including subpaths', () => {
    for (const specifier of ['node:fs', 'fs', 'fs/promises', 'node:test', 'astro:env/server']) {
        const graph = new Map([['src/features/search/client.mjs', { targets: [], specifiers: [specifier] }]]);
        assert.deepEqual(boundaryIssues(graph, [...graph.keys()]), [`src/features/search/client.mjs: browser imports ${specifier}`]);
    }
    assert.deepEqual(boundaryIssues(new Map([['src/client.mjs', { targets: [], specifiers: ['jquery'] }]]), ['src/client.mjs']), []);
});

test('feature presentation receives loaded data instead of importing the API client', () => {
    const graph = new Map([
        ['src/features/studies/StudyPage.astro', { targets: ['src/api/client.mjs'], specifiers: [] }],
    ]);
    assert.deepEqual(boundaryIssues(graph), ['src/features/studies/StudyPage.astro: presentation imports API client src/api/client.mjs']);
});
