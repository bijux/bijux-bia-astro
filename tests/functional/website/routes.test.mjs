import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
test('published page sources retain their route paths', async () => {
    const actual = (await readdir(new URL('src/pages/', root), { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile()).map(entry => path.relative(fileURLToPath(new URL('src/pages/', root)), path.join(entry.parentPath, entry.name))).sort();
    const expected = JSON.parse(await readFile(new URL('tests/fixtures/website/routes.json', root), 'utf8'));
    assert.deepEqual(actual, expected);
});
