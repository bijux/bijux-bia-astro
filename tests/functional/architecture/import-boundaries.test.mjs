import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectImports } from '../../../scripts/verification/import-boundaries.mjs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
test('application imports resolve without runtime cycles or ownership violations', async () => {
    const report = await inspectImports();
    assert(report.files > 0);
    assert.deepEqual(report.issues, []);
});

test('type declarations erase dependencies while empty and named-type imports retain module effects', async t => {
    const directory = new URL('../../../artifacts/import-boundary-tests/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const root = await mkdtemp(fileURLToPath(directory));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(`${root}/src`);
    await writeFile(`${root}/src/b.ts`, "export type { A } from './a';\nexport type B = string;\n");
    for (const declaration of ["export type { B } from './b';", "import type { B } from './b';"]) {
        await writeFile(`${root}/src/a.ts`, `${declaration}\nexport type A = string;\n`);
        assert.deepEqual((await inspectImports(root)).issues, []);
    }
    await writeFile(`${root}/src/b.ts`, "import './a';\nexport type B = string;\n");
    for (const declaration of ["import {} from './b';", "import { type B } from './b';", "export { type B } from './b';"]) {
        await writeFile(`${root}/src/a.ts`, `${declaration}\nexport type A = string;\n`);
        assert((await inspectImports(root)).issues.some(issue => issue.startsWith('Runtime import cycle:')), declaration);
    }
    await writeFile(`${root}/src/a.ts`, 'export {};');
    await writeFile(`${root}/src/client.astro`, '<script>import(`fs/promises`);</script>');
    assert((await inspectImports(root)).issues.some(issue => issue.includes('browser imports fs/promises')));
});
